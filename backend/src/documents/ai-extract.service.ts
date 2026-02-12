import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';

export interface ExtractedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // negative = expense (for installments = the payment made, e.g. -650)
  categorySlug?: string;
  totalAmount?: number; // for installments: full price (e.g. 1950)
  installmentCurrent?: number; // e.g. 2 (payment 2 of 3)
  installmentTotal?: number; // e.g. 3
}

/** Sign hint from layout/keywords - used to force correct income vs expense. */
export type SignHint = 'income' | 'expense' | 'unknown';

/** Per-line sign hints from deterministic preprocessor (layout + Hebrew keywords). */
export interface SignHints {
  /** Line index in original text (or logical row) -> suggested sign for that row's amount(s). */
  byLine: Map<number, SignHint>;
  /** When a line has TWO amounts: [incomeAmount, expenseAmount] - so we can assign sign by position. */
  twoAmountsByLine: Map<number, { income: number; expense: number }>;
}

// ──────────────────────────────────────────────
//  Hebrew Keywords: deterministic income vs expense
// ──────────────────────────────────────────────

// CLEARLY INCOME (no ambiguity):
const INCOME_KEYWORDS = [
  '\u05DE\u05E9\u05DB\u05D5\u05E8\u05EA', '\u05E9\u05DB\u05E8',                       // salary
  '\u05E7\u05E6\u05D1\u05EA \u05D9\u05DC\u05D3\u05D9\u05DD', '\u05E7\u05E6\u05D1\u05EA \u05D6\u05E7\u05E0\u05D4', // government allowances
  '\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 \u05D2', '\u05D1\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 \u05D2',     // NI payout
  '\u05DE.\u05D0.', '\u05DE.\u05D0 ',                                   // employer prefix
];

// CLEARLY EXPENSE (no ambiguity):
const EXPENSE_KEYWORDS = [
  '\u05D7\u05D9\u05D5\u05D1', '\u05DE\u05E9\u05D9\u05DB\u05D4',                             // charge, withdrawal
  '\u05D4\u05E2\u05D1\' \u05DC\u05D0\u05D7\u05E8', '\u05D4\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D0\u05D7\u05E8',           // transfer TO another
  '\u05E2\u05DE\'\u05D4\u05E7\u05E6\u05D0\u05EA \u05D0\u05E9\u05E8\u05D0\u05D9', '\u05D4\u05E7\u05E6\u05D0\u05EA \u05D0\u05E9\u05E8\u05D0\u05D9', // credit allocation fee
  '\u05DB\u05D0\u05DC', '\u05DE\u05E7\u05E1 \u05D0\u05D9\u05D8 \u05E4\u05D9\u05E0\u05E0\u05E1\u05D9', '\u05DC\u05D0\u05D5\u05DE\u05D9 \u05E7\u05D0\u05E8\u05D3', '\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8', '\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1', 'CAL',
  '\u05D0\u05D9\u05D8 \u05E4\u05D9\u05E0\u05E0\u05E1\u05D9', 'On \u05D0\u05D9\u05D8 \u05E4\u05D9\u05E0\u05E0\u05E1\u05D9', '\u05DE\u05E7\u05E1 \u05D0\u05D9\u05D8',
  '\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC', '\u05E2\u05DE\u05DC\u05D4', '\u05E2\u05DE\u05DC\u05EA',             // fees
  '\u05E9\u05D9\u05E7',                                                    // check payment
];

/**
 * AI extraction service: parse OCR text or images into structured transactions using OpenAI.
 * Uses a deterministic preprocessor (layout + Hebrew keywords) to fix income vs expense
 * before/after AI processing.
 */
@Injectable()
export class AiExtractService {
  private readonly logger = new Logger(AiExtractService.name);
  private openai: OpenAI | null = null;

