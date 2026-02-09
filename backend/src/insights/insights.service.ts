import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { AccountType } from '@prisma/client';

const BALANCE_ACCOUNT_TYPES: AccountType[] = ['BANK', 'INVESTMENT', 'PENSION', 'INSURANCE', 'CASH'];

export type InsightSection =
  | 'balanceForecast'
  | 'savingsRecommendation'
  | 'investmentRecommendations'
  | 'taxTips'
  | 'spendingInsights'
  | 'monthlySummary';

export const INSIGHT_SECTIONS: InsightSection[] = [
  'balanceForecast',
  'savingsRecommendation',
  'investmentRecommendations',
  'taxTips',
  'spendingInsights',
  'monthlySummary',
];

export interface FinancialInsights {
  balanceForecast: string;
  savingsRecommendation: string;
  investmentRecommendations: string;
  taxTips?: string;
  spendingInsights?: string;
  monthlySummary?: string;
}

@Injectable()
export class InsightsService {
  constructor(private prisma: PrismaService) {}

  async getFinancialData(householdId: string) {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const [accountsRaw, transactions] = await Promise.all([
      this.prisma.account.findMany({
        where: { householdId, isActive: true },
        select: { id: true, name: true, type: true, balance: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          householdId,
          date: { gte: sixMonthsAgo, lte: now },
        },
        select: { date: true, amount: true, accountId: true, isRecurring: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const accountIds = accountsRaw.map((a) => a.id);
    const sums =
      accountIds.length > 0
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

    // Fixed (recurring) expenses and income in the period (for insights)
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

    // Spending by category (for monthly summary insights)
    const categories = await this.prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true, slug: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const categorySpending = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { householdId, date: { gte: sixMonthsAgo, lte: now }, amount: { lt: 0 } },
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

    // Fetch user's learned categorization rules for personalized insights
    const categoryRules = await this.prisma.categoryRule.findMany({
      where: { householdId, isActive: true },
      orderBy: { priority: 'desc' },
      take: 20,
      include: { category: { select: { name: true, slug: true } } },
    });
    const userPatterns = categoryRules.map((r) => ({
      pattern: r.pattern,
      categoryName: r.category.name,
      categorySlug: r.category.slug,
      priority: r.priority,
    }));

    return {
      totalBalance,
      accounts,
      monthlyData,
      currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      fixedExpensesSum,
      fixedIncomeSum,
      fixedExpensesMonthly,
      fixedIncomeMonthly,
      spendingByCategory,
      userPatterns,
    };
  }

  private normalizeLang(lang?: string): 'he' | 'en' {
    return lang === 'en' ? 'en' : 'he';
  }

  private getCountryContext(countryCode?: string): string {
    if (!countryCode || typeof countryCode !== 'string') return '';
    const code = countryCode.toUpperCase().slice(0, 2);
    if (!code) return '';
    return `\n\nUser's country (ISO 3166-1 alpha-2): ${code}. Tailor all recommendations to this country's market, regulations, tax rules, and currency where relevant.`;
  }

  async getInsights(householdId: string, lang?: string, countryCode?: string): Promise<FinancialInsights> {
    const data = await this.getFinancialData(householdId);
    const client = this.getOpenAIClient();
    const locale = this.normalizeLang(lang);
    if (!client) {
      return this.getFallbackInsights(data, false, locale);
    }

    const prompt = this.buildPrompt(data, locale, countryCode);
    const systemPrompt = this.buildSystemPrompt(locale, countryCode);
    
    try {
      const insightMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];
      let content: string | null = null;
      try {
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: insightMessages,
          response_format: { type: 'json_object' },
        });
        content = completion.choices[0]?.message?.content;
      } catch (jsonErr: unknown) {
        console.warn('[Insights] json_object format failed, retrying:', jsonErr instanceof Error ? jsonErr.message : String(jsonErr));
        const fallback = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: insightMessages,
        });
        content = fallback.choices[0]?.message?.content;
        if (content) { const m = content.match(/\{[\s\S]*\}/); content = m ? m[0] : content; }
      }
      if (!content) return this.getFallbackInsights(data, true, locale);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const fallback = this.getFallbackInsights(data, true, locale);
      
      const toReadableString = (v: unknown): string => {
        if (typeof v === 'string' && v.trim()) return v;
        if (v != null && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (Array.isArray(o)) {
            return o
              .map((item) => {
                if (typeof item === 'string') return '• ' + item;
                if (item != null && typeof item === 'object') {
                  const t = (item as Record<string, unknown>).type ?? (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).title;
                  const d = (item as Record<string, unknown>).description ?? (item as Record<string, unknown>).desc ?? (item as Record<string, unknown>).details;
                  const p = (item as Record<string, unknown>).percentage ?? (item as Record<string, unknown>).allocation;
                  let line = '• ';
                  if (t) line += String(t);
                  if (p) line += ` (${p}%)`;
                  if (d) line += ': ' + String(d);
                  return line.trim() === '•' ? '• ' + JSON.stringify(item) : line;
                }
                return '• ' + JSON.stringify(item);
              })
              .join('\n');
          }
        }
        if (typeof v === 'number') return String(v);
        return '';
      };
      
      return {
        balanceForecast: toReadableString(parsed.balanceForecast) || fallback.balanceForecast,
        savingsRecommendation: toReadableString(parsed.savingsRecommendation) || fallback.savingsRecommendation,
        investmentRecommendations: toReadableString(parsed.investmentRecommendations) || fallback.investmentRecommendations,
        taxTips: toReadableString(parsed.taxTips) || undefined,
        spendingInsights: toReadableString(parsed.spendingInsights) || undefined,
        monthlySummary: toReadableString(parsed.monthlySummary) || undefined,
      };
    } catch {
      return this.getFallbackInsights(data, true, locale);
    }
  }

