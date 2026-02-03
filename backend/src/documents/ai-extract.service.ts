import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';

export interface ExtractedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // negative = expense (for installments = the payment made, e.g. -650)
  categorySlug?: string;
  totalAmount?: number; // for installments: full price (e.g. 1950)
  installmentCurrent?: number; // e.g. 2 (payment 2 of 3)
  installmentTotal?: number; // e.g. 3
}

/** Sign hint from layout/keywords – used to force correct income vs expense. */
export type SignHint = 'income' | 'expense' | 'unknown';

/** Per-line sign hints from deterministic preprocessor (layout + Hebrew keywords). */
export interface SignHints {
  /** Line index in original text (or logical row) → suggested sign for that row's amount(s). */
  byLine: Map<number, SignHint>;
  /** When a line has TWO amounts: [incomeAmount, expenseAmount] – so we can assign sign by position. */
  twoAmountsByLine: Map<number, { income: number; expense: number }>;
}

// Hebrew keywords: income vs expense (substring match)
// ONLY use keywords that are UNAMBIGUOUS. Many terms can be either income or expense
// depending on context (e.g., הוראת קבע can be money coming IN or going OUT).
// 
// CLEARLY INCOME (no ambiguity):
const INCOME_KEYWORDS = [
  'משכורת', 'שכר',           // salary - always income
  'קצבת ילדים', 'קצבת זקנה', // government allowances
  'ביטוח לאומי ג', 'בטוח לאומי ג', // ביטוח לאומי גמלה = payout (income)
  'מ.א.', 'מ.א ', 'אפרויה בע', // known employer names for salary
];
// CLEARLY EXPENSE (no ambiguity):
const EXPENSE_KEYWORDS = [
  'חיוב', 'משיכה',           // charge, withdrawal - always expense
  'העב\' לאחר', 'העברה לאחר', // transfer TO another = expense
  'עמ\'הקצאת אשראי', 'הקצאת אשראי', // credit allocation fee
  'כאל', 'מקס איט פיננסי', 'לאומי קארד', 'ישראכרט', 'אמריקן אקספרס', 'CAL', // credit card companies
  'איט פיננסי', 'On איט פיננסי', 'מקס איט',
  'דמי ניהול', 'עמלה', 'עמלת', // fees
  'שיק',                      // check payment = expense
];
// AMBIGUOUS - NOT in either list (AI must use judgment):
// - הוראת קבע / הו"ק (standing order: can be income OR expense)
// - העברה, העברה-נייד, bit (transfer: can be in OR out)
// - זיכוי (credit: usually income, but context matters)
// - ביטוח לאומי (without ג׳ = payment TO them = expense)
// - החזר (refund: usually income, but could be you refunding someone)
// - תשלום (payment: usually expense, but "תשלום שהתקבל" = income)

/**
 * AI extraction: parse OCR text into structured transactions using OpenAI.
 * Uses a deterministic preprocessor (layout + Hebrew keywords) to fix income vs expense before/after AI.
 */
@Injectable()
export class AiExtractService {
  private openai: OpenAI | null = null;

