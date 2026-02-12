import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

/** Kept for backward compat – the old shape (action = 'transaction') */
export interface ParsedVoiceTransaction {
  type: 'expense' | 'income';
  amount: number;
  description: string;
  categorySlug: string | null;
  date: string; // YYYY-MM-DD
  currency: string;
}

/** Expanded voice-input result that covers every QuickAdd type */
export interface ParsedVoiceInput {
  action:
    | 'transaction'
    | 'loan'
    | 'saving'
    | 'goal'
    | 'budget'
    | 'forex'
    | 'mortgage'
    | 'stock_portfolio'
    | 'account';

  /* shared */
  name?: string;
  description?: string;
  amount?: number;
  currency?: string;
  date?: string;

  /* transaction */
  type?: 'expense' | 'income';
  categorySlug?: string | null;

  /* loan */
  originalAmount?: number;
  remainingAmount?: number;
  interestRate?: number;
  monthlyPayment?: number;
  lender?: string;

  /* saving / goal */
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string;

  /* budget */
  budgetCategorySlug?: string;

  /* forex */
  fromCurrency?: string;
  toCurrency?: string;
  fromAmount?: number;
  toAmount?: number;
  exchangeRate?: number;

  /* mortgage */
  bank?: string;
  totalAmount?: number;

  /* stock portfolio */
  broker?: string;

  /* account */
  accountType?: string;
}

// Simple keyword → category mapping for fallback parser
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  groceries: ['סופר', 'מכולת', 'ירקות', 'פירות', 'מזון', 'שוק', 'grocery', 'supermarket'],
  dining: ['מסעדה', 'קפה', 'אוכל', 'פיצה', 'המבורגר', 'סושי', 'ארוחה', 'בית קפה', 'restaurant', 'coffee', 'food', 'cafe'],
  transport: ['דלק', 'בנזין', 'רכבת', 'אוטובוס', 'מונית', 'חניה', 'fuel', 'gas', 'taxi', 'bus', 'train', 'parking'],
  utilities: ['חשמל', 'מים', 'גז', 'ארנונה', 'electricity', 'water', 'gas'],
  healthcare: ['רופא', 'תרופות', 'בית חולים', 'רפואה', 'מרפאה', 'doctor', 'medicine', 'pharmacy'],
  shopping: ['בגדים', 'נעליים', 'ביגוד', 'קניות', 'clothes', 'shoes', 'shopping'],
  entertainment: ['סרט', 'קולנוע', 'הופעה', 'הצגה', 'בילוי', 'movie', 'show', 'concert'],
  subscriptions: ['מנוי', 'נטפליקס', 'ספוטיפיי', 'subscription', 'netflix', 'spotify'],
  education: ['לימודים', 'קורס', 'ספרים', 'course', 'books', 'education'],
  rent: ['שכירות', 'דירה', 'rent', 'apartment'],
  insurance: ['ביטוח', 'insurance'],
  salary: ['משכורת', 'שכר', 'salary', 'wage'],
  income: ['הכנסה', 'income', 'revenue'],
};

@Injectable()
export class VoiceParserService {
  private readonly logger = new Logger(VoiceParserService.name);
  private openai: OpenAI | null = null;

  constructor(private prisma: PrismaService) {}