  async getInsightSection(householdId: string, section: InsightSection, lang?: string, countryCode?: string): Promise<{ content: string }> {
    const data = await this.getFinancialData(householdId);
    const client = this.getOpenAIClient();
    const locale = this.normalizeLang(lang);
    const fallback = this.getFallbackForSection(data, section, !!client, locale);
    if (!client) {
      return { content: fallback };
    }

    const prompt = this.buildPrompt(data, locale, countryCode);
    const sectionPrompt = this.buildSectionAsk(section, locale);
    const systemPrompt = this.buildSectionSystemPrompt(section, locale, countryCode);

    try {
      const sectionMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${prompt}\n\n${sectionPrompt}` },
      ];
      let content: string | null = null;
      try {
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: sectionMessages,
          response_format: { type: 'json_object' },
        });
        content = completion.choices[0]?.message?.content;
      } catch (jsonErr: unknown) {
        console.warn('[Insights] Section json_object format failed, retrying:', jsonErr instanceof Error ? jsonErr.message : String(jsonErr));
        const fb = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: sectionMessages,
        });
        content = fb.choices[0]?.message?.content;
        if (content) { const m = content.match(/\{[\s\S]*\}/); content = m ? m[0] : content; }
      }
      if (!content) return { content: fallback };
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const raw = parsed[section];
      const toReadableString = (v: unknown): string => {
        if (typeof v === 'string' && v.trim()) return v;
        if (v != null && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (Array.isArray(o)) {
            return o
              .map((item) => {
                if (typeof item === 'string') return '• ' + item;
                if (item != null && typeof item === 'object') {
                  const t = (item as Record<string, unknown>).type ?? (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).title;
                  const d = (item as Record<string, unknown>).description ?? (item as Record<string, unknown>).desc ?? (item as Record<string, unknown>).details;
                  const p = (item as Record<string, unknown>).percentage ?? (item as Record<string, unknown>).allocation;
                  let line = '• ';
                  if (t) line += String(t);
                  if (p) line += ` (${p}%)`;
                  if (d) line += ': ' + String(d);
                  return line.trim() === '•' ? '• ' + JSON.stringify(item) : line;
                }
                return '• ' + JSON.stringify(item);
              })
              .join('\n');
          }
        }
        if (typeof v === 'number') return String(v);
        return '';
      };
      const text = toReadableString(raw);
      return { content: text?.trim() ? text : fallback };
    } catch {
      return { content: fallback };
    }
  }

  private buildSectionAsk(section: InsightSection, locale: 'he' | 'en'): string {
    if (locale === 'en') {
      const asks: Record<InsightSection, string> = {
        balanceForecast: 'Provide only a detailed balance forecast (balanceForecast) for the next 1-3 months. Return JSON with key balanceForecast.',
        savingsRecommendation: 'Provide only savings recommendations (savingsRecommendation) with specific amounts. Return JSON with key savingsRecommendation.',
        investmentRecommendations: 'Provide only detailed investment recommendations (investmentRecommendations). Return JSON with key investmentRecommendations.',
        taxTips: 'Provide only tax tips (taxTips). Return JSON with key taxTips.',
        spendingInsights: 'Provide only spending insights (spendingInsights). Return JSON with key spendingInsights.',
        monthlySummary: 'Provide a monthly summary (monthlySummary): analyze each month\'s spending patterns, identify what the user spent most on, where they can save, and which expenses to consider reducing. Compare months to highlight trends. Return JSON with key monthlySummary.',
      };
      return asks[section];
    }
    const asks: Record<InsightSection, string> = {
      balanceForecast: 'בבקשה תן רק צפי יתרה מפורט (balanceForecast) - תחזית ל-1-3 חודשים. החזר JSON עם מפתח balanceForecast.',
      savingsRecommendation: 'בבקשה תן רק המלצות חיסכון (savingsRecommendation) עם סכומים ספציפיים. החזר JSON עם מפתח savingsRecommendation.',
      investmentRecommendations: 'בבקשה תן רק המלצות השקעה (investmentRecommendations) מפורטות. החזר JSON עם מפתח investmentRecommendations.',
      taxTips: 'בבקשה תן רק טיפים למס (taxTips). החזר JSON עם מפתח taxTips.',
      spendingInsights: 'בבקשה תן רק תובנות על ההוצאות (spendingInsights). החזר JSON עם מפתח spendingInsights.',
      monthlySummary: 'בבקשה תן סיכום חודשי (monthlySummary): נתח את דפוסי ההוצאות בכל חודש, זהה על מה המשתמש הוציא הכי הרבה, איפה אפשר לחסוך, ואילו הוצאות כדאי לשקול להפחית. השווה בין חודשים כדי לזהות מגמות. החזר JSON עם מפתח monthlySummary.',
    };
    return asks[section];
  }

  private buildSectionSystemPrompt(section: InsightSection, locale: 'he' | 'en', countryCode?: string): string {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentDate = locale === 'en'
      ? now.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
      : now.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    const langInstruction = locale === 'en'
      ? 'Respond entirely in English. Use Israeli market data and ILS but write all content in English.'
      : 'כתוב את כל התוכן בעברית.';
    if (locale === 'en') {
      const base = `You are an expert financial advisor for the Israeli market. Today's date: ${currentDate}. Give one focused recommendation. Return JSON with a single key only. ${langInstruction}`;
      const sectionGuidance: Record<InsightSection, string> = {
        balanceForecast: 'Calculate an accurate balance forecast from income and expenses. Consider fixed (recurring) expenses and income when given; they repeat every month. If there are only expenses, say so and recommend adding income. Give a 1-3 month forecast.',
        savingsRecommendation: `Recommend a specific emergency fund amount (3-6 months of expenses). Prefer at least 3-6 months of fixed (recurring) expenses when that data is provided. Reference Israeli rates (around 4.5% in ${currentYear}). Mention deposits, money market funds, Makam.`,
        investmentRecommendations: 'Detailed investment recommendations: provident funds, investment funds, mutual funds/ETFs, government bonds. Israeli product names, allocation percentages, expected returns.',
        taxTips: 'Tax credit points, tax benefits for pension/provident, advanced study fund, tax refunds.',
        spendingInsights: 'Identify spending patterns, including fixed vs variable expenses when fixed expenses are provided. Compare to average, give category-specific saving tips.',
        monthlySummary: 'Analyze monthly spending patterns over the last months. For each month, highlight top spending categories, compare to previous months, identify trends (increasing/decreasing expenses). Suggest specific expenses to reduce and areas where the user is doing well. Give actionable monthly tips.',
      };
      return `${base}\n\n${sectionGuidance[section]}${this.getCountryContext(countryCode)}`;
    }
    const base = `אתה יועץ פיננסי מומחה לשוק הישראלי. התאריך היום: ${currentDate}. תפקידך לתת המלצה אחת ממוקדת. החזר JSON עם מפתח אחד בלבד. ${langInstruction}`;
    const sectionGuidance: Record<InsightSection, string> = {
      balanceForecast: 'חשב צפי יתרה מדויק על בסיס הכנסות והוצאות. התחשב בהוצאות והכנסות קבועות כשמופיעות – הן חוזרות כל חודש. אם יש רק הוצאות - ציין והמלץ להוסיף הכנסות. תן תחזית ל-1-3 חודשים.',
      savingsRecommendation: `המלץ על סכום ספציפי לחיסכון חירום (3-6 חודשי הוצאות). העדף לפחות 3-6 חודשי הוצאות קבועות כשהנתון קיים. התייחס לריביות בישראל (כ-4.5% ${currentYear}). הזכר פיקדון, קרן כספית, פק"מ.`,
      investmentRecommendations: 'המלצות השקעה מפורטות: קרנות השתלמות, קופות גמל, קרנות נאמנות/תעודות סל, אג"ח. שמות מוצרים ישראלים, אחוזי הקצאה, תשואות משוערות.',
      taxTips: 'נקודות זיכוי, הטבות מס על פנסיה/קופת גמל, קרן השתלמות, החזרי מס.',
      spendingInsights: 'זהה דפוסי הוצאות, כולל הוצאות קבועות לעומת משתנות כשמופיעות. השווה לממוצע, תן טיפים לחיסכון בקטגוריות.',
      monthlySummary: 'נתח את דפוסי ההוצאות לפי חודשים. לכל חודש, הדגש את הקטגוריות המובילות, השווה לחודשים קודמים, זהה מגמות (עליה/ירידה בהוצאות). הצע הוצאות ספציפיות להפחתה ותחומים בהם המשתמש מתנהל היטב. תן טיפים חודשיים מעשיים.',
    };
    return `${base}\n\n${sectionGuidance[section]}${this.getCountryContext(countryCode)}`;
  }

