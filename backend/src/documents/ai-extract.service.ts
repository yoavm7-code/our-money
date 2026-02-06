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
• Copy only the operation/action text in Hebrew (e.g. הוראת קבע, הו"ק הלואה קרן, ביטוח לאומי ג).
• Do NOT include: the amount (e.g. 8,000.00), value date (תאריך ערך: 01/01), or the words "Income"/"Expense".
• Preserve: "הו"ק הלוי רבית", "הו"ק הלואה קרן", "העברה-נייד", "מ.א. [company]" = employer.
• NEVER output single letters or broken text. NEVER add numbers or "Income"/"Expense" to description.
• Only Hebrew and punctuation in description; no Latin letters.

=== CATEGORY RULES (BE SPECIFIC, NOT LAZY) ===
Use these EXACT slugs (all lowercase with underscores):

INCOME categories:
• salary - משכורת, שכר, מ.א. [company]
• income - קצבת ילדים, ביטוח לאומי ג, and other generic income

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
      const withSignFix = this.applySignCorrectionSafetyNet(withCleanDesc);
      const withCategorySign = this.applySignFromCategory(withSignFix);
      return this.fixInstallmentAmounts(withCategorySign).filter((t: ExtractedTransaction) => Math.abs(t.amount) >= 0.01);
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

=== STEP 1: UNDERSTAND THE TABLE ===
Israeli bank statements have a table with these columns: תאריך (date), הפעולה (operation), חובה (debit), זכות (credit).
The two amount columns are "חובה" (debit = expense) and "זכות" (credit = income).
Each row has the amount in ONLY ONE of these two columns (the other is empty).

=== STEP 2: HOW TO TELL זכות FROM חובה (MOST IMPORTANT) ===
The MOST RELIABLE way to determine income vs expense is the TEXT COLOR of the amount number:
- GREEN colored amount numbers → זכות (credit) = INCOME
- RED colored amount numbers → חובה (debit) = EXPENSE
Look at the actual rendered color of each number in the image. This is the PRIMARY indicator.
As a secondary check, verify which column header the number is positioned under.

=== STEP 3: FOR EACH ROW ===
1) DATE: Read the date. Ignore Hebrew weekday prefix (ב', ה', א' = weekday abbreviation, NOT part of the date). Convert DD/MM/YY to YYYY-MM-DD (assume 20xx).
2) DESCRIPTION: Copy the operation text in Hebrew only (e.g. הוראת קבע, הו"ק הלואה קרן, מ.א. אפרויה בע).
   - Do NOT include amounts, value dates (תאריך ערך: ...), or "Income"/"Expense".
   - "מ.א." + company = employer (salary). "הו"ק הלוי רבית" = loan interest. "הו"ק הלואה קרן" = loan principal.
3) AMOUNT: Read as a positive number (e.g. 8000.00, 712, 136.34). Always positive.
4) COLUMN: Set based on the amount's text color:
   - Green text → "column": "זכות"
   - Red text → "column": "חובה"
   This field determines income vs expense. Double-check the color for every row.
5) COLOR: Output the observed text color of the amount as "green" or "red" (for debugging).
6) CATEGORY: Assign a category slug.