  private getClient(): OpenAI | null {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    if (!this.openai) this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  /* ────────────────────────────────────────────
   *  Regex-based fallback
   * ──────────────────────────────────────────── */
  private fallbackParse(
    text: string,
    categorySlugs: string[],
  ): ParsedVoiceInput | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const today = new Date().toISOString().slice(0, 10);

    // ── Detect special action types first (before expense/income) ──

    // Loan: "הלוואה X שקל ל-Y" / "הלוואתי X ל-Y" / "לקחתי הלוואה X"
    const loanMatch =
      trimmed.match(/(?:הלוואה|הלוואתי|לקחתי הלוואה|loan)\s+(?:של\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?\s*(?:ל|מ|ל-|מ-)?\s*(.*)/i) ||
      trimmed.match(/(?:הלוואתי)\s+(.*?)\s+(\d[\d,.]*)/i);
    if (loanMatch) {
      const isReverse = /הלוואתי\s+.+\s+\d/.test(trimmed);
      const amt = parseFloat((isReverse ? loanMatch[2] : loanMatch[1]).replace(/,/g, ''));
      const rest = (isReverse ? loanMatch[1] : loanMatch[2] || '').trim();
      if (amt > 0) {
        return {
          action: 'loan',
          name: rest || 'הלוואה',
          originalAmount: amt,
          remainingAmount: amt,
          lender: rest || undefined,
          currency: this.detectCurrency(trimmed),
        };
      }
    }

    // Saving: "חיסכון X" / "חסכתי X" / "הפקדתי X לחיסכון"
    const savingMatch =
      trimmed.match(/(?:חיסכון|חסכתי|הפקדתי.*חיסכון|saving)\s+(?:של\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?\s*(?:ל|עבור)?\s*(.*)/i) ||
      trimmed.match(/(?:הפקדתי)\s+(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?\s*(?:ל|לחיסכון|ל-חיסכון)?\s*(.*)/i);
    if (savingMatch) {
      const amt = parseFloat(savingMatch[1].replace(/,/g, ''));
      const rest = (savingMatch[2] || '').replace(/חיסכון/g, '').trim();
      if (amt > 0) {
        return {
          action: 'saving',
          name: rest || 'חיסכון',
          targetAmount: amt,
          currentAmount: 0,
          currency: this.detectCurrency(trimmed),
        };
      }
    }

    // Goal: "יעד X ל-Y" / "רוצה לחסוך X ל-Y"
    const goalMatch =
      trimmed.match(/(?:יעד|goal)\s+(?:של\s+|חדש\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?\s*(?:ל|עבור|ל-)?\s*(.*)/i) ||
      trimmed.match(/(?:רוצה לחסוך|לחסוך)\s+(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?\s*(?:ל|עבור|ל-)?\s*(.*)/i);
    if (goalMatch) {
      const amt = parseFloat(goalMatch[1].replace(/,/g, ''));
      const rest = (goalMatch[2] || '').trim();
      if (amt > 0) {
        return {
          action: 'goal',
          name: rest || 'יעד חדש',
          targetAmount: amt,
          currentAmount: 0,
          currency: this.detectCurrency(trimmed),
        };
      }
    }

    // Budget: "תקציב X ל-Y" / "תקציב אוכל X"
    const budgetMatch =
      trimmed.match(/(?:תקציב|budget)\s+(?:של\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?\s*(?:ל|עבור|ל-)?\s*(.*)/i) ||
      trimmed.match(/(?:תקציב|budget)\s+(.+?)\s+(\d[\d,.]*)/i);
    if (budgetMatch) {
      const isReverse = /תקציב\s+[^\d]+\s+\d/.test(trimmed);
      const amt = parseFloat((isReverse ? budgetMatch[2] : budgetMatch[1]).replace(/,/g, ''));
      const cat = (isReverse ? budgetMatch[1] : budgetMatch[2] || '').trim();
      if (amt > 0) {
        return {
          action: 'budget',
          amount: amt,
          name: cat || undefined,
          budgetCategorySlug: cat ? this.matchCategory(cat, categorySlugs) || undefined : undefined,
          currency: this.detectCurrency(trimmed),
        };
      }
    }

    // Mortgage: "משכנתא X" / "משכנתא X מ-Y"
    const mortgageMatch = trimmed.match(
      /(?:משכנתא|mortgage)\s+(?:של\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?\s*(?:מ|מ-|ב|בבנק)?\s*(.*)/i,
    );
    if (mortgageMatch) {
      const amt = parseFloat(mortgageMatch[1].replace(/,/g, ''));
      const rest = (mortgageMatch[2] || '').trim();
      if (amt > 0) {
        return {
          action: 'mortgage',
          name: rest ? `משכנתא ${rest}` : 'משכנתא',
          totalAmount: amt,
          bank: rest || undefined,
          currency: this.detectCurrency(trimmed),
        };
      }
    }

    // Forex: "המרתי X דולר" / "קניתי X דולר ב-Y שקל"
    const forexMatch =
      trimmed.match(/(?:המרתי|המרה|converted|exchange)\s+(\d[\d,.]*)\s*(דולר|יורו|dollars?|euros?)\s*(?:ב-?\s*(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?)?/i) ||
      trimmed.match(/(?:קניתי|bought)\s+(\d[\d,.]*)\s*(דולר|יורו|dollars?|euros?)\s*(?:ב-?\s*(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?)?/i);
    if (forexMatch) {
      const fromAmt = parseFloat(forexMatch[1].replace(/,/g, ''));
      const toCurr = /דולר|dollar/i.test(forexMatch[2]) ? 'USD' : 'EUR';
      const toAmt = forexMatch[3] ? parseFloat(forexMatch[3].replace(/,/g, '')) : undefined;
      if (fromAmt > 0) {
        return {
          action: 'forex',
          fromCurrency: 'ILS',
          toCurrency: toCurr,
          fromAmount: toAmt || undefined,
          toAmount: fromAmt,
          exchangeRate: toAmt && fromAmt ? +(toAmt / fromAmt).toFixed(4) : undefined,
          date: today,
        };
      }
    }

    // Stock portfolio: "תיק מניות X" / "תיק השקעות X"
    const stockMatch = trimmed.match(
      /(?:תיק מניות|תיק השקעות|stock portfolio|portfolio)\s*(.*)/i,
    );
    if (stockMatch) {
      const rest = (stockMatch[1] || '').trim();
      return {
        action: 'stock_portfolio',
        name: rest || 'התיק שלי',
        broker: rest || undefined,
      };
    }

    // Account: "חשבון בנק X" / "כרטיס אשראי X"
    const accountBankMatch = trimmed.match(
      /(?:חשבון בנק|חשבון חדש|bank account|new account)\s*(.*)/i,
    );
    if (accountBankMatch) {
      return {
        action: 'account',
        name: accountBankMatch[1].trim() || 'חשבון חדש',
        accountType: 'BANK',
      };
    }
    const accountCCMatch = trimmed.match(
      /(?:כרטיס אשראי|כרטיס חדש|credit card)\s*(.*)/i,
    );
    if (accountCCMatch) {
      return {
        action: 'account',
        name: accountCCMatch[1].trim() || 'כרטיס אשראי',
        accountType: 'CREDIT_CARD',
      };
    }

    // ── Fall back to expense / income parsing ──
    const txResult = this.fallbackParseTransaction(trimmed, categorySlugs);
    if (txResult) return txResult;

    return null;
  }

  /** Parse expense/income voice text with regex */
  private fallbackParseTransaction(
    trimmed: string,
    categorySlugs: string[],
  ): ParsedVoiceInput | null {
    const today = new Date().toISOString().slice(0, 10);
    let type: 'expense' | 'income' = 'expense';
    let amount: number | null = null;
    let description = '';
    const currency = this.detectCurrency(trimmed);

    // Detect date
    let date = today;
    if (/אתמול|yesterday/i.test(trimmed)) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      date = d.toISOString().slice(0, 10);
    } else if (/שלשום|day before yesterday/i.test(trimmed)) {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      date = d.toISOString().slice(0, 10);
    }

    // Income patterns
    const incomePatterns = [
      /(?:קיבלתי|הכנסה|received|got)\s+(?:משכורת\s+|שכר\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪)?(?:\s+(?:מ|על|עבור)\s*(.+))?/i,
      /(?:קיבלתי|הכנסה|received|got)\s+(.+?)\s+(\d[\d,.]*)/i,
      /(?:משכורת|שכר|salary)\s+(\d[\d,.]*)/i,
    ];

    for (const pattern of incomePatterns) {
      const m = trimmed.match(pattern);
      if (m) {
        type = 'income';
        if (pattern === incomePatterns[2]) {
          amount = parseFloat(m[1].replace(/,/g, ''));
          description = 'משכורת';
        } else if (pattern === incomePatterns[1]) {
          description = m[1].trim();
          amount = parseFloat(m[2].replace(/,/g, ''));
        } else {
          amount = parseFloat(m[1].replace(/,/g, ''));
          description = m[2]?.trim() || 'הכנסה';
        }
        break;
      }
    }

    // Expense patterns (only if income not matched)
    if (type !== 'income' || !amount) {
      type = 'expense';
      const expensePatterns = [
        /(?:הוצאתי|שילמתי|paid|spent)\s+(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|דולר|יורו)?\s+(?:על|ל|עבור|ב)\s*(.+)/i,
        /(?:הוצאה|expense)\s+(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|דולר|יורו)?\s+(.+)/i,
        /(?:קניתי|bought)\s+(.+?)\s+(?:ב|ב-)?\s*(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|דולר|יורו)?/i,
        /(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|דולר|יורו)\s+(?:על|ל|עבור|ב)\s*(.+)/i,
        /(?:הוצאתי|שילמתי|paid|spent)\s+(\d[\d,.]*)\s+(?:על|ל|עבור|ב)\s*(.+)/i,
      ];

      for (const pattern of expensePatterns) {
        const m = trimmed.match(pattern);
        if (m) {
          if (pattern === expensePatterns[2]) {
            description = m[1].trim();
            amount = parseFloat(m[2].replace(/,/g, ''));
          } else {
            amount = parseFloat(m[1].replace(/,/g, ''));
            description = m[2].trim();
          }
          break;
        }
      }
    }

    // Last resort: any number
    if (!amount) {
      const numMatch = trimmed.match(/(\d[\d,.]*)/);
      if (numMatch) {
        amount = parseFloat(numMatch[1].replace(/,/g, ''));
        description = trimmed
          .replace(numMatch[0], '')
          .replace(/שקל|ש"ח|₪|דולר|יורו/g, '')
          .replace(/הוצאתי|שילמתי|קיבלתי|הוצאה|הכנסה|על|ב-?|ל-?|עבור/g, '')
          .trim();
        if (/קיבלתי|הכנסה|משכורת|שכר/i.test(trimmed)) {
          type = 'income';
        }
      }
    }

    if (!amount || amount <= 0 || !description) return null;

    description = description
      .replace(/שקל|ש"ח|₪|דולר|יורו|אתמול|שלשום/g, '')
      .trim();
    if (!description) return null;

    const categorySlug = this.matchCategory(description, categorySlugs);

    return {
      action: 'transaction',
      type,
      amount,
      description,
      categorySlug,
      date,
      currency,
    };
  }

  private detectCurrency(text: string): string {
    if (/דולר|dollars?|\$|usd/i.test(text)) return 'USD';
    if (/יורו|euros?|eur/i.test(text)) return 'EUR';
    return 'ILS';
  }

  private matchCategory(
    description: string,
    availableSlugs: string[],
  ): string | null {
    const lower = description.toLowerCase();
    for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (!availableSlugs.includes(slug)) continue;
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) return slug;
      }
    }
    for (const slug of availableSlugs) {
      if (lower.includes(slug)) return slug;
    }
    return null;
  }

  /* ────────────────────────────────────────────
   *  Public API
   * ──────────────────────────────────────────── */
  async parseVoiceText(
    householdId: string,
    text: string,
  ): Promise<ParsedVoiceInput | null> {
    const cats = await this.prisma.category.findMany({
      where: { householdId },
      select: { slug: true, name: true, isIncome: true },
    });

    const categorySlugs = cats.map((c) => c.slug);
    const today = new Date().toISOString().slice(0, 10);

    // Try OpenAI first
    const client = this.getClient();
    if (client) {
      try {
        const result = await this.parseWithOpenAI(
          client,
          text,
          categorySlugs,
          today,
        );
        if (result) return result;
        this.logger.warn(
          'OpenAI returned empty/invalid result, falling back to regex parser',
        );
      } catch (err) {
        this.logger.error(
          'OpenAI voice parse failed, falling back to regex parser',
          err instanceof Error ? err.message : err,
        );
      }
    } else {
      this.logger.warn(
        'OPENAI_API_KEY not set, using regex fallback parser',
      );
    }

    // Fallback: regex-based parser
    const fallback = this.fallbackParse(text, categorySlugs);
    if (fallback) {
      this.logger.log(`Fallback parser succeeded for: "${text}"`);
      return fallback;
    }

    this.logger.warn(`Both OpenAI and fallback parser failed for: "${text}"`);
    return null;
  }

  /* ────────────────────────────────────────────
   *  OpenAI parser
   * ──────────────────────────────────────────── */
  private async parseWithOpenAI(
    client: OpenAI,
    text: string,
    categorySlugs: string[],
    today: string,
  ): Promise<ParsedVoiceInput | null> {
    const slugList = categorySlugs.join(', ');

    const systemPrompt = `You are a financial voice-input parser for a personal finance app.
The user speaks in Hebrew or English. Parse their voice input into a structured financial action.

The app supports these action types:
1. "transaction" – an expense or income (e.g., "הוצאתי 50 שקל על קפה", "קיבלתי משכורת 15000")
2. "loan" – creating a loan record (e.g., "הלוואה 50000 שקל", "הלוואתי 5000 לדוד")
3. "saving" – creating a savings goal (e.g., "חיסכון 1000 שקל", "חסכתי 2000 לטיול")
4. "goal" – setting a financial goal (e.g., "יעד 10000 לטיול", "רוצה לחסוך 50000 לרכב")
5. "budget" – setting a budget for a category (e.g., "תקציב 3000 לאוכל", "תקציב מזון 2000")
6. "forex" – currency exchange (e.g., "המרתי 1000 דולר", "קניתי 500 דולר ב-1800 שקל")
7. "mortgage" – creating a mortgage record (e.g., "משכנתא 800000 שקל מבנק לאומי")
8. "stock_portfolio" – creating a stock portfolio (e.g., "תיק מניות IBI", "תיק השקעות חדש")
9. "account" – creating a financial account (e.g., "חשבון בנק לאומי", "כרטיס אשראי ויזה")

Available category slugs: ${slugList || 'groceries, transport, utilities, rent, insurance, healthcare, dining, shopping, entertainment, salary, income, subscriptions, education, other'}

Return ONLY valid JSON. The "action" field is REQUIRED.

For action="transaction":
{"action":"transaction","type":"expense","amount":50,"description":"קפה","categorySlug":"dining","date":"${today}","currency":"ILS"}

For action="loan":
{"action":"loan","name":"הלוואה לדוד","originalAmount":5000,"remainingAmount":5000,"lender":"דוד","currency":"ILS"}

For action="saving":
{"action":"saving","name":"חיסכון לטיול","targetAmount":10000,"currentAmount":0,"currency":"ILS"}

For action="goal":
{"action":"goal","name":"רכב חדש","targetAmount":50000,"currentAmount":0,"currency":"ILS"}

For action="budget":
{"action":"budget","amount":3000,"budgetCategorySlug":"dining","name":"אוכל"}

For action="forex":
{"action":"forex","fromCurrency":"ILS","toCurrency":"USD","fromAmount":3500,"toAmount":1000,"exchangeRate":3.5,"date":"${today}"}

For action="mortgage":
{"action":"mortgage","name":"משכנתא","totalAmount":800000,"bank":"בנק לאומי","currency":"ILS"}

For action="stock_portfolio":
{"action":"stock_portfolio","name":"תיק מניות IBI","broker":"IBI"}

For action="account":
{"action":"account","name":"חשבון בנק לאומי","accountType":"BANK"}
accountType options: BANK, CREDIT_CARD, INSURANCE, PENSION, INVESTMENT, CASH

Rules:
- Default currency is "ILS" unless specified
- Default date is "${today}" unless user says אתמול (yesterday) or שלשום (day before yesterday)
- For transactions: type must be "expense" or "income", amount positive
- For budget: try to match budgetCategorySlug from available slugs`;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed.action) return null;

    // Validate based on action type
    switch (parsed.action) {
      case 'transaction':
        if (!parsed.amount || !parsed.description) return null;
        return {
          action: 'transaction',
          type: parsed.type === 'income' ? 'income' : 'expense',
          amount: Math.abs(Number(parsed.amount)),
          description: String(parsed.description),
          categorySlug: parsed.categorySlug || null,
          date: parsed.date || today,
          currency: parsed.currency || 'ILS',
        };

      case 'loan':
        if (!parsed.originalAmount && !parsed.amount) return null;
        return {
          action: 'loan',
          name: parsed.name || 'הלוואה',
          originalAmount: Math.abs(Number(parsed.originalAmount || parsed.amount)),
          remainingAmount: Math.abs(Number(parsed.remainingAmount || parsed.originalAmount || parsed.amount)),
          lender: parsed.lender || undefined,
          interestRate: parsed.interestRate ? Number(parsed.interestRate) : undefined,
          monthlyPayment: parsed.monthlyPayment ? Number(parsed.monthlyPayment) : undefined,
          currency: parsed.currency || 'ILS',
        };

      case 'saving':
        return {
          action: 'saving',
          name: parsed.name || 'חיסכון',
          targetAmount: parsed.targetAmount ? Math.abs(Number(parsed.targetAmount)) : undefined,
          currentAmount: parsed.currentAmount ? Number(parsed.currentAmount) : 0,
          currency: parsed.currency || 'ILS',
        };

      case 'goal':
        if (!parsed.targetAmount && !parsed.amount) return null;
        return {
          action: 'goal',
          name: parsed.name || 'יעד חדש',
          targetAmount: Math.abs(Number(parsed.targetAmount || parsed.amount)),
          currentAmount: parsed.currentAmount ? Number(parsed.currentAmount) : 0,
          targetDate: parsed.targetDate || undefined,
          currency: parsed.currency || 'ILS',
        };

      case 'budget':
        if (!parsed.amount) return null;
        return {
          action: 'budget',
          amount: Math.abs(Number(parsed.amount)),
          name: parsed.name || undefined,
          budgetCategorySlug: parsed.budgetCategorySlug || undefined,
        };

      case 'forex':
        return {
          action: 'forex',
          fromCurrency: parsed.fromCurrency || 'ILS',
          toCurrency: parsed.toCurrency || 'USD',
          fromAmount: parsed.fromAmount ? Number(parsed.fromAmount) : undefined,
          toAmount: parsed.toAmount ? Number(parsed.toAmount) : undefined,
          exchangeRate: parsed.exchangeRate ? Number(parsed.exchangeRate) : undefined,
          date: parsed.date || today,
        };

      case 'mortgage':
        if (!parsed.totalAmount && !parsed.amount) return null;
        return {
          action: 'mortgage',
          name: parsed.name || 'משכנתא',
          totalAmount: Math.abs(Number(parsed.totalAmount || parsed.amount)),
          bank: parsed.bank || undefined,
          currency: parsed.currency || 'ILS',
        };

      case 'stock_portfolio':
        return {
          action: 'stock_portfolio',
          name: parsed.name || 'התיק שלי',
          broker: parsed.broker || undefined,
        };

      case 'account': {
        const validTypes = ['BANK', 'CREDIT_CARD', 'INSURANCE', 'PENSION', 'INVESTMENT', 'CASH'];
        return {
          action: 'account',
          name: parsed.name || 'חשבון חדש',
          accountType: validTypes.includes(parsed.accountType) ? parsed.accountType : 'BANK',
        };
      }

      default:
        return null;
    }
  }
}