  private getClient(): OpenAI | null {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    if (!this.openai) this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  /**
   * Deterministic sign hints from layout and keywords.
   * Israeli bank convention: two amount columns per row → first column = income (green), second = expense (red).
   */
  getSignHints(ocrText: string): SignHints {
    const byLine = new Map<number, SignHint>();
    const twoAmountsByLine = new Map<number, { income: number; expense: number }>();
    const lines = ocrText.split(/\n/).filter((l) => l.trim().length > 0);
    const dateRe = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/;
    const amountPattern = /\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWithoutDate = line.replace(dateRe, ' ');
      const amountStrs = lineWithoutDate.match(amountPattern) || [];
      const amounts = amountStrs
        .map((s) => parseFloat(s.replace(/,/g, '')))
        .filter((n) => n >= 0.01 && n <= 100000);
      const priceLike = amounts.filter((n) => n > 100 || (n !== Math.floor(n)));
      const candidates = priceLike.length >= 1 ? priceLike : amounts;

      if (candidates.length >= 2) {
        // Two amounts on line: DON'T ASSUME which is income/expense.
        // Bank statements have separate columns, but OCR order is unreliable (RTL/LTR).
        // Instead, check if ONE amount is zero (meaning only one transaction).
        const nonZero = candidates.filter((n) => n >= 0.01);
        if (nonZero.length === 1) {
          // Only one real amount - treat as single-amount line
          const desc = line.replace(dateRe, ' ').replace(amountPattern, ' ').replace(/\s+/g, ' ').trim();
          const hasIncome = INCOME_KEYWORDS.some((k) => desc.includes(k));
          const hasExpense = EXPENSE_KEYWORDS.some((k) => desc.includes(k));
          if (hasIncome && !hasExpense) byLine.set(i, 'income');
          else if (hasExpense && !hasIncome) byLine.set(i, 'expense');
          else byLine.set(i, 'unknown');
          continue;
        }
        // Two real amounts: could be income+expense columns, but we can't reliably tell which is which.
        // Let AI figure it out based on context.
        byLine.set(i, 'unknown');
        continue;
      }

      if (candidates.length === 1) {
        const desc = line.replace(dateRe, ' ').replace(amountPattern, ' ').replace(/\s+/g, ' ').trim();
        const hasIncome = INCOME_KEYWORDS.some((k) => desc.includes(k));
        const hasExpense = EXPENSE_KEYWORDS.some((k) => desc.includes(k));
        if (hasIncome && !hasExpense) byLine.set(i, 'income');
        else if (hasExpense && !hasIncome) byLine.set(i, 'expense');
        else byLine.set(i, 'unknown');
      }
    }
    return { byLine, twoAmountsByLine };
  }

