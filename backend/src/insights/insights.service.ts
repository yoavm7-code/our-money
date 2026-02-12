import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { AccountType } from '@prisma/client';

const BALANCE_ACCOUNT_TYPES: AccountType[] = ['BANK', 'INVESTMENT', 'PENSION', 'INSURANCE', 'CASH'];

export type InsightSection =
  | 'spendingPatterns'
  | 'incomeTrends'
  | 'cashFlowHealth'
  | 'taxOptimization'
  | 'clientDiversification'
  | 'invoiceBehavior'
  | 'seasonalPatterns'
  | 'balanceForecast'
  | 'savingsRecommendation'
  | 'investmentRecommendations';

export const INSIGHT_SECTIONS: InsightSection[] = [
  'spendingPatterns',
  'incomeTrends',
  'cashFlowHealth',
  'taxOptimization',
  'clientDiversification',
  'invoiceBehavior',
  'seasonalPatterns',
  'balanceForecast',
  'savingsRecommendation',
  'investmentRecommendations',
];

export interface FinancialInsights {
  spendingPatterns: string;
  incomeTrends: string;
  cashFlowHealth: string;
  taxOptimization: string;
  clientDiversification: string;
  invoiceBehavior: string;
  seasonalPatterns: string;
  balanceForecast: string;
  savingsRecommendation: string;
  investmentRecommendations: string;
}