  private getFallbackForSection(
    data: Awaited<ReturnType<typeof this.getFinancialData>>,
    section: InsightSection,
    aiEnabled: boolean,
    locale: 'he' | 'en',
  ): string {
    const full = this.getFallbackInsights(data, aiEnabled, locale);
    if (section === 'balanceForecast') return full.balanceForecast;
    if (section === 'savingsRecommendation') return full.savingsRecommendation;
    if (section === 'investmentRecommendations') return full.investmentRecommendations;
    if (section === 'taxTips') {
      return locale === 'en'
        ? 'Add income data and/or employment status (employed/self-employed) to get tailored tax tips.'
        : 'הוסף נתוני הכנסות ו/או סטטוס תעסוקה (שכיר/עצמאי) כדי לקבל טיפים למס מותאמים.';
    }
    if (section === 'spendingInsights') {
      const avgExpenses = data.monthlyData.length > 0
        ? data.monthlyData.reduce((s, m) => s + m.expenses, 0) / data.monthlyData.length
        : 0;
      if (locale === 'en') {
        return avgExpenses > 0
          ? `Average monthly spending: ${avgExpenses.toFixed(0)} ILS. Add category breakdown for detailed insights.`
          : 'Add transactions and expenses to get spending insights.';
      }
      return avgExpenses > 0
        ? `הוצאה חודשית ממוצעת: ${avgExpenses.toFixed(0)} ₪. הוסף פירוט לפי קטגוריות כדי לקבל תובנות מפורטות.`
        : 'הוסף תנועות והוצאות כדי לקבל תובנות על ההוצאות.';
    }
    if (section === 'monthlySummary') {
      if (data.monthlyData.length === 0) {
        return locale === 'en'
          ? 'Add transactions to get a monthly spending summary.'
          : 'הוסף תנועות כדי לקבל סיכום הוצאות חודשי.';
      }
      const lines = data.monthlyData.map((m) => {
        const surplus = m.income - m.expenses;
        return locale === 'en'
          ? `${m.month}: Income ${m.income.toFixed(0)} ILS, Expenses ${m.expenses.toFixed(0)} ILS, ${surplus >= 0 ? 'Surplus' : 'Deficit'}: ${Math.abs(surplus).toFixed(0)} ILS`
          : `${m.month}: הכנסות ${m.income.toFixed(0)} ₪, הוצאות ${m.expenses.toFixed(0)} ₪, ${surplus >= 0 ? 'עודף' : 'גירעון'}: ${Math.abs(surplus).toFixed(0)} ₪`;
      });
      const topCategories = (data.spendingByCategory ?? []).slice(0, 5).map((c) =>
        locale === 'en'
          ? `• ${c.name}: ${c.total.toFixed(0)} ILS`
          : `• ${c.name}: ${c.total.toFixed(0)} ₪`,
      );
      const header = locale === 'en' ? 'Monthly breakdown:' : 'פירוט חודשי:';
      const catHeader = topCategories.length > 0
        ? (locale === 'en' ? '\n\nTop spending categories (6 months):' : '\n\nקטגוריות הוצאה מובילות (6 חודשים):')
        : '';
      return `${header}\n${lines.join('\n')}${catHeader}${topCategories.length > 0 ? '\n' + topCategories.join('\n') : ''}`;
    }
    return '';
  }