  private getClient(): OpenAI | null {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    if (!this.openai) this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  // ──────────────────────────────────────────────
  //  Deterministic Sign Hints (Hebrew keywords + layout)
  // ──────────────────────────────────────────────

  /**
   * Deterministic sign hints from layout and keywords.
   * Israeli bank convention: two amount columns per row -> first column = income, second = expense.
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
      const priceLike = amounts.filter((n) => n > 100 || n !== Math.floor(n));
      const candidates = priceLike.length >= 1 ? priceLike : amounts;

      if (candidates.length >= 2) {
        // Two amounts on line: check if one is zero
        const nonZero = candidates.filter((n) => n >= 0.01);
        if (nonZero.length === 1) {
          const desc = line.replace(dateRe, ' ').replace(amountPattern, ' ').replace(/\s+/g, ' ').trim();
          const hasIncome = INCOME_KEYWORDS.some((k) => desc.includes(k));
          const hasExpense = EXPENSE_KEYWORDS.some((k) => desc.includes(k));
          if (hasIncome && !hasExpense) byLine.set(i, 'income');
          else if (hasExpense && !hasIncome) byLine.set(i, 'expense');
          else byLine.set(i, 'unknown');
          continue;
        }
        // Two real amounts: let AI figure it out
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

  // ──────────────────────────────────────────────
  //  Build Annotated Text for AI
  // ──────────────────────────────────────────────

  /**
   * Build annotated text for AI: add [SIGN=INCOME/EXPENSE/UNKNOWN] per line
   * so the model does not have to guess from colors (which it cannot see in plain text).
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

  // ──────────────────────────────────────────────
  //  Extract Transactions from OCR Text
  // ──────────────────────────────────────────────

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

    const system = `You are an expert Israeli financial document parser. You handle both bank statements and credit card statements. Extract transactions with HIGH ACCURACY.

SIGN RULES (CRITICAL):
- [SIGN=INCOME AMT=X]: This IS income. Return amount = +X (positive).
- [SIGN=EXPENSE AMT=X]: This IS expense. Return amount = -X (negative).
- [SIGN=UNKNOWN AMT=X]: Analyze the description carefully:
  INCOME (+): \u05DE\u05E9\u05DB\u05D5\u05E8\u05EA, \u05E9\u05DB\u05E8, \u05D6\u05D9\u05DB\u05D5\u05D9, \u05E7\u05E6\u05D1\u05D4, \u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 \u05D2\u05F3 (payout), \u05D1\u05D9\u05D8\u05D5\u05DC \u05E2\u05E1\u05E7\u05D4 (cancellation/refund)
  EXPENSE (-): \u05D7\u05D9\u05D5\u05D1, \u05DE\u05E9\u05D9\u05DB\u05D4, \u05D4\u05D5"\u05E7 (\u05D4\u05D5\u05E8\u05D0\u05EA \u05E7\u05D1\u05E2), \u05D4\u05E2\u05D1\u05E8\u05D4, \u05D4\u05DC\u05D5\u05D5\u05D0\u05D4, \u05E8\u05D9\u05D1\u05D9\u05EA, \u05E2\u05DE\u05DC\u05D4, \u05DB\u05D0\u05DC, \u05DE\u05E7\u05E1, \u05DC\u05D0\u05D5\u05DE\u05D9 \u05E7\u05D0\u05E8\u05D3
  DEFAULT: If unsure, use NEGATIVE (most transactions are expenses).

=== DESCRIPTION RULES ===
- Copy the transaction description text as-is.
- For bank statements: Hebrew operation text.
- For credit card statements: Keep merchant names in Latin as-is (e.g. "AMAZON PRIME").
- Do NOT include amounts, value dates, or "Income"/"Expense" labels.

=== CATEGORY RULES ===
Use these EXACT slugs (all lowercase with underscores).
IMPORTANT: IGNORE any categories shown in the source document.

INCOME categories:
- salary - \u05DE\u05E9\u05DB\u05D5\u05E8\u05EA, \u05E9\u05DB\u05E8, \u05DE.\u05D0. [company]
- income - \u05E7\u05E6\u05D1\u05EA \u05D9\u05DC\u05D3\u05D9\u05DD, \u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 \u05D2, and other generic income

EXPENSE categories:
- loan_payment, loan_interest, credit_charges, bank_fees, transfers, standing_order
- utilities, insurance, pension, groceries, transport, dining, shopping
- healthcare, entertainment, subscriptions, online_shopping, education, other

NEVER use "unknown" or "finance" unless truly nothing else fits.

=== OUTPUT FORMAT ===
JSON: { "transactions": [{ "date": "YYYY-MM-DD", "description": "text", "amount": number, "categorySlug": "slug" }] }
Include installment fields when relevant: totalAmount, installmentCurrent, installmentTotal.
Extract EVERY transaction row. Never skip.`;

    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      let userContent = `Extract transactions. Each row is pre-annotated with [SIGN=... AMT=...]. Use these signs exactly.\n\n${annotated.slice(0, 14000)}`;
      if (userContext?.trim()) {
        userContent += `\n\n---\nUser preferences:\n${userContext.trim().slice(0, 2000)}`;
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ];

      let content: string | null = null;
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          response_format: { type: 'json_object' },
        });
        content = completion.choices[0]?.message?.content;
      } catch (jsonFormatErr: unknown) {
        const errMsg = jsonFormatErr instanceof Error ? jsonFormatErr.message : String(jsonFormatErr);
        this.logger.warn('json_object format failed, retrying without:', errMsg);
        const fallbackCompletion = await client.chat.completions.create({
          model,
          messages,
        });
        content = fallbackCompletion.choices[0]?.message?.content;
        if (content) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          content = jsonMatch ? jsonMatch[0] : content;
        }
      }

      if (!content) return this.fallbackExtractWithHints(ocrText, hints);

      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed.transactions) ? parsed.transactions : Array.isArray(parsed) ? parsed : [];
      const today = new Date().toISOString().slice(0, 10);
      const isValidSlug = (s: string | undefined) => s && /^[a-z][a-z0-9_]*$/.test(s) && s.length <= 50;

      const mapped = list.map((t: Record<string, unknown>) => {
        let date = String(t.date || '').trim();
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today;
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
    } catch (err) {
      this.logger.error('AI text extraction failed:', err);
      return this.fallbackExtractWithHints(ocrText, hints);
    }
  }

  // ──────────────────────────────────────────────
  //  Extract Transactions via Vision API (image)
  // ──────────────────────────────────────────────

  /**
   * Extract transactions using GPT Vision API - sends image directly without OCR.
   * Much more accurate for images as the AI can see colors, layout, and Hebrew text directly.
   */
  async extractWithVision(imagePath: string, userContext?: string): Promise<ExtractedTransaction[]> {
    const client = this.getClient();
    if (!client) {
      this.logger.warn('No OpenAI client, Vision extraction unavailable');
      return [];
    }

    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.toLowerCase().endsWith('.png')
      ? 'image/png'
      : imagePath.toLowerCase().endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

    const systemPrompt = `You are an expert at reading Israeli financial documents from screenshots.
You can handle BOTH bank statements AND credit card statements.

=== DETECT DOCUMENT TYPE ===
A) **Bank statement** - columns: date, operation, debit (\u05D7\u05D5\u05D1\u05D4), credit (\u05D6\u05DB\u05D5\u05EA), balance (\u05D9\u05EA\u05E8\u05D4).
B) **Credit card statement** - columns: date, merchant name, transaction type, amount.

=== FOR EACH ROW ===
1) "date": Convert DD/MM/YY to "YYYY-MM-DD".
2) "description": The transaction text as-is (Hebrew or Latin).
3) "amount": Transaction amount (always positive).
4) "type": "income" or "expense":
   - Bank: \u05D6\u05DB\u05D5\u05EA (credit) column = "income". \u05D7\u05D5\u05D1\u05D4 (debit) column = "expense".
   - Credit card: Regular charges = "expense". Cancellations (\u05D1\u05D9\u05D8\u05D5\u05DC \u05E2\u05E1\u05E7\u05D4) = "income".
5) "balance": Running balance, or null if not present.
6) "categorySlug": YOUR OWN categorization from: salary, income, loan_payment, loan_interest, credit_charges, bank_fees, transfers, standing_order, utilities, insurance, pension, groceries, transport, dining, shopping, healthcare, entertainment, subscriptions, online_shopping, education, other.
   IMPORTANT: IGNORE categories shown in the source document.

=== RULES ===
- Extract EVERY visible row. Never skip.
- Amount is always positive.
- "type" MUST be "income" or "expense".

=== OUTPUT (JSON) ===
{ "transactions": [{ "date": "YYYY-MM-DD", "description": "text", "amount": <positive>, "type": "income"|"expense", "balance": <number|null>, "categorySlug": "slug" }] }`;

    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      let userMessage = `Read this financial document screenshot and extract every transaction row into JSON.`;
      if (userContext?.trim()) {
        userMessage += `\n\nUser preferences:\n${userContext.trim().slice(0, 2000)}`;
      }

      const visionMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userMessage },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high',
              },
            },
          ],
        },
      ];

      let content: string | null = null;
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: visionMessages,
          max_completion_tokens: 16384,
          response_format: { type: 'json_object' },
        });
        content = completion.choices[0]?.message?.content;
      } catch (jsonFormatErr: unknown) {
        const errMsg = jsonFormatErr instanceof Error ? jsonFormatErr.message : String(jsonFormatErr);
        this.logger.warn('Vision json_object format failed, retrying without:', errMsg);
        const fallbackCompletion = await client.chat.completions.create({
          model,
          messages: visionMessages,
          max_completion_tokens: 16384,
        });
        content = fallbackCompletion.choices[0]?.message?.content;
        if (content) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          content = jsonMatch ? jsonMatch[0] : content;
        }
      }

      if (!content) {
        this.logger.warn('Vision API returned no content');
        return [];
      }

      this.logger.log(`Vision pass 1 response length: ${content.length}`);

      const parsed = JSON.parse(content);
      const list: Array<Record<string, unknown>> = Array.isArray(parsed.transactions) ? parsed.transactions : Array.isArray(parsed) ? parsed : [];
      this.logger.log(`Vision extracted ${list.length} transactions`);

      if (list.length === 0) return [];

      // Determine sign from balance column (most reliable - pure math)
      const balanceSigns = this.determineSignsFromBalance(list);

      // Color analysis as secondary signal
      const colorSignals = await this.analyzeAmountColors(imagePath);
      const colorCountMatch = colorSignals.length === list.length;
      const maxColorDiff = Math.max(3, Math.floor(list.length * 0.2));
      const useColors = colorCountMatch || (colorSignals.length > 0 && Math.abs(colorSignals.length - list.length) <= maxColorDiff);

      // Find best color alignment offset
      let colorOffset = 0;
      if (useColors && !colorCountMatch && colorSignals.length > list.length) {
        const maxOffset = colorSignals.length - list.length;
        let bestScore = -1;
        for (let off = 0; off <= maxOffset; off++) {
          let score = 0;
          for (let i = 0; i < list.length; i++) {
            const desc = String(list[i].description || '');
            const colorType = colorSignals[i + off];
            if (INCOME_KEYWORDS.some((k) => desc.includes(k)) && colorType === 'income') score++;
            if (EXPENSE_KEYWORDS.some((k) => desc.includes(k)) && colorType === 'expense') score++;
          }
          if (score > bestScore) {
            bestScore = score;
            colorOffset = off;
          }
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const isValidSlug = (s: string | undefined) => s && /^[a-z][a-z0-9_]*$/.test(s) && s.length <= 50;

      const results: ExtractedTransaction[] = list.map((t: Record<string, unknown>, index: number) => {
        let date = String(t.date || '').trim();
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today;

        const rawSlug = t.categorySlug ? String(t.categorySlug).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') : undefined;
        const slug: string = isValidSlug(rawSlug) ? (rawSlug as string) : 'other';
        const absAmount = Math.abs(Number(t.amount) || 0);

        // Sign priority: 1) Balance math  2) AI-reported type  3) Color analysis  4) Default expense
        let isIncome = false;
        if (balanceSigns[index] != null) {
          isIncome = balanceSigns[index] === 'income';
        } else {
          const aiType = String(t.type || '').toLowerCase().trim();
          if (aiType === 'income' || aiType === 'credit') {
            isIncome = true;
          } else if (aiType === 'expense' || aiType === 'debit') {
            isIncome = false;
          } else if (useColors && (index + colorOffset) < colorSignals.length) {
            isIncome = colorSignals[index + colorOffset] === 'income';
          }
        }

        const amount = isIncome ? absAmount : -absAmount;

        const totalAmount = t.totalAmount != null ? Number(t.totalAmount) : undefined;
        const installmentCurrent = t.installmentCurrent != null ? Math.max(1, Math.floor(Number(t.installmentCurrent))) : undefined;
        const installmentTotal = t.installmentTotal != null ? Math.max(1, Math.floor(Number(t.installmentTotal))) : undefined;

        return {
          date,
          description: this.sanitizeDescription(String(t.description || '\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2').trim().slice(0, 300)),
          amount,
          categorySlug: slug,
          ...(totalAmount != null && totalAmount > 0 && { totalAmount }),
          ...(installmentCurrent != null && { installmentCurrent }),
          ...(installmentTotal != null && { installmentTotal }),
        };
      });

      // Apply safety net for unambiguous keywords only
      const withSignFix = this.applySignCorrectionSafetyNet(results);
      return this.fixInstallmentAmounts(withSignFix).filter((t) => Math.abs(t.amount) >= 0.01);
    } catch (err) {
      this.logger.error('Vision extraction error:', err);
      return [];
    }
  }

  // ──────────────────────────────────────────────
  //  Balance-based Sign Detection
  // ──────────────────────────────────────────────

  /**
   * Determine income/expense sign from balance column differences.
   * For each pair of adjacent rows, delta = balance[newer] - balance[older].
   */
  private determineSignsFromBalance(
    list: Array<Record<string, unknown>>,
  ): Array<'income' | 'expense' | null> {
    const results: Array<'income' | 'expense' | null> = new Array(list.length).fill(null);

    const balances = list.map((t) => {
      const b = t.balance;
      if (b == null || b === 'null' || b === '') return null;
      const n = Number(b);
      return isNaN(n) ? null : n;
    });

    const amounts = list.map((t) => Math.abs(Number(t.amount) || 0));
    const balanceCount = balances.filter((b) => b !== null).length;
    if (balanceCount < 2) return results;

    // Detect chronological order
    let isReverse = true;
    for (let i = 0; i < list.length - 1; i++) {
      const d1 = String(list[i].date || '');
      const d2 = String(list[i + 1].date || '');
      if (d1 < d2) { isReverse = false; break; }
      if (d1 > d2) { isReverse = true; break; }
    }

    for (let i = 0; i < list.length; i++) {
      const olderIdx = isReverse ? i + 1 : i - 1;
      if (olderIdx < 0 || olderIdx >= list.length) continue;
      if (balances[i] == null || balances[olderIdx] == null) continue;

      const delta = balances[i]! - balances[olderIdx]!;
      const amount = amounts[i];
      if (amount < 0.01) continue;

      const tolerance = Math.max(2, amount * 0.05);
      if (Math.abs(Math.abs(delta) - amount) <= tolerance) {
        results[i] = delta > 0 ? 'income' : 'expense';
      }
    }

    return results;
  }

  // ──────────────────────────────────────────────
  //  Color Analysis (pixel-based green/red detection)
  // ──────────────────────────────────────────────

  /**
   * Programmatic color analysis: scan image pixels to detect green vs red amount rows.
   * Green text = income, Red text = expense.
   */
  async analyzeAmountColors(imagePath: string): Promise<Array<'income' | 'expense'>> {
    try {
      const fileBuffer = fs.readFileSync(imagePath);
      let pixelData: Buffer;
      let width: number;
      let height: number;

      const lowerPath = imagePath.toLowerCase();
      if (lowerPath.endsWith('.png')) {
        const png = PNG.sync.read(fileBuffer);
        pixelData = png.data;
        width = png.width;
        height = png.height;
      } else {
        const decoded = jpeg.decode(fileBuffer, { useTArray: true });
        pixelData = Buffer.from(decoded.data);
        width = decoded.width;
        height = decoded.height;
      }

      // Scan the left ~45% of the image (amount columns in RTL bank statements)
      const scanStart = Math.floor(width * 0.02);
      const scanEnd = Math.floor(width * 0.45);
      const channels = 4; // RGBA

      const bandHeight = Math.max(2, Math.floor(height * 0.003));
      const minPixelsPerBand = Math.max(8, Math.floor((scanEnd - scanStart) * bandHeight * 0.003));
      const rowGap = Math.max(8, Math.floor(height * 0.012));

      const bands: Array<{ greenPixels: number; redPixels: number; y: number }> = [];

      for (let y = 0; y < height; y += bandHeight) {
        let greenCount = 0;
        let redCount = 0;
        for (let dy = 0; dy < bandHeight && y + dy < height; dy++) {
          for (let x = scanStart; x < scanEnd; x++) {
            const idx = ((y + dy) * width + x) * channels;
            const r = pixelData[idx];
            const g = pixelData[idx + 1];
            const b = pixelData[idx + 2];
            const sum = r + g + b;

            if (sum > 600 || sum < 60) continue;
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            if (maxC - minC < 25) continue;

            if (g > 70 && g > r + 25 && g > b + 15) greenCount++;
            if (r > 70 && r > g + 25 && r > b + 15) redCount++;
          }
        }
        if (greenCount >= minPixelsPerBand || redCount >= minPixelsPerBand) {
          bands.push({ greenPixels: greenCount, redPixels: redCount, y });
        }
      }

      // Merge adjacent bands into row clusters
      const rowClusters: Array<{ green: number; red: number; yStart: number; yEnd: number }> = [];
      let cluster: { green: number; red: number; yStart: number; yEnd: number } | null = null;

      for (const band of bands) {
        if (!cluster || band.y - cluster.yEnd > rowGap) {
          if (cluster) rowClusters.push(cluster);
          cluster = { green: band.greenPixels, red: band.redPixels, yStart: band.y, yEnd: band.y + bandHeight };
        } else {
          cluster.green += band.greenPixels;
          cluster.red += band.redPixels;
          cluster.yEnd = band.y + bandHeight;
        }
      }
      if (cluster) rowClusters.push(cluster);

      // Skip first row if it looks like a header (both green and red strongly)
      if (rowClusters.length > 1) {
        const first = rowClusters[0];
        const minColor = Math.min(first.green, first.red);
        const maxColor = Math.max(first.green, first.red);
        if (minColor > maxColor * 0.3 && minColor > minPixelsPerBand) {
          rowClusters.shift();
        }
      }

      return rowClusters.map((c) => (c.green > c.red ? 'income' : 'expense'));
    } catch (err) {
      this.logger.error('Color analysis failed:', err);
      return [];
    }
  }

  // ──────────────────────────────────────────────
  //  Description Sanitization
  // ──────────────────────────────────────────────

  /**
   * Remove OCR gibberish from description while preserving intentional Latin text
   * (e.g. credit card merchant names like AMAZON PRIME, MIDJOURNEY, PAYPAL).
   */
  private sanitizeDescription(desc: string): string {
    if (!desc || !desc.trim()) return '\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2';
    let s = desc.trim();

    // Remove value date and standalone dates
    s = s.replace(/\(?\s*\u05EA\u05D0\u05E8\u05D9\u05DA\s*\u05E2\u05E8\u05DA[:\s]*\d{1,2}[\/\.]\d{1,2}[\/\.]?\d{0,4}\s*\)?/gi, '');
    s = s.replace(/\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}/g, '');

    // Remove amount-like numbers from description
    s = s.replace(/\s*\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?(?:\s*[\u20AA\u05E9"\u05D7])?\s*/g, ' ');
    s = s.replace(/\s+\d+\.\d{2}\s*/g, ' ');

    // Remove " Income" / " Expense" (AI sometimes appends these)
    s = s.replace(/\s+Income\s*/gi, ' ').replace(/\s+Expense\s*/gi, ' ');

    // Only remove Latin if the description is primarily Hebrew
    const hebrewChars = (s.match(/[\u0590-\u05FF]/g) || []).length;
    const latinChars = (s.match(/[a-zA-Z]/g) || []).length;
    if (hebrewChars > 0 && hebrewChars > latinChars) {
      s = s.replace(/\b[a-zA-Z]{3,}\b/g, '');
    }

    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^[\s\-=:,."']+/, '').replace(/[\s\-=:,."']+$/, '').trim();

    if (s.length < 2) return '\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2';
    return s.slice(0, 300);
  }

  // ──────────────────────────────────────────────
  //  Sign Correction Helpers
  // ──────────────────────────────────────────────

  /** When category is clearly income or expense, set sign from it (OCR path only). */
  private applySignFromCategory(transactions: ExtractedTransaction[]): ExtractedTransaction[] {
    const INCOME_SLUGS = new Set(['salary', 'income']);
    const EXPENSE_SLUGS = new Set([
      'loan_payment', 'loan_interest', 'credit_charges', 'bank_fees', 'fees',
      'utilities', 'insurance', 'pension', 'groceries', 'transport', 'dining',
      'shopping', 'healthcare', 'entertainment', 'other',
    ]);
    return transactions.map((t) => {
      const abs = Math.abs(t.amount);
      if (t.categorySlug && INCOME_SLUGS.has(t.categorySlug) && t.amount < 0) return { ...t, amount: abs };
      if (t.categorySlug && EXPENSE_SLUGS.has(t.categorySlug) && t.amount > 0) return { ...t, amount: -abs };
      return t;
    });
  }

  /** Safety net: fix sign ONLY for UNAMBIGUOUS descriptions. */
  private applySignCorrectionSafetyNet(transactions: ExtractedTransaction[]): ExtractedTransaction[] {
    const INCOME_MARKERS = ['\u05E7\u05E6\u05D1\u05EA \u05D9\u05DC\u05D3\u05D9\u05DD', '\u05E7\u05E6\u05D1\u05EA \u05D6\u05E7\u05E0\u05D4', '\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 \u05D2', '\u05D1\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 \u05D2', '\u05DE\u05E9\u05DB\u05D5\u05E8\u05EA', '\u05E9\u05DB\u05E8', '\u05D6\u05D9\u05DB\u05D5\u05D9', '\u05DE.\u05D0.', '\u05DE.\u05D0 '];
    const EXPENSE_MARKERS = [
      '\u05D7\u05D9\u05D5\u05D1', '\u05DE\u05E9\u05D9\u05DB\u05D4',
      '\u05DB\u05D0\u05DC', '\u05DE\u05E7\u05E1 \u05D0\u05D9\u05D8', '\u05DC\u05D0\u05D5\u05DE\u05D9 \u05E7\u05D0\u05E8\u05D3', '\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8', '\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1',
      '\u05D4\u05D5"\u05E7 \u05D4\u05DC\u05D5\' \u05E8\u05D1\u05D9\u05EA', '\u05D4\u05D5"\u05E7 \u05D4\u05DC\u05D5\u05D0\u05D4 \u05E7\u05E8\u05DF', '\u05D4\u05D5"\u05E7 \u05D4\u05DC\u05D5\u05D9 \u05E8\u05D1\u05D9\u05EA',
      '\u05E2\u05DE\u05DC\u05EA', '\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC', '\u05D4\u05E7\u05E6\u05D0\u05EA \u05D0\u05E9\u05E8\u05D0\u05D9',
      '\u05D4\u05E2\u05D1\' \u05DC\u05D0\u05D7\u05E8', '\u05D4\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D0\u05D7\u05E8',
    ];
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
   * Overlay sign hints on AI output: for each transaction, if we have a strong hint,
   * force the sign so we never end up with salary as expense.
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
          const wrongSign = signHint === 'income'
            ? (t: ExtractedTransaction) => t.amount < 0
            : (t: ExtractedTransaction) => t.amount > 0;
          const fix = signHint === 'income'
            ? (t: ExtractedTransaction) => { t.amount = expectedAbs; }
            : (t: ExtractedTransaction) => { t.amount = -expectedAbs; };
          const idx = transactions.findIndex(
            (t) => t.date === lastDate && Math.abs(Math.abs(t.amount) - expectedAbs) < 0.02 && wrongSign(t),
          );
          if (idx >= 0) fix(transactions[idx]);
        }
      }
    }
    return transactions;
  }

  // ──────────────────────────────────────────────
  //  Fallback Extraction (no AI)
  // ──────────────────────────────────────────────

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
      const sign = signHint === 'income' ? 1 : signHint === 'expense' ? -1 : -1;
      results.push({ date: lastDate, description: this.sanitizeDescription(rawDesc), amount: sign * amount, categorySlug: 'other' });
    }
    return this.fixInstallmentAmounts(results);
  }

  // ──────────────────────────────────────────────
  //  Installment Amount Fix
  // ──────────────────────────────────────────────

  /** If amount was wrongly set to total (full price), replace with the actual payment. */
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
}