interface BusinessFinancialData {
  totalBalance: number;
  accounts: Array<{ name: string; type: string; balance: number | null }>;
  monthlyData: Array<{ month: string; income: number; expenses: number }>;
  currentMonth: string;
  fixedExpensesMonthly: number;
  fixedIncomeMonthly: number;
  spendingByCategory: Array<{ name: string; slug: string; total: number; count: number }>;
  // Freelancer-specific data
  clientRevenue: Array<{ name: string; revenue: number; invoiceCount: number; avgPaymentDays: number | null }>;
  invoiceStats: {
    totalSent: number;
    totalPaid: number;
    totalOverdue: number;
    avgPaymentDays: number;
    unpaidAmount: number;
  };
  topExpenseCategories: Array<{ name: string; total: number; isTaxDeductible: boolean; deductionRate: number }>;
  projectPipeline: Array<{ name: string; clientName: string | null; budgetAmount: number; status: string }>;
  vatRate: number;
  currency: string;
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Data Gathering ─────────────────────────────────────────────────
  async getFinancialData(businessId: string): Promise<BusinessFinancialData> {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const [
      accountsRaw,
      transactions,
      business,
      clients,
      invoices,
      overdueInvoices,
      projects,
      categories,
    ] = await Promise.all([
      this.prisma.account.findMany({
        where: { businessId, isActive: true },
        select: { id: true, name: true, type: true, balance: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          businessId,
          date: { gte: sixMonthsAgo, lte: now },
        },
        select: {
          date: true,
          amount: true,
          accountId: true,
          isRecurring: true,
          categoryId: true,
          clientId: true,
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { vatRate: true, defaultCurrency: true },
      }),
      this.prisma.client.findMany({
        where: { businessId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          businessId,
          issueDate: { gte: sixMonthsAgo, lte: now },
        },
        select: {
          clientId: true,
          total: true,
          paidAmount: true,
          status: true,
          issueDate: true,
          paidDate: true,
          dueDate: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          businessId,
          status: 'OVERDUE',
        },
        select: { total: true, paidAmount: true },
      }),
      this.prisma.project.findMany({
        where: { businessId, status: 'ACTIVE' },
        select: {
          name: true,
          budgetAmount: true,
          status: true,
          client: { select: { name: true } },
        },
      }),
      this.prisma.category.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          slug: true,
          isTaxDeductible: true,
          deductionRate: true,
          excludeFromExpenseTotal: true,
        },
      }),
    ]);

    // Calculate account balances
    const accountIds = accountsRaw.map((a) => a.id);
    const sums = accountIds.length > 0
      ? await this.prisma.transaction.groupBy({
          by: ['accountId'],
          where: { accountId: { in: accountIds } },
          _sum: { amount: true },
        })
      : [];
    const sumByAccount = new Map(sums.map((s) => [s.accountId, Number(s._sum.amount ?? 0)]));

    let totalBalance = 0;
    const accounts = accountsRaw.map((a) => {
      const initial = Number(a.balance ?? 0);
      const txSum = sumByAccount.get(a.id) ?? 0;
      const calculated = initial + txSum;
      const showBalance = BALANCE_ACCOUNT_TYPES.includes(a.type as AccountType);
      if (showBalance) totalBalance += calculated;
      return {
        name: a.name,
        type: a.type,
        balance: showBalance ? calculated : null,
      };
    });

    // Monthly data
    const byMonth = new Map<string, { income: number; expenses: number }>();
    for (const t of transactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(key)) byMonth.set(key, { income: 0, expenses: 0 });
      const b = byMonth.get(key)!;
      const amt = Number(t.amount);
      if (amt > 0) b.income += amt;
      else b.expenses += Math.abs(amt);
    }
    const monthlyData = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({ month, ...data }));

    // Fixed expenses/income
    let fixedExpensesSum = 0;
    let fixedIncomeSum = 0;
    for (const t of transactions) {
      if (!t.isRecurring) continue;
      const amt = Number(t.amount);
      if (amt < 0) fixedExpensesSum += Math.abs(amt);
      else fixedIncomeSum += amt;
    }
    const monthsInRange = Math.max(1, byMonth.size);
    const fixedExpensesMonthly = fixedExpensesSum / monthsInRange;
    const fixedIncomeMonthly = fixedIncomeSum / monthsInRange;

    // Spending by category
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const categorySpending = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { businessId, date: { gte: sixMonthsAgo, lte: now }, amount: { lt: 0 } },
      _sum: { amount: true },
      _count: true,
    });
    const spendingByCategory = categorySpending
      .map((cs) => {
        const cat = cs.categoryId ? categoryMap.get(cs.categoryId) : null;
        return {
          name: cat?.name ?? 'Other',
          slug: cat?.slug ?? 'other',
          total: Math.abs(Number(cs._sum.amount ?? 0)),
          count: cs._count,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Client revenue
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    const clientRevenueMap = new Map<string, { revenue: number; count: number; totalDays: number; paidCount: number }>();
    for (const inv of invoices) {
      if (!inv.clientId || inv.status === 'DRAFT' || inv.status === 'CANCELLED') continue;
      const existing = clientRevenueMap.get(inv.clientId) || { revenue: 0, count: 0, totalDays: 0, paidCount: 0 };
      if (inv.status === 'PAID') {
        existing.revenue += Number(inv.total);
        if (inv.issueDate && inv.paidDate) {
          const days = Math.max(0, Math.floor((new Date(inv.paidDate).getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24)));
          existing.totalDays += days;
          existing.paidCount += 1;
        }
      }
      existing.count += 1;
      clientRevenueMap.set(inv.clientId, existing);
    }
    const clientRevenue = [...clientRevenueMap.entries()]
      .map(([cid, data]) => ({
        name: clientMap.get(cid)?.name ?? 'Unknown',
        revenue: data.revenue,
        invoiceCount: data.count,
        avgPaymentDays: data.paidCount > 0 ? Math.round(data.totalDays / data.paidCount) : null,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Invoice stats
    const paidInvoices = invoices.filter((i) => i.status === 'PAID');
    const sentInvoices = invoices.filter((i) => ['SENT', 'VIEWED'].includes(i.status));
    let totalPaymentDays = 0;
    let paymentCount = 0;
    for (const inv of paidInvoices) {
      if (inv.issueDate && inv.paidDate) {
        const days = Math.max(0, Math.floor((new Date(inv.paidDate).getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24)));
        totalPaymentDays += days;
        paymentCount += 1;
      }
    }
    const unpaidAmount = [...overdueInvoices, ...sentInvoices].reduce(
      (sum, inv) => sum + Number(inv.total) - Number(inv.paidAmount ?? 0),
      0,
    );

    const invoiceStats = {
      totalSent: sentInvoices.length,
      totalPaid: paidInvoices.length,
      totalOverdue: overdueInvoices.length,
      avgPaymentDays: paymentCount > 0 ? Math.round(totalPaymentDays / paymentCount) : 0,
      unpaidAmount,
    };

    // Top expense categories with deductibility info
    const topExpenseCategories = categorySpending
      .filter((cs) => cs.categoryId)
      .map((cs) => {
        const cat = categoryMap.get(cs.categoryId!);
        return {
          name: cat?.name ?? 'Other',
          total: Math.abs(Number(cs._sum.amount ?? 0)),
          isTaxDeductible: cat?.isTaxDeductible ?? true,
          deductionRate: cat?.deductionRate ? Number(cat.deductionRate) : 100,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Project pipeline
    const projectPipeline = projects.map((p) => ({
      name: p.name,
      clientName: p.client?.name ?? null,
      budgetAmount: Number(p.budgetAmount ?? 0),
      status: p.status,
    }));

    return {
      totalBalance,
      accounts,
      monthlyData,
      currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      fixedExpensesMonthly,
      fixedIncomeMonthly,
      spendingByCategory,
      clientRevenue,
      invoiceStats,
      topExpenseCategories,
      projectPipeline,
      vatRate: Number(business?.vatRate ?? 17),
      currency: business?.defaultCurrency ?? 'ILS',
    };
  }

  // ─── Language Helpers ───────────────────────────────────────────────
  private normalizeLang(lang?: string): 'he' | 'en' {
    return lang === 'en' ? 'en' : 'he';
  }

  private getCountryContext(countryCode?: string): string {
    if (!countryCode || typeof countryCode !== 'string') return '';
    const code = countryCode.toUpperCase().slice(0, 2);
    if (!code) return '';
    return `\n\nUser's country (ISO 3166-1 alpha-2): ${code}. Tailor all recommendations to this country's market, regulations, tax rules, and currency where relevant.`;
  }

  // ─── OpenAI Client ──────────────────────────────────────────────────
  private openai: OpenAI | null = null;

  private getOpenAIClient(): OpenAI | null {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    if (!this.openai) this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  // ─── All Insights ──────────────────────────────────────────────────
  async getInsights(businessId: string, lang?: string, countryCode?: string): Promise<FinancialInsights> {
    const data = await this.getFinancialData(businessId);
    const client = this.getOpenAIClient();
    const locale = this.normalizeLang(lang);

    if (!client) {
      return this.getAllFallbackInsights(data, locale);
    }

    try {
      const systemPrompt = this.buildFullSystemPrompt(locale, countryCode);
      const userPrompt = this.buildFullDataPrompt(data, locale, countryCode);

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      let content: string | null = null;
      try {
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages,
          response_format: { type: 'json_object' },
        });
        content = completion.choices[0]?.message?.content;
      } catch (jsonErr: unknown) {
        this.logger.warn(`json_object format failed, retrying: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`);
        const fallback = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages,
        });
        content = fallback.choices[0]?.message?.content;
        if (content) {
          const m = content.match(/\{[\s\S]*\}/);
          content = m ? m[0] : content;
        }
      }

      if (!content) return this.getAllFallbackInsights(data, locale);

      const parsed = JSON.parse(content) as Record<string, unknown>;
      const fallback = this.getAllFallbackInsights(data, locale);

      return {
        spendingPatterns: toReadableString(parsed.spendingPatterns) || fallback.spendingPatterns,
        incomeTrends: toReadableString(parsed.incomeTrends) || fallback.incomeTrends,
        cashFlowHealth: toReadableString(parsed.cashFlowHealth) || fallback.cashFlowHealth,
        taxOptimization: toReadableString(parsed.taxOptimization) || fallback.taxOptimization,
        clientDiversification: toReadableString(parsed.clientDiversification) || fallback.clientDiversification,
        invoiceBehavior: toReadableString(parsed.invoiceBehavior) || fallback.invoiceBehavior,
        seasonalPatterns: toReadableString(parsed.seasonalPatterns) || fallback.seasonalPatterns,
        balanceForecast: toReadableString(parsed.balanceForecast) || fallback.balanceForecast,
        savingsRecommendation: toReadableString(parsed.savingsRecommendation) || fallback.savingsRecommendation,
        investmentRecommendations: toReadableString(parsed.investmentRecommendations) || fallback.investmentRecommendations,
      };
    } catch (err) {
      this.logger.error(`Failed to generate AI insights: ${err instanceof Error ? err.message : String(err)}`);
      return this.getAllFallbackInsights(data, locale);
    }
  }

  // ─── Single Section Insight ─────────────────────────────────────────
  async getInsightSection(
    businessId: string,
    section: InsightSection,
    lang?: string,
    countryCode?: string,
  ): Promise<{ content: string }> {
    const data = await this.getFinancialData(businessId);
    const client = this.getOpenAIClient();
    const locale = this.normalizeLang(lang);
    const fallbackContent = this.getFallbackForSection(data, section, locale);

    if (!client) {
      return { content: fallbackContent };
    }

    try {
      const systemPrompt = this.buildSectionSystemPrompt(section, locale, countryCode);
      const userPrompt = this.buildFullDataPrompt(data, locale, countryCode)
        + '\n\n' + this.buildSectionAsk(section, locale);

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      let content: string | null = null;
      try {
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages,
          response_format: { type: 'json_object' },
        });
        content = completion.choices[0]?.message?.content;
      } catch (jsonErr: unknown) {
        this.logger.warn(`Section json_object failed, retrying: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`);
        const fb = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages,
        });
        content = fb.choices[0]?.message?.content;
        if (content) {
          const m = content.match(/\{[\s\S]*\}/);
          content = m ? m[0] : content;
        }
      }

      if (!content) return { content: fallbackContent };

      const parsed = JSON.parse(content) as Record<string, unknown>;
      const raw = parsed[section];
      const text = toReadableString(raw);
      return { content: text?.trim() ? text : fallbackContent };
    } catch (err) {
      this.logger.error(`Failed to generate section insight: ${err instanceof Error ? err.message : String(err)}`);
      return { content: fallbackContent };
    }
  }

  // ─── System Prompt (Full) ──────────────────────────────────────────
  private buildFullSystemPrompt(locale: 'he' | 'en', countryCode?: string): string {
    const now = new Date();
    const currentDate = locale === 'en'
      ? now.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
      : now.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = now.getFullYear();

    const langInstruction = locale === 'en'
      ? 'Respond entirely in English.'
      : 'Respond entirely in Hebrew (עברית).';

    if (locale === 'en') {
      return `You are an expert financial advisor specializing in freelancer and small business finances. Today's date: ${currentDate}.

## Your role:
Analyze the freelancer's business financial data and provide actionable, specific insights across multiple categories.

## Response format:
Return a JSON object with these exact keys:
- spendingPatterns: Analysis of spending habits, fixed vs variable expenses, areas to optimize
- incomeTrends: Income trajectory analysis - growing/declining clients, revenue stability
- cashFlowHealth: Cash flow assessment - runway, liquidity, risk indicators
- taxOptimization: Tax-saving opportunities specific to freelancers (deductions, VAT optimization, pension/study fund benefits)
- clientDiversification: Client concentration risk, dependency analysis, recommendations
- invoiceBehavior: Invoice payment patterns, late-paying clients, collection recommendations
- seasonalPatterns: Seasonal trends in income/expenses, busy/slow periods
- balanceForecast: Balance prediction for next 1-3 months based on trends
- savingsRecommendation: Specific savings targets and vehicle recommendations (deposits, money market, Makam at ~4.5% in ${currentYear})
- investmentRecommendations: Investment allocation suggestions (study funds, provident funds, ETFs, bonds)

Each value should be a detailed, actionable paragraph or bullet-pointed list.

${langInstruction}${this.getCountryContext(countryCode)}`;
    }

    return `אתה יועץ פיננסי מומחה המתמחה בפרילנסרים ועסקים קטנים. התאריך היום: ${currentDate}.

## תפקידך:
נתח את הנתונים הפיננסיים של העסק ותן תובנות מעשיות וספציפיות במספר קטגוריות.

## פורמט התשובה:
החזר אובייקט JSON עם המפתחות הבאים:
- spendingPatterns: ניתוח דפוסי הוצאות, הוצאות קבועות לעומת משתנות, תחומים לייעול
- incomeTrends: ניתוח מגמות הכנסה - לקוחות צומחים/יורדים, יציבות הכנסות
- cashFlowHealth: הערכת תזרים מזומנים - רנווי, נזילות, אינדיקטורים לסיכון
- taxOptimization: הזדמנויות לחיסכון במס ספציפיות לפרילנסרים (ניכויים, ייעול מע"מ, הטבות פנסיה/קרן השתלמות)
- clientDiversification: סיכון ריכוז לקוחות, ניתוח תלות, המלצות
- invoiceBehavior: דפוסי תשלום חשבוניות, לקוחות מאחרים, המלצות לגבייה
- seasonalPatterns: מגמות עונתיות בהכנסות/הוצאות, תקופות עמוסות/שקטות
- balanceForecast: תחזית יתרה ל-1-3 חודשים קדימה
- savingsRecommendation: יעדי חיסכון ספציפיים והמלצות (פיקדון, קרן כספית, פק"מ בריבית ~4.5% ${currentYear})
- investmentRecommendations: המלצות הקצאת השקעות (קרנות השתלמות, קופות גמל, תעודות סל, אג"ח)

כל ערך צריך להיות פסקה מפורטת ומעשית או רשימה עם נקודות.

${langInstruction}${this.getCountryContext(countryCode)}`;
  }

  // ─── Section System Prompt ─────────────────────────────────────────
  private buildSectionSystemPrompt(section: InsightSection, locale: 'he' | 'en', countryCode?: string): string {
    const now = new Date();
    const currentDate = locale === 'en'
      ? now.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
      : now.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = now.getFullYear();
    const langInstruction = locale === 'en'
      ? 'Respond entirely in English.'
      : 'כתוב את כל התוכן בעברית.';

    const sectionGuidance: Record<InsightSection, { en: string; he: string }> = {
      spendingPatterns: {
        en: 'Analyze spending patterns: fixed vs variable, trends, areas of overspending, actionable cost-cutting recommendations.',
        he: 'נתח דפוסי הוצאות: קבועות לעומת משתנות, מגמות, תחומי הוצאה יתרה, המלצות מעשיות לצמצום.',
      },
      incomeTrends: {
        en: 'Analyze income trends: growing/declining revenue streams, client stability, diversification of income sources.',
        he: 'נתח מגמות הכנסה: מקורות הכנסה צומחים/יורדים, יציבות לקוחות, גיוון מקורות הכנסה.',
      },
      cashFlowHealth: {
        en: 'Assess cash flow health: current runway, liquidity ratio, upcoming payment gaps, risk indicators for cash shortages.',
        he: 'הערך בריאות תזרים מזומנים: רנווי נוכחי, יחס נזילות, פערים צפויים, אינדיקטורים לסיכון מחסור במזומנים.',
      },
      taxOptimization: {
        en: `Tax optimization for freelancers: deductible expenses they might miss, VAT optimization, pension/study fund tax benefits (study fund ceiling ~20,520 ILS for employees, ~37,500 ILS for self-employed in ${currentYear}), credit points.`,
        he: `ייעול מס לפרילנסרים: הוצאות מוכרות שאולי מפספסים, ייעול מע"מ, הטבות מס פנסיה/קרן השתלמות (תקרת קרן השתלמות ~20,520 ₪ לשכיר, ~37,500 ₪ לעצמאי ${currentYear}), נקודות זיכוי.`,
      },
      clientDiversification: {
        en: 'Analyze client concentration risk: revenue dependency on top clients, recommendations for reducing risk, ideal client portfolio distribution.',
        he: 'נתח סיכון ריכוז לקוחות: תלות הכנסות בלקוחות מובילים, המלצות לצמצום סיכון, פיזור אידיאלי של תיק לקוחות.',
      },
      invoiceBehavior: {
        en: 'Analyze invoice payment behavior: average payment speed, late-paying clients, recommendations for improving cash collection (payment terms, follow-up timing).',
        he: 'נתח התנהגות תשלום חשבוניות: מהירות תשלום ממוצעת, לקוחות מאחרים, המלצות לשיפור גביה (תנאי תשלום, תזמון מעקב).',
      },
      seasonalPatterns: {
        en: 'Detect seasonal patterns: busy/slow months, income/expense seasonality, recommendations for smoothing cash flow across seasons.',
        he: 'זהה דפוסים עונתיים: חודשים עמוסים/שקטים, עונתיות בהכנסות/הוצאות, המלצות להחלקת תזרים לאורך העונות.',
      },
      balanceForecast: {
        en: 'Provide a detailed balance forecast for the next 1-3 months based on income/expense trends, pending invoices, and recurring obligations.',
        he: 'תן צפי יתרה מפורט ל-1-3 חודשים קדימה על בסיס מגמות הכנסות/הוצאות, חשבוניות בהמתנה, והתחייבויות חוזרות.',
      },
      savingsRecommendation: {
        en: `Recommend specific savings: emergency fund target (3-6 months of expenses), savings vehicles in Israel (deposits at ~4.5% in ${currentYear}, money market funds, Makam), specific monthly savings targets.`,
        he: `המלץ על חיסכון ספציפי: יעד קרן חירום (3-6 חודשי הוצאות), אפיקי חיסכון בישראל (פיקדונות ב-~4.5% ${currentYear}, קרנות כספיות, מק"מ), יעדי חיסכון חודשיים ספציפיים.`,
      },
      investmentRecommendations: {
        en: 'Detailed investment recommendations: study funds (best tax benefit), provident funds, ETFs (TA-125, S&P 500), government bonds, allocation percentages based on the business profile.',
        he: 'המלצות השקעה מפורטות: קרנות השתלמות (הטבת מס מיטבית), קופות גמל, תעודות סל (ת"א 125, S&P 500), אג"ח ממשלתיות, אחוזי הקצאה מותאמים לפרופיל העסק.',
      },
    };

    const guidance = locale === 'en' ? sectionGuidance[section].en : sectionGuidance[section].he;
    const base = locale === 'en'
      ? `You are an expert financial advisor for freelancers. Today's date: ${currentDate}. Give one focused, detailed recommendation. Return JSON with key "${section}". ${langInstruction}`
      : `אתה יועץ פיננסי מומחה לפרילנסרים. התאריך היום: ${currentDate}. תן המלצה אחת ממוקדת ומפורטת. החזר JSON עם מפתח "${section}". ${langInstruction}`;

    return `${base}\n\n${guidance}${this.getCountryContext(countryCode)}`;
  }

  // ─── Section Ask ───────────────────────────────────────────────────
  private buildSectionAsk(section: InsightSection, locale: 'he' | 'en'): string {
    const asks: Record<InsightSection, { en: string; he: string }> = {
      spendingPatterns: {
        en: `Provide only a spending pattern analysis (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק ניתוח דפוסי הוצאות (${section}). החזר JSON עם מפתח "${section}".`,
      },
      incomeTrends: {
        en: `Provide only an income trends analysis (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק ניתוח מגמות הכנסה (${section}). החזר JSON עם מפתח "${section}".`,
      },
      cashFlowHealth: {
        en: `Provide only a cash flow health assessment (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק הערכת בריאות תזרים (${section}). החזר JSON עם מפתח "${section}".`,
      },
      taxOptimization: {
        en: `Provide only tax optimization suggestions (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק המלצות ייעול מס (${section}). החזר JSON עם מפתח "${section}".`,
      },
      clientDiversification: {
        en: `Provide only client diversification analysis (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק ניתוח גיוון לקוחות (${section}). החזר JSON עם מפתח "${section}".`,
      },
      invoiceBehavior: {
        en: `Provide only invoice payment behavior analysis (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק ניתוח התנהגות תשלום חשבוניות (${section}). החזר JSON עם מפתח "${section}".`,
      },
      seasonalPatterns: {
        en: `Provide only seasonal pattern detection (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק זיהוי דפוסים עונתיים (${section}). החזר JSON עם מפתח "${section}".`,
      },
      balanceForecast: {
        en: `Provide only a balance forecast (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק צפי יתרה (${section}). החזר JSON עם מפתח "${section}".`,
      },
      savingsRecommendation: {
        en: `Provide only savings recommendations (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק המלצות חיסכון (${section}). החזר JSON עם מפתח "${section}".`,
      },
      investmentRecommendations: {
        en: `Provide only investment recommendations (${section}). Return JSON with key "${section}".`,
        he: `בבקשה תן רק המלצות השקעה (${section}). החזר JSON עם מפתח "${section}".`,
      },
    };

    return locale === 'en' ? asks[section].en : asks[section].he;
  }

  // ─── Data Prompt ───────────────────────────────────────────────────
  private buildFullDataPrompt(data: BusinessFinancialData, locale: 'he' | 'en', countryCode?: string): string {
    const isEn = locale === 'en';
    const cur = data.currency;

    // Monthly data
    const monthly = data.monthlyData
      .map((m) => {
        const surplus = m.income - m.expenses;
        return isEn
          ? `  ${m.month}: Income ${m.income.toFixed(0)} ${cur}, Expenses ${m.expenses.toFixed(0)} ${cur}, Net: ${surplus >= 0 ? '+' : ''}${surplus.toFixed(0)} ${cur}`
          : `  ${m.month}: הכנסות ${m.income.toFixed(0)} ${cur}, הוצאות ${m.expenses.toFixed(0)} ${cur}, נטו: ${surplus >= 0 ? '+' : ''}${surplus.toFixed(0)} ${cur}`;
      })
      .join('\n');

    // Accounts
    const accs = data.accounts
      .map((a) => {
        const balStr = a.balance != null ? `${a.balance.toLocaleString(isEn ? 'en-IL' : 'he-IL')} ${cur}` : (isEn ? 'N/A' : 'לא זמין');
        return `  - ${a.name} (${a.type}): ${balStr}`;
      })
      .join('\n');

    // Averages
    const totalIncome = data.monthlyData.reduce((s, m) => s + m.income, 0);
    const totalExpenses = data.monthlyData.reduce((s, m) => s + m.expenses, 0);
    const months = Math.max(1, data.monthlyData.length);
    const avgIncome = totalIncome / months;
    const avgExpenses = totalExpenses / months;
    const avgProfit = avgIncome - avgExpenses;
    const savingsRate = avgIncome > 0 ? ((avgProfit / avgIncome) * 100).toFixed(1) : '0';

    // Category spending
    const catLines = data.spendingByCategory.slice(0, 10).map((c) =>
      `  - ${c.name}: ${c.total.toFixed(0)} ${cur} (${c.count} transactions)`,
    ).join('\n');

    // Client revenue
    const clientLines = data.clientRevenue.slice(0, 10).map((c) => {
      const payDays = c.avgPaymentDays != null ? `, avg payment: ${c.avgPaymentDays} days` : '';
      return `  - ${c.name}: ${c.revenue.toFixed(0)} ${cur} (${c.invoiceCount} invoices${payDays})`;
    }).join('\n');

    // Invoice stats
    const invStats = isEn
      ? `  - Paid: ${data.invoiceStats.totalPaid}, Sent/Pending: ${data.invoiceStats.totalSent}, Overdue: ${data.invoiceStats.totalOverdue}\n  - Average payment: ${data.invoiceStats.avgPaymentDays} days\n  - Unpaid total: ${data.invoiceStats.unpaidAmount.toFixed(0)} ${cur}`
      : `  - שולמו: ${data.invoiceStats.totalPaid}, נשלחו/ממתינות: ${data.invoiceStats.totalSent}, באיחור: ${data.invoiceStats.totalOverdue}\n  - תשלום ממוצע: ${data.invoiceStats.avgPaymentDays} ימים\n  - סה"כ לא שולם: ${data.invoiceStats.unpaidAmount.toFixed(0)} ${cur}`;

    // Tax deductible expenses
    const taxLines = data.topExpenseCategories.slice(0, 8).map((c) => {
      const deductStr = c.isTaxDeductible
        ? (c.deductionRate < 100 ? ` (${c.deductionRate}% deductible)` : ' (fully deductible)')
        : ' (not deductible)';
      return `  - ${c.name}: ${c.total.toFixed(0)} ${cur}${deductStr}`;
    }).join('\n');

    // Project pipeline
    const projLines = data.projectPipeline.slice(0, 5).map((p) =>
      `  - ${p.name}${p.clientName ? ` (${p.clientName})` : ''}: ${p.budgetAmount.toFixed(0)} ${cur}`,
    ).join('\n');

    // Top client concentration
    const topClientRevenue = data.clientRevenue.length > 0 ? data.clientRevenue[0].revenue : 0;
    const totalClientRevenue = data.clientRevenue.reduce((s, c) => s + c.revenue, 0);
    const topClientPct = totalClientRevenue > 0 ? ((topClientRevenue / totalClientRevenue) * 100).toFixed(1) : '0';

    const countryLine = countryCode ? `Country: ${countryCode.toUpperCase().slice(0, 2)}\n` : '';

    if (isEn) {
      return `${countryLine}## Business Financial Data (last 6 months)

### Summary:
- Total balance: ${data.totalBalance.toFixed(0)} ${cur}
- Average monthly income: ${avgIncome.toFixed(0)} ${cur}
- Average monthly expenses: ${avgExpenses.toFixed(0)} ${cur}
- Average monthly profit: ${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(0)} ${cur}
- Profit margin: ${savingsRate}%
- Fixed recurring expenses/month: ${data.fixedExpensesMonthly.toFixed(0)} ${cur}
- Fixed recurring income/month: ${data.fixedIncomeMonthly.toFixed(0)} ${cur}
- VAT rate: ${data.vatRate}%

### Accounts:
${accs || 'No accounts'}

### Monthly Breakdown:
${monthly || 'No data'}

### Spending by Category (6 months):
${catLines || 'No category data'}

### Client Revenue (6 months):
${clientLines || 'No client data'}
- Top client concentration: ${topClientPct}% of revenue

### Invoice Statistics (6 months):
${invStats}

### Tax-Related Expense Categories:
${taxLines || 'No tax data'}

### Active Projects Pipeline:
${projLines || 'No active projects'}

Please provide comprehensive insights as requested.`;
    }

    return `${countryLine}## נתונים פיננסיים של העסק (6 חודשים אחרונים)

### סיכום:
- יתרה כוללת: ${data.totalBalance.toFixed(0)} ${cur}
- הכנסה חודשית ממוצעת: ${avgIncome.toFixed(0)} ${cur}
- הוצאה חודשית ממוצעת: ${avgExpenses.toFixed(0)} ${cur}
- רווח חודשי ממוצע: ${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(0)} ${cur}
- שיעור רווח: ${savingsRate}%
- הוצאות קבועות/חודש: ${data.fixedExpensesMonthly.toFixed(0)} ${cur}
- הכנסות קבועות/חודש: ${data.fixedIncomeMonthly.toFixed(0)} ${cur}
- שיעור מע"מ: ${data.vatRate}%

### חשבונות:
${accs || 'אין חשבונות'}

### פירוט חודשי:
${monthly || 'אין נתונים'}

### הוצאות לפי קטגוריה (6 חודשים):
${catLines || 'אין נתוני קטגוריות'}

### הכנסות מלקוחות (6 חודשים):
${clientLines || 'אין נתוני לקוחות'}
- ריכוז לקוח מוביל: ${topClientPct}% מההכנסות

### סטטיסטיקת חשבוניות (6 חודשים):
${invStats}

### קטגוריות הוצאה מוכרות למס:
${taxLines || 'אין נתוני מס'}

### פרויקטים פעילים:
${projLines || 'אין פרויקטים פעילים'}

בבקשה תן תובנות מקיפות כמבוקש.`;
  }

  // ─── Fallback Insights (Rule-Based) ─────────────────────────────────
  private getAllFallbackInsights(data: BusinessFinancialData, locale: 'he' | 'en'): FinancialInsights {
    return {
      spendingPatterns: this.getFallbackForSection(data, 'spendingPatterns', locale),
      incomeTrends: this.getFallbackForSection(data, 'incomeTrends', locale),
      cashFlowHealth: this.getFallbackForSection(data, 'cashFlowHealth', locale),
      taxOptimization: this.getFallbackForSection(data, 'taxOptimization', locale),
      clientDiversification: this.getFallbackForSection(data, 'clientDiversification', locale),
      invoiceBehavior: this.getFallbackForSection(data, 'invoiceBehavior', locale),
      seasonalPatterns: this.getFallbackForSection(data, 'seasonalPatterns', locale),
      balanceForecast: this.getFallbackForSection(data, 'balanceForecast', locale),
      savingsRecommendation: this.getFallbackForSection(data, 'savingsRecommendation', locale),
      investmentRecommendations: this.getFallbackForSection(data, 'investmentRecommendations', locale),
    };
  }

  private getFallbackForSection(
    data: BusinessFinancialData,
    section: InsightSection,
    locale: 'he' | 'en',
  ): string {
    const isEn = locale === 'en';
    const cur = data.currency;
    const months = Math.max(1, data.monthlyData.length);
    const avgIncome = data.monthlyData.reduce((s, m) => s + m.income, 0) / months;
    const avgExpenses = data.monthlyData.reduce((s, m) => s + m.expenses, 0) / months;
    const avgProfit = avgIncome - avgExpenses;

    switch (section) {
      case 'spendingPatterns': {
        if (data.spendingByCategory.length === 0) {
          return isEn
            ? 'Add categorized transactions to see spending pattern analysis.'
            : 'הוסף תנועות מקוטלגות כדי לראות ניתוח דפוסי הוצאות.';
        }
        const top3 = data.spendingByCategory.slice(0, 3);
        const lines = top3.map((c) =>
          isEn
            ? `- ${c.name}: ${c.total.toFixed(0)} ${cur} (${c.count} transactions)`
            : `- ${c.name}: ${c.total.toFixed(0)} ${cur} (${c.count} תנועות)`,
        );
        const fixedPct = avgExpenses > 0 ? ((data.fixedExpensesMonthly / avgExpenses) * 100).toFixed(0) : '0';
        const header = isEn
          ? `Top spending categories (6 months):\n${lines.join('\n')}\n\nFixed expenses are ${fixedPct}% of total expenses (${data.fixedExpensesMonthly.toFixed(0)} ${cur}/month). ${fixedPct === '0' ? 'Mark recurring transactions to track fixed costs.' : ''}`
          : `קטגוריות הוצאה מובילות (6 חודשים):\n${lines.join('\n')}\n\nהוצאות קבועות מהוות ${fixedPct}% מסה"כ ההוצאות (${data.fixedExpensesMonthly.toFixed(0)} ${cur}/חודש). ${fixedPct === '0' ? 'סמן תנועות חוזרות כדי לעקוב אחר הוצאות קבועות.' : ''}`;
        return header;
      }

      case 'incomeTrends': {
        if (data.monthlyData.length < 2) {
          return isEn
            ? 'Need at least 2 months of data to analyze income trends. Keep recording transactions.'
            : 'צריך לפחות 2 חודשי נתונים לניתוח מגמות הכנסה. המשך לתעד תנועות.';
        }
        const incomes = data.monthlyData.map((m) => m.income);
        const first = incomes.slice(0, Math.ceil(incomes.length / 2));
        const second = incomes.slice(Math.ceil(incomes.length / 2));
        const avgFirst = first.reduce((s, v) => s + v, 0) / first.length;
        const avgSecond = second.reduce((s, v) => s + v, 0) / second.length;
        const trend = avgSecond > avgFirst * 1.05 ? (isEn ? 'growing' : 'צומח') : avgSecond < avgFirst * 0.95 ? (isEn ? 'declining' : 'יורד') : (isEn ? 'stable' : 'יציב');
        const clientCount = data.clientRevenue.length;
        return isEn
          ? `Income trend: ${trend}. Average monthly income: ${avgIncome.toFixed(0)} ${cur}. Revenue from ${clientCount} active client(s). ${clientCount <= 1 ? 'Consider diversifying your client base to reduce risk.' : ''}`
          : `מגמת הכנסה: ${trend}. הכנסה חודשית ממוצעת: ${avgIncome.toFixed(0)} ${cur}. הכנסות מ-${clientCount} לקוח(ות) פעילים. ${clientCount <= 1 ? 'שקול לגוון את בסיס הלקוחות כדי להפחית סיכון.' : ''}`;
      }

      case 'cashFlowHealth': {
        if (avgExpenses === 0) {
          return isEn
            ? 'Add expense transactions to assess cash flow health.'
            : 'הוסף תנועות הוצאות כדי להעריך בריאות תזרים מזומנים.';
        }
        const runwayMonths = avgExpenses > 0 ? (data.totalBalance / avgExpenses).toFixed(1) : 'N/A';
        const healthStatus = Number(runwayMonths) >= 6
          ? (isEn ? 'Healthy' : 'בריא')
          : Number(runwayMonths) >= 3
            ? (isEn ? 'Moderate' : 'בינוני')
            : (isEn ? 'At risk' : 'בסיכון');
        const unpaid = data.invoiceStats.unpaidAmount;
        return isEn
          ? `Cash flow status: ${healthStatus}. Current balance: ${data.totalBalance.toFixed(0)} ${cur}. Runway: ~${runwayMonths} months of expenses. Unpaid invoices: ${unpaid.toFixed(0)} ${cur}. ${Number(runwayMonths) < 3 ? 'Consider building an emergency reserve of 3-6 months of expenses.' : ''}`
          : `מצב תזרים: ${healthStatus}. יתרה נוכחית: ${data.totalBalance.toFixed(0)} ${cur}. רנווי: ~${runwayMonths} חודשי הוצאות. חשבוניות שלא שולמו: ${unpaid.toFixed(0)} ${cur}. ${Number(runwayMonths) < 3 ? 'שקול לבנות רזרבת חירום של 3-6 חודשי הוצאות.' : ''}`;
      }

      case 'taxOptimization': {
        const deductibleCats = data.topExpenseCategories.filter((c) => c.isTaxDeductible);
        const nonDeductible = data.topExpenseCategories.filter((c) => !c.isTaxDeductible);
        const partialDeductible = data.topExpenseCategories.filter((c) => c.isTaxDeductible && c.deductionRate < 100);
        if (data.topExpenseCategories.length === 0) {
          return isEn
            ? 'Categorize your expenses to get tax optimization suggestions. Mark categories as tax-deductible in settings.'
            : 'קטלג את ההוצאות שלך כדי לקבל המלצות לייעול מס. סמן קטגוריות כמוכרות למס בהגדרות.';
        }
        const tips: string[] = [];
        if (isEn) {
          tips.push(`You have ${deductibleCats.length} deductible expense categories.`);
          if (partialDeductible.length > 0) {
            tips.push(`${partialDeductible.length} categories with partial deduction (e.g., car, home office). Ensure you document these properly.`);
          }
          if (nonDeductible.length > 0) {
            tips.push(`${nonDeductible.length} non-deductible categories. Review if any should be reclassified.`);
          }
          tips.push('Remember to deduct: home office (25-33%), car expenses (up to 45%), phone/internet, professional development, professional insurance.');
          tips.push('Consider maximizing study fund (Keren Hishtalmut) contributions for tax-free savings.');
        } else {
          tips.push(`יש לך ${deductibleCats.length} קטגוריות הוצאות מוכרות למס.`);
          if (partialDeductible.length > 0) {
            tips.push(`${partialDeductible.length} קטגוריות עם ניכוי חלקי (כגון רכב, משרד ביתי). ודא שאתה מתעד כראוי.`);
          }
          if (nonDeductible.length > 0) {
            tips.push(`${nonDeductible.length} קטגוריות לא מוכרות למס. בדוק אם יש מקום לסווג מחדש.`);
          }
          tips.push('זכור לנכות: משרד ביתי (25-33%), הוצאות רכב (עד 45%), טלפון/אינטרנט, השתלמויות מקצועיות, ביטוח מקצועי.');
          tips.push('שקול למקסם הפקדות לקרן השתלמות לחיסכון פטור ממס.');
        }
        return tips.join('\n');
      }

      case 'clientDiversification': {
        if (data.clientRevenue.length === 0) {
          return isEn
            ? 'No client revenue data available. Link invoices to clients to track revenue diversification.'
            : 'אין נתוני הכנסות מלקוחות. קשר חשבוניות ללקוחות כדי לעקוב אחר גיוון הכנסות.';
        }
        const totalRev = data.clientRevenue.reduce((s, c) => s + c.revenue, 0);
        const topClient = data.clientRevenue[0];
        const topPct = totalRev > 0 ? ((topClient.revenue / totalRev) * 100).toFixed(0) : '0';
        const clientCount = data.clientRevenue.length;
        const riskLevel = Number(topPct) > 50
          ? (isEn ? 'High risk' : 'סיכון גבוה')
          : Number(topPct) > 30
            ? (isEn ? 'Moderate risk' : 'סיכון בינוני')
            : (isEn ? 'Well diversified' : 'מגוון היטב');
        return isEn
          ? `Client diversification: ${riskLevel}. Top client "${topClient.name}" accounts for ${topPct}% of revenue. You have ${clientCount} active revenue-generating client(s). ${Number(topPct) > 40 ? 'Recommendation: Actively seek new clients to reduce dependency. Aim for no single client exceeding 30% of revenue.' : 'Good diversification. Continue maintaining multiple revenue streams.'}`
          : `גיוון לקוחות: ${riskLevel}. לקוח מוביל "${topClient.name}" מהווה ${topPct}% מההכנסות. יש לך ${clientCount} לקוח(ות) פעילים מניבי הכנסה. ${Number(topPct) > 40 ? 'המלצה: חפש לקוחות חדשים באופן פעיל כדי להפחית תלות. כוון שאף לקוח לא יעלה על 30% מההכנסות.' : 'גיוון טוב. המשך לשמור על מספר מקורות הכנסה.'}`;
      }

      case 'invoiceBehavior': {
        const stats = data.invoiceStats;
        if (stats.totalPaid === 0 && stats.totalSent === 0) {
          return isEn
            ? 'No invoice data available. Create and track invoices to analyze payment behavior.'
            : 'אין נתוני חשבוניות. צור ועקוב אחר חשבוניות כדי לנתח התנהגות תשלום.';
        }
        const tips: string[] = [];
        if (isEn) {
          tips.push(`Invoice stats (6 months): ${stats.totalPaid} paid, ${stats.totalSent} pending, ${stats.totalOverdue} overdue.`);
          if (stats.avgPaymentDays > 0) {
            tips.push(`Average payment time: ${stats.avgPaymentDays} days.`);
            if (stats.avgPaymentDays > 30) {
              tips.push('Payment times are slow. Consider: offering early payment discounts (2% net-10), sending payment reminders before due date, requiring deposits on large projects.');
            }
          }
          if (stats.totalOverdue > 0) {
            tips.push(`${stats.totalOverdue} overdue invoice(s) totaling ${stats.unpaidAmount.toFixed(0)} ${cur}. Follow up immediately.`);
          }
          // Late-paying clients
          const latePayers = data.clientRevenue.filter((c) => c.avgPaymentDays != null && c.avgPaymentDays > 30);
          if (latePayers.length > 0) {
            tips.push(`Late-paying clients: ${latePayers.map((c) => `${c.name} (avg ${c.avgPaymentDays} days)`).join(', ')}.`);
          }
        } else {
          tips.push(`סטטיסטיקת חשבוניות (6 חודשים): ${stats.totalPaid} שולמו, ${stats.totalSent} ממתינות, ${stats.totalOverdue} באיחור.`);
          if (stats.avgPaymentDays > 0) {
            tips.push(`זמן תשלום ממוצע: ${stats.avgPaymentDays} ימים.`);
            if (stats.avgPaymentDays > 30) {
              tips.push('זמני התשלום איטיים. שקול: הצעת הנחה לתשלום מוקדם (2% נטו-10), שליחת תזכורות לפני מועד התשלום, דרישת מקדמה על פרויקטים גדולים.');
            }
          }
          if (stats.totalOverdue > 0) {
            tips.push(`${stats.totalOverdue} חשבונית(ות) באיחור בסך ${stats.unpaidAmount.toFixed(0)} ${cur}. עקוב מיידית.`);
          }
          const latePayers = data.clientRevenue.filter((c) => c.avgPaymentDays != null && c.avgPaymentDays > 30);
          if (latePayers.length > 0) {
            tips.push(`לקוחות מאחרים: ${latePayers.map((c) => `${c.name} (ממוצע ${c.avgPaymentDays} ימים)`).join(', ')}.`);
          }
        }
        return tips.join('\n');
      }

      case 'seasonalPatterns': {
        if (data.monthlyData.length < 4) {
          return isEn
            ? 'Need at least 4 months of data to detect seasonal patterns. Keep recording transactions.'
            : 'צריך לפחות 4 חודשי נתונים לזיהוי דפוסים עונתיים. המשך לתעד תנועות.';
        }
        const incomes = data.monthlyData.map((m) => ({ month: m.month, income: m.income, expenses: m.expenses }));
        const maxIncome = incomes.reduce((best, m) => m.income > best.income ? m : best, incomes[0]);
        const minIncome = incomes.reduce((worst, m) => m.income < worst.income ? m : worst, incomes[0]);
        const variance = avgIncome > 0 ? ((maxIncome.income - minIncome.income) / avgIncome * 100).toFixed(0) : '0';
        return isEn
          ? `Income variance: ${variance}% between best and worst months. Best month: ${maxIncome.month} (${maxIncome.income.toFixed(0)} ${cur}). Slowest month: ${minIncome.month} (${minIncome.income.toFixed(0)} ${cur}). ${Number(variance) > 50 ? 'High seasonality detected. Build a cash reserve during strong months to cover slow periods.' : 'Relatively stable income across months.'}`
          : `שונות הכנסות: ${variance}% בין החודש הטוב לגרוע. חודש טוב: ${maxIncome.month} (${maxIncome.income.toFixed(0)} ${cur}). חודש שקט: ${minIncome.month} (${minIncome.income.toFixed(0)} ${cur}). ${Number(variance) > 50 ? 'זוהתה עונתיות גבוהה. בנה רזרבה בחודשים חזקים כדי לכסות תקופות שקטות.' : 'הכנסה יציבה יחסית לאורך החודשים.'}`;
      }

      case 'balanceForecast': {
        const hasIncome = avgIncome > 0;
        const hasExpenses = avgExpenses > 0;
        if (!hasIncome && !hasExpenses) {
          return isEn
            ? 'Not enough data for a balance forecast. Add transactions (income and expenses) to get an accurate forecast.'
            : 'אין מספיק נתונים לצפי יתרה. הוסף תנועות (הכנסות והוצאות) כדי לקבל צפי מדויק.';
        }
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const forecast1 = data.totalBalance + avgProfit;
        const forecast2 = data.totalBalance + avgProfit * 2;
        const forecast3 = data.totalBalance + avgProfit * 3;
        const pendingInvoice = data.invoiceStats.unpaidAmount;
        return isEn
          ? `Balance forecast (based on ${months}-month average):\n- Next month: ~${forecast1.toFixed(0)} ${cur}\n- 2 months: ~${forecast2.toFixed(0)} ${cur}\n- 3 months: ~${forecast3.toFixed(0)} ${cur}\n\nPending invoice payments of ${pendingInvoice.toFixed(0)} ${cur} could improve these projections when collected.`
          : `צפי יתרה (על בסיס ממוצע ${months} חודשים):\n- חודש הבא: ~${forecast1.toFixed(0)} ${cur}\n- עוד חודשיים: ~${forecast2.toFixed(0)} ${cur}\n- עוד 3 חודשים: ~${forecast3.toFixed(0)} ${cur}\n\nתשלומי חשבוניות בהמתנה של ${pendingInvoice.toFixed(0)} ${cur} יכולים לשפר את התחזיות בעת גבייה.`;
      }

      case 'savingsRecommendation': {
        if (avgIncome === 0) {
          return isEn
            ? 'Add income data to get savings recommendations.'
            : 'הוסף נתוני הכנסות כדי לקבל המלצות חיסכון.';
        }
        const emergencyTarget = avgExpenses * 6;
        const monthlySavings = Math.round(avgIncome * 0.15);
        return isEn
          ? `Recommended emergency fund: ${emergencyTarget.toFixed(0)} ${cur} (6 months of expenses). Monthly savings target: ${monthlySavings.toFixed(0)} ${cur} (15% of income). Options: bank deposits (~4.5% annual), money market funds, Makam (short-term government bonds). ${data.totalBalance >= emergencyTarget ? 'You have a healthy emergency fund. Consider investing surplus funds.' : `You need ${Math.max(0, emergencyTarget - data.totalBalance).toFixed(0)} ${cur} more for a full emergency fund.`}`
          : `קרן חירום מומלצת: ${emergencyTarget.toFixed(0)} ${cur} (6 חודשי הוצאות). יעד חיסכון חודשי: ${monthlySavings.toFixed(0)} ${cur} (15% מההכנסה). אפשרויות: פיקדונות בנקאיים (~4.5% שנתי), קרנות כספיות, מק"מ (אג"ח ממשלתיות קצרות). ${data.totalBalance >= emergencyTarget ? 'יש לך קרן חירום בריאה. שקול להשקיע עודפים.' : `חסרים לך ${Math.max(0, emergencyTarget - data.totalBalance).toFixed(0)} ${cur} לקרן חירום מלאה.`}`;
      }

      case 'investmentRecommendations': {
        if (avgIncome === 0) {
          return isEn
            ? 'Add income data to get investment recommendations. Common Israeli options: study funds, provident funds, ETFs, government bonds.'
            : 'הוסף נתוני הכנסות כדי לקבל המלצות השקעה. אפיקים נפוצים בישראל: קרנות השתלמות, קופות גמל, תעודות סל, אג"ח ממשלתיות.';
        }
        return isEn
          ? `Investment allocation suggestions for a freelancer earning ~${avgIncome.toFixed(0)} ${cur}/month:\n- Study Fund (Keren Hishtalmut): Tax-free after 6 years. Max ~37,500 ILS/year for self-employed.\n- Provident Fund (Kupat Gemel): Flexible investment savings. Consider equity-heavy track for long term.\n- ETFs: TA-125 (Israel) + S&P 500 (US) for diversification. Low management fees.\n- Government Bonds: Gilon/Shahar for stability, Makam for short-term parking.\n- Suggested split: 30% study fund, 25% provident, 30% ETFs, 15% bonds/deposits.`
          : `הצעות הקצאת השקעות לפרילנסר עם הכנסה של ~${avgIncome.toFixed(0)} ${cur}/חודש:\n- קרן השתלמות: פטור ממס אחרי 6 שנים. תקרה ~37,500 ₪/שנה לעצמאי.\n- קופת גמל להשקעה: חיסכון השקעתי גמיש. שקול מסלול מנייתי לטווח ארוך.\n- תעודות סל: ת"א 125 (ישראל) + S&P 500 (ארה"ב) לגיוון. דמי ניהול נמוכים.\n- אג"ח ממשלתיות: גילון/שחר ליציבות, מק"מ לחנייה קצרה.\n- חלוקה מוצעת: 30% קרן השתלמות, 25% קופת גמל, 30% תעודות סל, 15% אג"ח/פיקדון.`;
      }

      default:
        return isEn
          ? 'No insights available for this section yet.'
          : 'אין תובנות זמינות עבור חלק זה עדיין.';
    }
  }
}