  private buildSystemPrompt(locale: 'he' | 'en', countryCode?: string): string {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentDate = locale === 'en'
      ? now.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
      : now.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    const langInstruction = locale === 'en'
      ? '\n\nRespond entirely in English. Use Israeli market data and ILS amounts but write all content in clear, practical English.'
      : '\n\nכתוב בעברית, בצורה ברורה ומעשית. השתמש בנתונים עדכניים על השוק הישראלי.';

    if (locale === 'en') {
      return `You are an expert financial advisor for the Israeli market. Today's date: ${currentDate}.

Your role is to give detailed, practical, and specific financial recommendations for an Israeli user.

## Key guidelines:

### Balance forecast (balanceForecast):
- Calculate an accurate forecast from income and expenses; use fixed (recurring) expenses and income when provided
- If there are only expenses and no income, state this and recommend adding income
- Give a 1-3 month forecast

### Savings recommendation (savingsRecommendation):
- Recommend a specific emergency fund amount (typically 3-6 months of expenses; prefer 3-6 months of fixed expenses when provided)
- Reference current Israeli deposit rates (Bank of Israel rate ~4.5% in ${currentYear})
- Mention options such as: bank deposit, money market fund, Makam

### Investment recommendations (investmentRecommendations):
Give specific, detailed recommendations:
1. Provident funds (Heshtalmut) - best tax benefit in Israel
2. Investment savings funds (Kupat Gemel)
3. Mutual funds and ETFs (e.g. TA-125, S&P 500)
4. Government bonds (Gilon, Shahar, Makam)
5. Match allocation to risk profile (e.g. 60% equity, 30% bonds, 10% cash)

### Tax tips (taxTips): credit points, pension tax benefits, study fund caps, refunds.

### Spending insights (spendingInsights): identify patterns (including fixed vs variable when fixed data is given), compare to average, category-specific saving tips.

## Response format:
Return JSON with keys: balanceForecast, savingsRecommendation, investmentRecommendations, taxTips (optional), spendingInsights (optional).${langInstruction}${this.getCountryContext(countryCode)}`;
    }

    return `אתה יועץ פיננסי מומחה לשוק הישראלי. התאריך היום: ${currentDate}.

תפקידך לתת המלצות פיננסיות מפורטות, מעשיות וספציפיות למשתמש ישראלי.

## הנחיות חשובות:

### צפי יתרה (balanceForecast):
- חשב צפי מדויק על בסיס ההכנסות וההוצאות
- אם יש רק הוצאות ואין הכנסות - ציין זאת והמלץ להוסיף הכנסות
- תן תחזית ל-1-3 חודשים קדימה

### המלצות חיסכון (savingsRecommendation):
- המלץ על סכום ספציפי לחיסכון חירום (בדרך כלל 3-6 חודשי הוצאות; העדף 3-6 חודשי הוצאות קבועות כשהנתון קיים)
- התייחס לריביות הנוכחיות בפיקדונות בישראל (ריבית בנק ישראל כ-4.5% נכון ל-${currentYear})
- הזכר אפשרויות כמו: פיקדון בנקאי, קרן כספית, פק"מ

### המלצות השקעה (investmentRecommendations):
זה החלק הכי חשוב - תן המלצות ספציפיות ומפורטות:

1. **קרנות השתלמות** - ההטבה הכי טובה בישראל:
   - פטור ממס רווחי הון אחרי 6 שנים
   - תקרת הפקדה שנתית: כ-20,520 ₪ לשכיר, כ-37,500 ₪ לעצמאי
   - המלץ על בתי השקעות ספציפיים (מור, אלטשולר שחם, מיטב, הראל, פסגות)

2. **קופות גמל להשקעה**:
   - מס רווחי הון מופחת (25% במקום 25%+)
   - גמישות במשיכה
   - המלץ על מסלולים (מנייתי, אג"ח, משולב)

3. **קרנות נאמנות ותעודות סל**:
   - קרנות מחקות מדד (ת"א 125, S&P 500)
   - המלץ על קרנות ספציפיות פופולריות בישראל
   - ציין דמי ניהול משוערים

4. **אג"ח ממשלתיות**:
   - אג"ח מדינת ישראל (גילון, שחר)
   - מק"מ לטווח קצר
   - ציין תשואות משוערות

5. **התאמה לפרופיל סיכון**:
   - על בסיס היתרה והגיל המשוער - המלץ על חלוקת תיק
   - למשל: 60% מניות, 30% אג"ח, 10% מזומן

### טיפים למס (taxTips):
- נקודות זיכוי רלוונטיות
- הטבות מס על חיסכון פנסיוני
- תקרות הפקדה לקרן השתלמות
- החזרי מס אפשריים

### תובנות הוצאות (spendingInsights):
- זהה דפוסי הוצאות חריגים (כולל קבועות לעומת משתנות כשמופיעות)
- השווה להוצאה ממוצעת במשק הישראלי
- תן טיפים לחיסכון בקטגוריות ספציפיות

## פורמט התשובה:
החזר JSON עם המפתחות:
- balanceForecast: טקסט מפורט
- savingsRecommendation: טקסט מפורט עם סכומים ספציפיים
- investmentRecommendations: טקסט מפורט עם שמות קרנות/מוצרים ספציפיים, אחוזי הקצאה מומלצים
- taxTips: טיפים למס (אופציונלי)
- spendingInsights: תובנות על ההוצאות (אופציונלי)
${langInstruction}${this.getCountryContext(countryCode)}`;
  }