  /**
   * Build annotated text for AI: add [INCOME_AMT=X] [EXPENSE_AMT=Y] or [SIGN=INCOME/EXPENSE/UNKNOWN] per line
   * so the model does not have to guess from "green/red" (which it cannot see in plain text).
   */
  private buildAnnotatedText(ocrText: string, hints: SignHints): string {
    const lines = ocrText.split(/\n/).filter((l) => l.trim().length > 0);
    const dateRe = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/;
    const amountPattern = /\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?/g;
    const out: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const two = hints.twoAmountsByLine.get(i);
      const signHint = hints.byLine.get(i);

      if (two) {
        const prefix = `[INCOME_AMT=${two.income}] [EXPENSE_AMT=${two.expense}]`;
        out.push(`${prefix} | ${line}`);
        continue;
      }
      const lineWithoutDate = line.replace(dateRe, ' ');
      const amountStrs = lineWithoutDate.match(amountPattern) || [];
      const amounts = amountStrs.map((s) => parseFloat(s.replace(/,/g, ''))).filter((n) => n >= 0.01 && n <= 100000);
      const priceLike = amounts.filter((n) => n > 100 || n !== Math.floor(n));
      const cand = priceLike.length >= 1 ? priceLike : amounts;
      if (cand.length === 1) {
        const sign = signHint === 'income' ? 'INCOME' : signHint === 'expense' ? 'EXPENSE' : 'UNKNOWN';
        out.push(`[SIGN=${sign} AMT=${cand[0]}] | ${line}`);
      } else {
        out.push(line);
      }
    }
    return out.join('\n');
  }

  async extractTransactions(
    ocrText: string,
    userContext?: string,
  ): Promise<ExtractedTransaction[]> {
    const hints = this.getSignHints(ocrText);
    const annotated = this.buildAnnotatedText(ocrText, hints);

    const client = this.getClient();
    if (!client) {
      return this.fallbackExtractWithHints(ocrText, hints);
    }

    const system = `You are an expert Israeli bank statement parser. Extract transactions with HIGH ACCURACY.

SIGN RULES (CRITICAL):
• [SIGN=INCOME AMT=X]: This IS income. Return amount = +X (positive).
• [SIGN=EXPENSE AMT=X]: This IS expense. Return amount = -X (negative).
• [SIGN=UNKNOWN AMT=X]: Analyze the description carefully:
  INCOME (+): משכורת, שכר, זיכוי, קצבה, ביטוח לאומי ג׳ (payout)
  EXPENSE (-): חיוב, משיכה, הו"ק (הוראת קבע), העברה, הלוואה, ריבית, עמלה, כאל, מקס, לאומי קארד
  DEFAULT: If unsure, use NEGATIVE (most bank transactions are expenses).

=== DESCRIPTION RULES (VERY IMPORTANT) ===
• Copy the FULL Hebrew description from the source. Include ALL words.
• Common patterns to preserve:
  - "הו"ק הלוי רבית" = standing order for loan interest
  - "הו"ק הלואה קרן" = standing order for loan principal
  - "העברה-נייד" = mobile transfer
  - "העב' לאחר-נייד" = transfer to another via mobile
  - "מ.א. [company name]" = employer (salary)
• Remove ONLY: dates like "תאריך ערך: 01/01", page headers, filter text
• NEVER output single letters or broken text. If you can't read it, use the amount context.
• NEVER use Latin letters in description - only Hebrew, numbers, punctuation.

=== CATEGORY RULES (BE SPECIFIC, NOT LAZY) ===
Use these EXACT slugs (all lowercase with underscores):

INCOME categories:
• salary - משכורת, שכר, מ.א. [company]

EXPENSE categories:
• loan_payment - הלואה, הלוואה, קרן הלואה, הו"ק הלואה
• loan_interest - ריבית, הלוי רבית, ריבית הלואה
• credit_charges - כאל, מקס איט, לאומי קארד, ישראכרט, אמריקן אקספרס (credit card company charges)
• bank_fees - דמי ניהול, עמלת, עמלה בנק, הקצאת אשראי
• transfers - העברה, העברה-נייד, bit, פייבוקס (money transfers)
• standing_order - הוראת קבע, הו"ק (when not loan/specific bill)
• utilities - חשמל, גז, מים, ארנונה, עירייה
• insurance - ביטוח, פוליסה
• pension - פנסיה, גמל, קופת גמל, מיטב דש
• groceries - סופרמרקט, שופרסל, רמי לוי, מגה, ויקטורי
• transport - דלק, רכבת, אגד, דן, חניה
• dining - מסעדה, קפה, בית קפה, פיצה
• shopping - קניות, חנות, רשת
• healthcare - בריאות, מכבי, כללית, לאומית, מאוחדת, קופת חולים
• entertainment - בידור, סרט, הופעה

NEVER use "unknown", "finance", "other" unless truly nothing else fits.
Read the Hebrew carefully - "הו"ק הלוי רבית" is loan_interest, NOT transfers!

=== OUTPUT FORMAT ===
JSON: { "transactions": [{ "date": "YYYY-MM-DD", "description": "full Hebrew text", "amount": number, "categorySlug": "exact_slug" }] }
Include installment fields when relevant: totalAmount, installmentCurrent, installmentTotal.
Extract EVERY transaction row. Never skip.`;

    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      let userContent = `Extract transactions. Each row is pre-annotated with [INCOME_AMT]/[EXPENSE_AMT] or [SIGN=... AMT=...]. Use these signs exactly.\n\n${annotated.slice(0, 14000)}`;
      if (userContext?.trim()) {
        userContent += `\n\n---\nUser preferences (if a description was categorized as "salary", use categorySlug "salary" and POSITIVE amount):\n${userContext.trim().slice(0, 2000)}`;
      }
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) return this.fallbackExtractWithHints(ocrText, hints);
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed.transactions) ? parsed.transactions : Array.isArray(parsed) ? parsed : [];
      const today = new Date().toISOString().slice(0, 10);
      // Accept any slug that looks valid (lowercase, a-z, underscores) – the backend will create categories if needed
      const isValidSlug = (s: string | undefined) => s && /^[a-z][a-z0-9_]*$/.test(s) && s.length <= 50;
      const mapped = list.map((t: Record<string, unknown>) => {
        let date = String(t.date || '').trim();
        if (!date || date === today) date = today;
        let amount = Number(t.amount) || 0;
        if (amount !== 0) amount = amount > 0 ? Math.abs(amount) : -Math.abs(amount);
        const rawSlug = t.categorySlug ? String(t.categorySlug).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') : undefined;
        const slug = isValidSlug(rawSlug) ? rawSlug : 'other';
        const totalAmount = t.totalAmount != null ? Number(t.totalAmount) : undefined;
        const installmentCurrent = t.installmentCurrent != null ? Math.max(1, Math.floor(Number(t.installmentCurrent))) : undefined;
        const installmentTotal = t.installmentTotal != null ? Math.max(1, Math.floor(Number(t.installmentTotal))) : undefined;
        return {
          date,
          description: String(t.description || '').trim().slice(0, 300),
          amount,
          categorySlug: slug,
          ...(totalAmount != null && totalAmount > 0 && { totalAmount }),
          ...(installmentCurrent != null && { installmentCurrent }),
          ...(installmentTotal != null && { installmentTotal }),
        };
      });
      const fixed = this.applySignHintsOverlay(mapped, ocrText, hints);
      const withCleanDesc = fixed.map((t) => ({ ...t, description: this.sanitizeDescription(t.description) }));
      return this.fixInstallmentAmounts(withCleanDesc).filter((t: ExtractedTransaction) => Math.abs(t.amount) >= 0.01);
    } catch {
      return this.fallbackExtractWithHints(ocrText, hints);
    }
  }

  /**
   * Extract transactions using GPT-4o Vision API - sends image directly without OCR.
   * This is much more accurate for images as the AI can see colors, layout, and Hebrew text directly.
   */
  async extractWithVision(imagePath: string, userContext?: string): Promise<ExtractedTransaction[]> {
    const client = this.getClient();
    if (!client) {
      console.warn('[AI-Extract] No OpenAI client, Vision extraction unavailable');
      return [];
    }

    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 
                     imagePath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';

    const systemPrompt = `You are an expert Israeli bank statement parser. Extract ALL transactions from this bank statement image.

CRITICAL RULES:

1) INCOME vs EXPENSE - Look at the COLORS and COLUMNS:
   - GREEN text or amounts in "זכות" (credit) column = INCOME (positive amount)
   - RED text or amounts in "חובה" (debit) column = EXPENSE (negative amount)
   - If you see two amount columns, left is usually expense, right is usually income
   - Look for +/- signs near amounts

2) DESCRIPTION - Copy the FULL Hebrew text exactly:
   - Include the complete transaction description
   - "הו"ק הלוי רבית" = standing order for loan interest
   - "הו"ק הלואה קרן" = standing order for loan principal
   - "מ.א. [company]" = employer (salary)
   - NEVER truncate or abbreviate descriptions
   - NEVER return single letters like "א" or broken text

3) CATEGORY - Use these EXACT slugs:
   INCOME: salary (משכורת)
   EXPENSES:
   - loan_payment (הלואה, קרן הלואה)
   - loan_interest (ריבית, הלוי רבית)
   - credit_charges (כאל, מקס איט, לאומי קארד, ישראכרט)
   - bank_fees (דמי ניהול, עמלה, הקצאת אשראי)
   - transfers (העברה, bit, פייבוקס)
   - standing_order (הוראת קבע - when not loan/specific bill)
   - utilities (חשמל, גז, מים, ארנונה)
   - insurance (ביטוח)
   - pension (פנסיה, גמל)
   - groceries (סופרמרקט)
   - transport (דלק, רכבת)
   - dining (מסעדה, קפה)
   - shopping (קניות, חנות)
   - healthcare (קופת חולים, רופא)

4) DATE - Extract the date for each row (DD/MM/YY or DD/MM/YYYY), convert to YYYY-MM-DD.

5) COMPLETENESS - Extract EVERY visible transaction. Never skip rows. Never invent transactions that aren't visible.

Output JSON: { "transactions": [{ "date": "YYYY-MM-DD", "description": "full Hebrew description", "amount": number, "categorySlug": "slug" }] }

For installments include: totalAmount, installmentCurrent, installmentTotal`;

    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      let userMessage = 'Extract all transactions from this Israeli bank statement image. Pay close attention to colors (green=income, red=expense) and column positions.';
      if (userContext?.trim()) {
        userMessage += `\n\nUser preferences:\n${userContext.trim().slice(0, 2000)}`;
      }

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: 'high', // Use high detail for better text recognition
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        console.warn('[AI-Extract] Vision API returned no content');
        return [];
      }

      console.log('[AI-Extract] Vision API response:', content.slice(0, 500));
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed.transactions) ? parsed.transactions : Array.isArray(parsed) ? parsed : [];
      console.log('[AI-Extract] Vision API extracted', list.length, 'transactions');
      
      const today = new Date().toISOString().slice(0, 10);
      const isValidSlug = (s: string | undefined) => s && /^[a-z][a-z0-9_]*$/.test(s) && s.length <= 50;

      const results: ExtractedTransaction[] = list.map((t: Record<string, unknown>) => {
        let date = String(t.date || '').trim();
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today;
        
        let amount = Number(t.amount) || 0;
        const rawSlug = t.categorySlug ? String(t.categorySlug).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') : undefined;
        const slug = isValidSlug(rawSlug) ? rawSlug : 'other';
        
        const totalAmount = t.totalAmount != null ? Number(t.totalAmount) : undefined;
        const installmentCurrent = t.installmentCurrent != null ? Math.max(1, Math.floor(Number(t.installmentCurrent))) : undefined;
        const installmentTotal = t.installmentTotal != null ? Math.max(1, Math.floor(Number(t.installmentTotal))) : undefined;

        return {
          date,
          description: String(t.description || 'לא ידוע').trim().slice(0, 300),
          amount,
          categorySlug: slug,
          ...(totalAmount != null && totalAmount > 0 && { totalAmount }),
          ...(installmentCurrent != null && { installmentCurrent }),
          ...(installmentTotal != null && { installmentTotal }),
        };
      });

      // Filter out invalid transactions
      return this.fixInstallmentAmounts(results).filter((t) => Math.abs(t.amount) >= 0.01);
    } catch (err) {
      console.error('[AI-Extract] Vision extraction error:', err);
      return [];
    }
  }

  /**
   * Remove or fix OCR gibberish in description: Latin letters that shouldn't be there, common misreads.
   */
  private sanitizeDescription(desc: string): string {
    if (!desc || !desc.trim()) return 'לא ידוע';
    let s = desc.trim();
    
    // Remove dates that shouldn't be in description
    s = s.replace(/\(?\s*תאריך\s*ערך[:\s]*\d{1,2}[\/\.]\d{1,2}[\/\.]?\d{0,4}\s*\)?/gi, '');
    s = s.replace(/\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}/g, ''); // DD/MM/YY
    
    // Common OCR errors: Latin in place of Hebrew
    s = s.replace(/xn\s*fe/gi, 'מ.א');
    s = s.replace(/mawn\s*BE-?/gi, 'העברה-נייד');
    s = s.replace(/THANK\?\s*wn\s*\d*/gi, "העב' לאחר-נייד");
    
    // Only remove LONG Latin sequences (3+ letters), keep short ones that might be part of Hebrew text
    s = s.replace(/\b[a-zA-Z]{3,}\b/g, '');
    
    // Clean up whitespace
    s = s.replace(/\s+/g, ' ').trim();
    
    // Remove leading/trailing punctuation
    s = s.replace(/^[\s\-=:,."']+/, '').replace(/[\s\-=:,."']+$/, '').trim();
    
    // If result is too short or empty, return default
    if (s.length < 2) return 'לא ידוע';
    
    return s.slice(0, 300);
  }

  /**
   * Overlay sign hints on AI output: for each transaction, if we have a strong hint (income/expense from
   * two-column layout or keyword), force the sign so we never end up with salary as expense.
   */
  private applySignHintsOverlay(
    transactions: ExtractedTransaction[],
    ocrText: string,
    hints: SignHints,
  ): ExtractedTransaction[] {
    const lines = ocrText.split(/\n/).filter((l) => l.trim().length > 0);
    const dateRe = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/;
    const amountPattern = /\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?/g;
    let lastDate = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dateMatch = line.match(dateRe);
      if (dateMatch) {
        const [, d, m, y] = dateMatch;
        const year = (y!.length === 2 ? `20${y}` : y!) as string;
        lastDate = `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
      }

      const two = hints.twoAmountsByLine.get(i);
      const signHint = hints.byLine.get(i);
      if (two) {
        for (const t of transactions) {
          const abs = Math.abs(t.amount);
          if (Math.abs(abs - two.income) < 0.02 && t.amount < 0) t.amount = two.income;
          if (Math.abs(abs - two.expense) < 0.02 && t.amount > 0) t.amount = -two.expense;
        }
        continue;
      }
      if ((signHint === 'income' || signHint === 'expense') && lastDate) {
        const lineWithoutDate = line.replace(dateRe, ' ');
        const amountStrs = lineWithoutDate.match(amountPattern) || [];
        const amounts = amountStrs.map((s) => parseFloat(s.replace(/,/g, ''))).filter((n) => n >= 0.01 && n <= 100000);
        const priceLike = amounts.filter((n) => n > 100 || n !== Math.floor(n));
        const cand = priceLike.length >= 1 ? priceLike : amounts;
        if (cand.length === 1) {
          const expectedAbs = cand[0];
          const wrongSign = signHint === 'income' ? (t: ExtractedTransaction) => t.amount < 0 : (t: ExtractedTransaction) => t.amount > 0;
          const fix = signHint === 'income' ? (t: ExtractedTransaction) => { t.amount = expectedAbs; } : (t: ExtractedTransaction) => { t.amount = -expectedAbs; };
          const idx = transactions.findIndex((t) => t.date === lastDate && Math.abs(Math.abs(t.amount) - expectedAbs) < 0.02 && wrongSign(t));
          if (idx >= 0) fix(transactions[idx]);
        }
      }
    }
    return transactions;
  }

  /** Fallback extraction using only layout + keywords (no AI). */
  private fallbackExtractWithHints(ocrText: string, hints: SignHints): ExtractedTransaction[] {
    const lines = ocrText.split(/\n/).filter((l) => l.trim().length > 0);
    const dateRe = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/;
    const amountPattern = /\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?/g;
    const today = new Date().toISOString().slice(0, 10);
    const results: ExtractedTransaction[] = [];
    let lastDate = today;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dateMatch = line.match(dateRe);
      if (dateMatch) {
        const [, d, m, y] = dateMatch;
        const year = (y!.length === 2 ? `20${y}` : y!) as string;
        lastDate = `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
      }

      const two = hints.twoAmountsByLine.get(i);
      if (two) {
        if (two.income >= 0.01) {
          const rawDesc = line.replace(dateRe, ' ').replace(amountPattern, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Unknown';
          results.push({ date: lastDate, description: this.sanitizeDescription(rawDesc), amount: two.income, categorySlug: 'other' });
        }
        if (two.expense >= 0.01) {
          const rawDesc = line.replace(dateRe, ' ').replace(amountPattern, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Unknown';
          results.push({ date: lastDate, description: this.sanitizeDescription(rawDesc), amount: -two.expense, categorySlug: 'other' });
        }
        continue;
      }

      const signHint = hints.byLine.get(i);
      const lineWithoutDate = line.replace(dateRe, ' ');
      const amountStrs = lineWithoutDate.match(amountPattern) || [];
      const amounts = amountStrs.map((s) => parseFloat(s.replace(/,/g, ''))).filter((n) => n >= 0.01 && n <= 100000);
      const priceLike = amounts.filter((n) => n > 100 || n !== Math.floor(n));
      const cand = priceLike.length >= 1 ? priceLike : amounts;
      if (cand.length === 0) continue;
      const amount = Math.max(...cand);

      const rawDesc = line.replace(dateRe, ' ').replace(amountPattern, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Unknown';
      const sign = signHint === 'income' ? 1 : signHint === 'expense' ? -1 : -1; // unknown default expense
      results.push({ date: lastDate, description: this.sanitizeDescription(rawDesc), amount: sign * amount, categorySlug: 'other' });
    }
    return this.fixInstallmentAmounts(results);
  }

  /** If amount was wrongly set to total (full price), replace with the actual payment: totalAmount / installmentTotal. */
  private fixInstallmentAmounts(items: ExtractedTransaction[]): ExtractedTransaction[] {
    return items.map((t) => {
      const total = t.totalAmount;
      const totalPayments = t.installmentTotal;
      if (total == null || total <= 0 || totalPayments == null || totalPayments < 1) return t;
      const absAmount = Math.abs(t.amount);
      if (absAmount < total * 0.99) return t; // amount is already the payment, not the total
      const paymentPerInstallment = Math.round((total / totalPayments) * 100) / 100;
      return { ...t, amount: -paymentPerInstallment };
    });
  }

  /** Regex-based fallback: extract date and amount per line. For installments (X מתוך Y), amount = X (payment made), totalAmount = Y. */
  private fallbackExtract(ocrText: string): ExtractedTransaction[] {
    const lines = ocrText.split(/\n/).filter((l) => l.trim().length > 0);
    const today = new Date().toISOString().slice(0, 10);
    const results: ExtractedTransaction[] = [];
    const dateRe = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/;
    const amountPattern = /\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?/g;
    const mitochRe = /(\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?)\s*מתוך\s*(\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?)/g;
    const installmentNumRe = /(\d+)\s*מתוך\s*(\d+)/g;
    let lastDate = today;

    for (const line of lines) {
      const dateMatch = line.match(dateRe);
      if (dateMatch) {
        const [, d, m, y] = dateMatch;
        const year = y!.length === 2 ? `20${y}` : y;
        lastDate = `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
      }

      const lineWithoutDate = line.replace(dateRe, ' ');
      let amount = 0;
      let totalAmount: number | undefined;
      let installmentCurrent: number | undefined;
      let installmentTotal: number | undefined;

      const mitochMoney = [...lineWithoutDate.matchAll(mitochRe)];
      const mitochNum = [...line.matchAll(installmentNumRe)];

      // Only treat "X מתוך Y" as MONEY when at least one number looks like a price (decimals or > 100).
      // Otherwise "2 מתוך 3" (installment 2 of 3) would be wrongly used as amount=2, totalAmount=3.
      if (mitochMoney.length >= 1) {
        const pairs = mitochMoney.map((m) => [parseFloat(m[1].replace(/,/g, '')), parseFloat(m[2].replace(/,/g, ''))] as [number, number]);
        const looksLikePrice = (n: number) => n > 100 || (n !== Math.floor(n));
        const currencyLike = pairs.filter(
          ([a, b]) =>
            (looksLikePrice(a) || looksLikePrice(b)) &&
            a >= 0.01 &&
            a <= 100000 &&
            b >= 0.01 &&
            b <= 100000,
        );
        if (currencyLike.length > 0) {
          const [pay, total] = currencyLike[0];
          amount = Math.min(pay, total);
          totalAmount = Math.max(pay, total);
        }
      }
      if (mitochNum.length >= 1) {
        const nums = mitochNum.map((m) => [parseInt(m[1], 10), parseInt(m[2], 10)] as [number, number]);
        const valid = nums.filter(([a, b]) => a >= 1 && a <= b && b <= 120); // current <= total, e.g. 2/3 not 3/1
        if (valid.length > 0) {
          const [cur, tot] = valid[0];
          installmentCurrent = cur;
          installmentTotal = tot;
        }
      }

      if (amount <= 0) {
        const amountMatches = lineWithoutDate.match(amountPattern) || [];
        const withDecimals = amountMatches.filter((s) => /\.\d{2}$/.test(s) || /,\d{2}$/.test(s));
        let candidates = (withDecimals.length > 0 ? withDecimals : amountMatches)
          .map((s) => parseFloat(s.replace(/,/g, '')))
          .filter((n) => n >= 0.01 && n <= 100000);
        // For installments, avoid using small integers (2, 9, 4) as amount – they're often installment numbers.
        if (line.includes('מתוך') && candidates.length > 1) {
          const priceLike = candidates.filter((n) => n > 100 || n !== Math.floor(n));
          if (priceLike.length > 0) candidates = priceLike;
        }
        amount = candidates.length > 0 ? (line.includes('מתוך') ? Math.min(...candidates) : Math.max(...candidates)) : 0;
      }
      if (amount <= 0) continue;

      const desc = line
        .replace(dateRe, ' ')
        .replace(amountPattern, ' ')
        .replace(mitochRe, ' ')
        .replace(installmentNumRe, ' ')
        .replace(/\d+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200) || 'Unknown';

      results.push({
        date: lastDate,
        description: desc,
        amount: -Math.abs(amount),
        categorySlug: 'other',
        ...(totalAmount != null && { totalAmount }),
        ...(installmentCurrent != null && { installmentCurrent }),
        ...(installmentTotal != null && { installmentTotal }),
      });
    }
    return this.fixInstallmentAmounts(results);
  }
}