=== STEP 4: CATEGORY SLUGS ===
INCOME: salary (משכורת, שכר, מ.א. [company name]), income (קצבת ילדים, ביטוח לאומי ג, and other generic income)
EXPENSES:
- loan_payment (הלואה, קרן הלואה, הו"ק הלואה קרן)
- loan_interest (ריבית, הלוי רבית, הו"ק הלוי רבית)
- credit_charges (כאל, מקס איט, לאומי קארד, ישראכרט, מקס איט פיננסי)
- bank_fees (דמי ניהול, עמלה, הקצאת אשראי)
- transfers (העברה, העברה-נייד, העב' לאחר-נייד, bit, פייבוקס)
- standing_order (הוראת קבע, הו"ק - when not a loan or specific bill)
- utilities (חשמל, גז, מים, ארנונה)
- insurance (ביטוח)
- pension (פנסיה, גמל, מיטב דש)
- groceries (סופרמרקט)
- transport (דלק, רכבת)
- dining (מסעדה, קפה)
- shopping (קניות, חנות)
- healthcare (קופת חולים, רופא)

=== STEP 5: COMPLETENESS ===
Extract EVERY visible transaction row. Never skip rows. Never merge two rows into one. Never invent rows.
Each row in the bank table = exactly one object in your output array.

=== OUTPUT FORMAT ===
Output valid JSON:
{ "transactions": [{ "date": "YYYY-MM-DD", "description": "Hebrew text only", "amount": <positive number>, "column": "זכות" or "חובה", "color": "green" or "red", "categorySlug": "slug" }] }
For installments include: totalAmount, installmentCurrent, installmentTotal.
The "column" and "color" fields are MANDATORY for every transaction.`;

    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      let userMessage = 'Extract all transactions from this bank statement image. For EACH row: 1) Read the date (ignore Hebrew weekday prefix). 2) Read the description. 3) Read the amount as a POSITIVE number. 4) Look at the TEXT COLOR of the amount number: GREEN = זכות (income), RED = חובה (expense). Set "column" and "color" accordingly. Color detection is the most important part – do not guess from the description, look at the actual color of each number in the image.';
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
        max_completion_tokens: 16384,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        console.warn('[AI-Extract] Vision API returned no content');
        return [];
      }

      console.log('[AI-Extract] Vision raw response length:', content.length);
      console.log('[AI-Extract] Vision raw response (first 2000 chars):', content.slice(0, 2000));

      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed.transactions) ? parsed.transactions : Array.isArray(parsed) ? parsed : [];
      console.log('[AI-Extract] Vision parsed transaction count:', list.length);

      // Log each transaction's column and color fields for debugging sign issues
      list.forEach((t: Record<string, unknown>, i: number) => {
        console.log(`[AI-Extract] Row ${i}: date=${t.date}, desc="${String(t.description || '').slice(0, 30)}", amount=${t.amount}, column=${t.column}, color=${t.color}, cat=${t.categorySlug}`);
      });
      
      const today = new Date().toISOString().slice(0, 10);
      const isValidSlug = (s: string | undefined) => s && /^[a-z][a-z0-9_]*$/.test(s) && s.length <= 50;

      const INCOME_SLUGS = new Set(['salary', 'income']);
      const EXPENSE_SLUGS = new Set(['loan_payment', 'loan_interest', 'credit_charges', 'bank_fees', 'fees', 'utilities', 'insurance', 'pension', 'groceries', 'transport', 'dining', 'shopping', 'healthcare', 'entertainment', 'other']);

      const results: ExtractedTransaction[] = list.map((t: Record<string, unknown>) => {
        let date = String(t.date || '').trim();
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today;

        const rawSlug = t.categorySlug ? String(t.categorySlug).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') : undefined;
        const slug: string = isValidSlug(rawSlug) ? (rawSlug as string) : 'other';

        const absAmount = Math.abs(Number(t.amount) || 0);
        const col = String(t.column || '').trim();
        const color = String(t.color || '').trim().toLowerCase();
        const isCredit = /זכות|credit/i.test(col);
        const isDebit = /חובה|debit/i.test(col);
        // Use color as additional signal: green = income, red = expense
        const isGreen = /green|ירוק/i.test(color);
        const isRed = /red|אדום/i.test(color);
        let amount: number;
        // Color takes priority if column and color disagree (color is more reliable from Vision)
        if (isGreen && isDebit) {
          // Color says income but column says expense → trust color
          console.warn(`[AI-Extract] Color/column mismatch for "${String(t.description || '').slice(0, 30)}": color=green but column=חובה → using green (income)`);
          amount = absAmount;
        } else if (isRed && isCredit) {
          // Color says expense but column says income → trust color
          console.warn(`[AI-Extract] Color/column mismatch for "${String(t.description || '').slice(0, 30)}": color=red but column=זכות → using red (expense)`);
          amount = -absAmount;
        } else if (isCredit || isGreen) {
          amount = absAmount;
        } else if (isDebit || isRed) {
          amount = -absAmount;
        } else if (INCOME_SLUGS.has(slug)) {
          amount = absAmount;
        } else if (EXPENSE_SLUGS.has(slug)) {
          amount = -absAmount;
        } else {
          amount = Number(t.amount) ?? 0;
        }

        const totalAmount = t.totalAmount != null ? Number(t.totalAmount) : undefined;
        const installmentCurrent = t.installmentCurrent != null ? Math.max(1, Math.floor(Number(t.installmentCurrent))) : undefined;
        const installmentTotal = t.installmentTotal != null ? Math.max(1, Math.floor(Number(t.installmentTotal))) : undefined;

        return {
          date,
          description: this.sanitizeDescription(String(t.description || 'לא ידוע').trim().slice(0, 300)),
          amount,
          categorySlug: slug,
          ...(totalAmount != null && totalAmount > 0 && { totalAmount }),
          ...(installmentCurrent != null && { installmentCurrent }),
          ...(installmentTotal != null && { installmentTotal }),
        };
      });

      // For Vision path: column field is the source of truth for sign.
      // Do NOT apply applySignFromCategory here – a wrong category must not override column-based sign.
      // Only apply the safety net for unambiguous markers (e.g. קצבת ילדים is always income).
      const withSignFix = this.applySignCorrectionSafetyNet(results);
      return this.fixInstallmentAmounts(withSignFix).filter((t) => Math.abs(t.amount) >= 0.01);
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

    // Remove value date and standalone dates
    s = s.replace(/\(?\s*תאריך\s*ערך[:\s]*\d{1,2}[\/\.]\d{1,2}[\/\.]?\d{0,4}\s*\)?/gi, '');
    s = s.replace(/\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}/g, '');

    // Remove amount-like numbers (e.g. 8,000.00, 3,820.00, 500.00 ש"ח) from description
    s = s.replace(/\s*\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?(?:\s*[₪ש"ח])?\s*/g, ' ');
    s = s.replace(/\s+\d+\.\d{2}\s*/g, ' ');

    // Remove " Income" / " Expense" (AI sometimes appends these)
    s = s.replace(/\s+Income\s*/gi, ' ').replace(/\s+Expense\s*/gi, ' ');

    // Common OCR errors: Latin in place of Hebrew
    s = s.replace(/xn\s*fe/gi, 'מ.א');
    s = s.replace(/mawn\s*BE-?/gi, 'העברה-נייד');
    s = s.replace(/THANK\?\s*wn\s*\d*/gi, "העב' לאחר-נייד");

    // Only remove LONG Latin sequences (3+ letters)
    s = s.replace(/\b[a-zA-Z]{3,}\b/g, '');

    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^[\s\-=:,."']+/, '').replace(/[\s\-=:,."']+$/, '').trim();

    if (s.length < 2) return 'לא ידוע';
    return s.slice(0, 300);
  }

  /** When category is clearly income or expense, set sign from it (used when column is missing or for OCR path). Do not use standing_order/transfers – they can be either. */
  private applySignFromCategory(transactions: ExtractedTransaction[]): ExtractedTransaction[] {
    const INCOME_SLUGS = new Set(['salary', 'income']);
    const EXPENSE_SLUGS = new Set(['loan_payment', 'loan_interest', 'credit_charges', 'bank_fees', 'fees', 'utilities', 'insurance', 'pension', 'groceries', 'transport', 'dining', 'shopping', 'healthcare', 'entertainment', 'other']);
    return transactions.map((t) => {
      const abs = Math.abs(t.amount);
      if (t.categorySlug && INCOME_SLUGS.has(t.categorySlug) && t.amount < 0) return { ...t, amount: abs };
      if (t.categorySlug && EXPENSE_SLUGS.has(t.categorySlug) && t.amount > 0) return { ...t, amount: -abs };
      return t;
    });
  }

  /** Safety net: fix sign ONLY for UNAMBIGUOUS descriptions. Do NOT flip "הוראת קבע" or "העברה" – they can be income OR expense; Vision/column decides. */
  private applySignCorrectionSafetyNet(transactions: ExtractedTransaction[]): ExtractedTransaction[] {
    const INCOME_MARKERS = ['קצבת ילדים', 'קצבת זקנה', 'ביטוח לאומי ג', 'בטוח לאומי ג', 'משכורת', 'שכר', 'זיכוי', 'מ.א.', 'מ.א '];
    const EXPENSE_MARKERS = ['חיוב', 'משיכה', 'כאל', 'מקס איט', 'לאומי קארד', 'ישראכרט', "הו\"ק הלו' רבית", 'הו"ק הלואה קרן', 'עמלת', 'דמי ניהול', 'הקצאת אשראי'];
    return transactions.map((t) => {
      const d = (t.description || '').trim();
      const abs = Math.abs(t.amount);
      if (t.amount < 0 && INCOME_MARKERS.some((m) => d.includes(m))) {
        return { ...t, amount: abs };
      }
      if (t.amount > 0 && EXPENSE_MARKERS.some((m) => d.includes(m))) {
        return { ...t, amount: -abs };
      }
      return t;
    });
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
        description: this.sanitizeDescription(desc),
        amount: -Math.abs(amount),
        categorySlug: 'other',
        ...(totalAmount != null && { totalAmount }),
        ...(installmentCurrent != null && { installmentCurrent }),
        ...(installmentTotal != null && { installmentTotal }),
      });
    }
    const withSignFix = this.applySignCorrectionSafetyNet(results);
    const withCategorySign = this.applySignFromCategory(withSignFix);
    return this.fixInstallmentAmounts(withCategorySign);
  }
}