  private openai: OpenAI | null = null;

  private getOpenAIClient(): OpenAI | null {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    if (!this.openai) this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  private buildPrompt(data: Awaited<ReturnType<typeof this.getFinancialData>>, locale: 'he' | 'en', countryCode?: string): string {
    const isEn = locale === 'en';
    const monthly = data.monthlyData
      .map((m) => {
        const surplus = m.income - m.expenses;
        if (isEn) return `  ${m.month}: Income ${m.income.toFixed(0)} ILS, Expenses ${m.expenses.toFixed(0)} ILS, Surplus/Deficit: ${surplus >= 0 ? '+' : ''}${surplus.toFixed(0)} ILS`;
        return `  ${m.month}: הכנסות ${m.income.toFixed(0)} ₪, הוצאות ${m.expenses.toFixed(0)} ₪, עודף/גירעון: ${surplus >= 0 ? '+' : ''}${surplus.toFixed(0)} ₪`;
      })
      .join('\n');

    const accs = data.accounts
      .map((a) => {
        const typeLabel = isEn ? this.getAccountTypeEnglish(a.type) : this.getAccountTypeHebrew(a.type);
        const balanceStr = a.balance != null ? (isEn ? a.balance.toLocaleString('en-IL') + ' ILS' : a.balance.toLocaleString('he-IL') + ' ₪') : (isEn ? 'not specified' : 'לא צוין');
        return `  • ${a.name} (${typeLabel}): ${balanceStr}`;
      })
      .join('\n');

    const totalIncome = data.monthlyData.reduce((s, m) => s + m.income, 0);
    const totalExpenses = data.monthlyData.reduce((s, m) => s + m.expenses, 0);
    const avgMonthlyIncome = data.monthlyData.length > 0 ? totalIncome / data.monthlyData.length : 0;
    const avgMonthlyExpenses = data.monthlyData.length > 0 ? totalExpenses / data.monthlyData.length : 0;
    const avgMonthlySurplus = avgMonthlyIncome - avgMonthlyExpenses;
    const savingsRate = avgMonthlyIncome > 0 ? ((avgMonthlySurplus / avgMonthlyIncome) * 100).toFixed(1) : 0;

    let financialProfile = '';
    if (data.totalBalance > 100000) {
      financialProfile = isEn ? 'High balance - suitable for diversified investments' : 'יתרה גבוהה - מתאים להשקעות מגוונות';
    } else if (data.totalBalance > 30000) {
      financialProfile = isEn ? 'Moderate balance - room to start investing' : 'יתרה בינונית - יש מקום להתחיל להשקיע';
    } else if (data.totalBalance > 0) {
      financialProfile = isEn ? 'Low balance - focus on building emergency fund' : 'יתרה נמוכה - כדאי להתמקד בבניית חיסכון חירום';
    } else {
      financialProfile = isEn ? 'Negative or zero balance - focus on cutting expenses' : 'יתרה שלילית או אפסית - יש להתמקד בצמצום הוצאות';
    }

    const d = data as Awaited<ReturnType<typeof this.getFinancialData>> & { fixedExpensesMonthly?: number; fixedIncomeMonthly?: number };
    const fixedExpMonthly = d.fixedExpensesMonthly ?? 0;
    const fixedIncMonthly = d.fixedIncomeMonthly ?? 0;

    const catLines = (data.spendingByCategory ?? []).slice(0, 10).map((c) =>
      isEn
        ? `  • ${c.name}: ${c.total.toLocaleString('en-IL')} ILS (${c.count} transactions)`
        : `  • ${c.name}: ${c.total.toLocaleString('he-IL')} ₪ (${c.count} תנועות)`,
    ).join('\n');

    // User's learned categorization patterns
    const patternLines = (data.userPatterns ?? []).slice(0, 15).map((p) =>
      `  • "${p.pattern}" → ${p.categoryName}`,
    ).join('\n');

    const countryLine = countryCode ? `User's country (ISO): ${countryCode.toUpperCase().slice(0, 2)}\n\n` : '';
    if (isEn) {
      return `${countryLine}## My household data (last 6 months)

### Financial summary:
- Total current balance: ${data.totalBalance.toLocaleString('en-IL')} ILS
- Average monthly income: ${avgMonthlyIncome.toLocaleString('en-IL')} ILS
- Average monthly expenses: ${avgMonthlyExpenses.toLocaleString('en-IL')} ILS
- Average surplus/deficit: ${avgMonthlySurplus >= 0 ? '+' : ''}${avgMonthlySurplus.toLocaleString('en-IL')} ILS
- Savings rate: ${savingsRate}%
- Financial profile: ${financialProfile}
- Fixed (recurring) expenses per month: ${fixedExpMonthly.toFixed(0)} ILS (included in expenses above)
- Fixed (recurring) income per month: ${fixedIncMonthly.toFixed(0)} ILS (included in income above)

### Accounts:
${accs || 'No accounts defined'}

### Monthly breakdown:
${monthly || 'No data'}

### Top spending categories (6 months total):
${catLines || 'No category data'}
${patternLines ? `\n### User's categorization preferences (learned from corrections):\n${patternLines}` : ''}

---

Please provide the insights as requested (in English).`;
    }

    return `${countryLine}## נתוני משק הבית שלי (6 חודשים אחרונים)

### סיכום פיננסי:
- יתרה נוכחית כוללת: ${data.totalBalance.toLocaleString('he-IL')} ₪
- הכנסה חודשית ממוצעת: ${avgMonthlyIncome.toLocaleString('he-IL')} ₪
- הוצאה חודשית ממוצעת: ${avgMonthlyExpenses.toLocaleString('he-IL')} ₪
- עודף/גירעון ממוצע: ${avgMonthlySurplus >= 0 ? '+' : ''}${avgMonthlySurplus.toLocaleString('he-IL')} ₪
- שיעור חיסכון: ${savingsRate}%
- פרופיל פיננסי: ${financialProfile}
- הוצאות קבועות (חודשי): ${fixedExpMonthly.toFixed(0)} ₪ (כלולות בהוצאות למעלה)
- הכנסות קבועות (חודשי): ${fixedIncMonthly.toFixed(0)} ₪ (כלולות בהכנסות למעלה)

### חשבונות:
${accs || 'אין חשבונות מוגדרים'}

### פירוט חודשי:
${monthly || 'אין נתונים'}

### קטגוריות הוצאה מובילות (סה"כ 6 חודשים):
${catLines || 'אין נתוני קטגוריות'}
${patternLines ? `\n### העדפות קטגוריזציה של המשתמש (נלמדו מתיקונים):\n${patternLines}` : ''}

---

בבקשה תן לי:
1. צפי יתרה מפורט לחודשים הקרובים
2. המלצות חיסכון עם סכומים ספציפיים ואפשרויות השקעה לחיסכון (פק"מ, קרן כספית, וכו')
3. המלצות השקעה מפורטות ומותאמות לפרופיל שלי - כולל שמות של קרנות/מוצרים ספציפיים בשוק הישראלי, אחוזי הקצאה מומלצים, ותשואות צפויות
4. טיפים למס והטבות שאני עשוי לפספס
5. תובנות על דפוסי ההוצאות שלי והמלצות לשיפור`;
  }

  private getAccountTypeEnglish(type: string): string {
    const types: Record<string, string> = {
      BANK: 'Bank',
      CREDIT_CARD: 'Credit card',
      INVESTMENT: 'Investment',
      PENSION: 'Pension',
      INSURANCE: 'Insurance',
      CASH: 'Cash',
    };
    return types[type] || type;
  }

  private getAccountTypeHebrew(type: string): string {
    const types: Record<string, string> = {
      BANK: 'בנק',
      CREDIT_CARD: 'כרטיס אשראי',
      INVESTMENT: 'השקעות',
      PENSION: 'פנסיה',
      INSURANCE: 'ביטוח',
      CASH: 'מזומן',
    };
    return types[type] || type;
  }

  private getFallbackInsights(data: Awaited<ReturnType<typeof this.getFinancialData>>, aiEnabled: boolean, locale: 'he' | 'en'): FinancialInsights {
    const avgExpenses =
      data.monthlyData.length > 0
        ? data.monthlyData.reduce((s, m) => s + m.expenses, 0) / data.monthlyData.length
        : 0;
    const avgIncome =
      data.monthlyData.length > 0
        ? data.monthlyData.reduce((s, m) => s + m.income, 0) / data.monthlyData.length
        : 0;
    const nextMonthStart = new Date(data.currentMonth + '-01');
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);
    const isEn = locale === 'en';

    let balanceForecast: string;
    const hasIncome = avgIncome > 0;
    const hasExpenses = avgExpenses > 0;
    const hasBalance = data.totalBalance !== 0;

    if (!hasIncome && !hasExpenses) {
      balanceForecast = isEn
        ? 'Not enough data for a balance forecast. Add transactions (income and expenses) to get an accurate forecast.'
        : 'אין מספיק נתונים לצפי יתרה. הוסף תנועות (הכנסות והוצאות) כדי לקבל צפי מדויק.';
    } else if (!hasIncome && hasExpenses) {
      const part1 = isEn ? `Based on average expenses of ${avgExpenses.toFixed(0)} ILS per month. ` : `על בסיס הוצאות ממוצעות של ${avgExpenses.toFixed(0)} ₪ לחודש. `;
      const part2 = hasBalance
        ? (isEn ? `Current balance: ${data.totalBalance.toFixed(0)} ILS.` : `היתרה הנוכחית: ${data.totalBalance.toFixed(0)} ₪.`)
        : (isEn ? 'Add income for a more accurate forecast.' : 'הוסף הכנסות כדי לקבל צפי מדויק יותר.');
      balanceForecast = part1 + part2;
    } else {
      const monthlySurplus = avgIncome - avgExpenses;
      const forecast = data.totalBalance + monthlySurplus;
      const nextStr = nextMonthStart.toLocaleDateString(isEn ? 'en-GB' : 'he-IL');
      const currStr = isEn ? 'ILS' : '₪';
      balanceForecast = isEn
        ? `Based on recent months' average: forecast balance at start of next month (${nextStr}) approximately ${forecast.toFixed(0)} ${currStr}.`
        : `על בסיס הממוצע של החודשים האחרונים: צפי ליתרה בתחילת החודש הקרוב (${nextStr}) בערך ${forecast.toFixed(0)} ₪.`;
    }

    let savingsRecommendation: string;
    if (avgIncome > 0) {
      savingsRecommendation = isEn
        ? `Recommend saving 10-15% of monthly income for an emergency fund. Based on your data: about ${Math.round(avgIncome * 0.12)} ILS per month.`
        : `מומלץ להפריש 10-15% מההכנסה החודשית לחיסכון חירום. על בסיס הנתונים שלך: כ-${Math.round(avgIncome * 0.12)} ₪ לחודש.`;
    } else if (avgExpenses > 0) {
      savingsRecommendation = isEn
        ? 'Recommend saving 10-15% of monthly income for an emergency fund. Based on your data: 0 ILS per month (add income first).'
        : `מומלץ להפריש 10-15% מההכנסה החודשית לחיסכון חירום. על בסיס הנתונים שלך: כ-0 ₪ לחודש.`;
    } else {
      savingsRecommendation = isEn
        ? 'Add income data to get a tailored savings recommendation.'
        : 'הוסף נתוני הכנסות כדי לקבל המלצת חיסכון מותאמת אישית.';
    }

    const investmentRecommendations = isEn
      ? (aiEnabled
          ? 'Common options in Israel: mutual funds, provident funds, study funds, government bonds.'
          : 'For tailored recommendations enable AI (OPENAI_API_KEY). Common options in Israel: mutual funds, provident funds, study funds, government bonds.')
      : (aiEnabled
          ? 'אפיקים נפוצים בישראל: קרנות נאמנות, קופות גמל, קרנות השתלמות, אגרות חוב ממשלתיות.'
          : 'להמלצות מותאמות אישית יש להפעיל את הבינה המלאכותית (OPENAI_API_KEY). אפיקים נפוצים בישראל: קרנות נאמנות, קופות גמל, קרנות השתלמות, אגרות חוב ממשלתיות.');

    return {
      balanceForecast,
      savingsRecommendation,
      investmentRecommendations,
    };
  }
}