// ─── Utility Function ────────────────────────────────────────────────────
function toReadableString(v: unknown): string {
  if (typeof v === 'string' && v.trim()) return v;
  if (v != null && typeof v === 'object') {
    if (Array.isArray(v)) {
      return v
        .map((item) => {
          if (typeof item === 'string') return '- ' + item;
          if (item != null && typeof item === 'object') {
            const obj = item as Record<string, unknown>;
            const t = obj.type ?? obj.name ?? obj.title;
            const d = obj.description ?? obj.desc ?? obj.details;
            const p = obj.percentage ?? obj.allocation;
            let line = '- ';
            if (t) line += String(t);
            if (p) line += ` (${p}%)`;
            if (d) line += ': ' + String(d);
            return line.trim() === '-' ? '- ' + JSON.stringify(item) : line;
          }
          return '- ' + JSON.stringify(item);
        })
        .join('\n');
    }
    // Object with keys - try to format nicely
    const obj = v as Record<string, unknown>;
    const parts: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') parts.push(`${key}: ${val}`);
      else if (typeof val === 'number') parts.push(`${key}: ${val}`);
      else parts.push(`${key}: ${JSON.stringify(val)}`);
    }
    if (parts.length > 0) return parts.join('\n');
  }
  if (typeof v === 'number') return String(v);
  return '';
}
