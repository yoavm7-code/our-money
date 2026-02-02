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
  | 'spendingInsights';

export const INSIGHT_SECTIONS: InsightSection[] = [
  'balanceForecast',
  'savingsRecommendation',
  'investmentRecommendations',
  'taxTips',
  'spendingInsights',
];

export interface FinancialInsights {
  balanceForecast: string;
  savingsRecommendation: string;
  investmentRecommendations: string;
  taxTips?: string;
  spendingInsights?: string;
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
        select: { date: true, amount: true, accountId: true },
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

    return {
      totalBalance,
      accounts,
      monthlyData,
      currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    };
  }

  async getInsights(householdId: string): Promise<FinancialInsights> {
    const data = await this.getFinancialData(householdId);
    const client = this.getOpenAIClient();
    if (!client) {
      return this.getFallbackInsights(data, false);
    }

    const prompt = this.buildPrompt(data);
    const systemPrompt = this.buildSystemPrompt();
    
    try {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) return this.getFallbackInsights(data, true);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const fallback = this.getFallbackInsights(data, true);
      
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
      };
    } catch {
      return this.getFallbackInsights(data, true);
    }
  }

  async getInsightSection(householdId: string, section: InsightSection): Promise<{ content: string }> {
    const data = await this.getFinancialData(householdId);
    const client = this.getOpenAIClient();
    const fallback = this.getFallbackForSection(data, section, !!client);
    if (!client) {
      return { content: fallback };
    }

    const prompt = this.buildPrompt(data);
    const sectionPrompt = this.buildSectionAsk(section);
    const systemPrompt = this.buildSectionSystemPrompt(section);

    try {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${prompt}\n\n${sectionPrompt}` },
        ],
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content;
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

  private buildSectionAsk(section: InsightSection): string {
    const asks: Record<InsightSection, string> = {
      balanceForecast: 'בבקשה תן רק צפי יתרה מפורט (balanceForecast) - תחזית ל-1-3 חודשים. החזר JSON עם מפתח balanceForecast.',
      savingsRecommendation: 'בבקשה תן רק המלצות חיסכון (savingsRecommendation) עם סכומים ספציפיים. החזר JSON עם מפתח savingsRecommendation.',
      investmentRecommendations: 'בבקשה תן רק המלצות השקעה (investmentRecommendations) מפורטות. החזר JSON עם מפתח investmentRecommendations.',
      taxTips: 'בבקשה תן רק טיפים למס (taxTips). החזר JSON עם מפתח taxTips.',
      spendingInsights: 'בבקשה תן רק תובנות על ההוצאות (spendingInsights). החזר JSON עם מפתח spendingInsights.',
    };
    return asks[section];
  }

  private buildSectionSystemPrompt(section: InsightSection): string {
    const now = new Date();
    const currentDate = now.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = now.getFullYear();
    const base = `אתה יועץ פיננסי מומחה לשוק הישראלי. התאריך היום: ${currentDate}. תפקידך לתת המלצה אחת ממוקדת. החזר JSON עם מפתח אחד בלבד.`;
    const sectionGuidance: Record<InsightSection, string> = {
      balanceForecast: 'חשב צפי יתרה מדויק על בסיס הכנסות והוצאות. אם יש רק הוצאות - ציין והמלץ להוסיף הכנסות. תן תחזית ל-1-3 חודשים.',
      savingsRecommendation: `המלץ על סכום ספציפי לחיסכון חירום (3-6 חודשי הוצאות). התייחס לריביות בישראל (כ-4.5% ${currentYear}). הזכר פיקדון, קרן כספית, פק"מ.`,
      investmentRecommendations: 'המלצות השקעה מפורטות: קרנות השתלמות, קופות גמל, קרנות נאמנות/תעודות סל, אג"ח. שמות מוצרים ישראלים, אחוזי הקצאה, תשואות משוערות.',
      taxTips: 'נקודות זיכוי, הטבות מס על פנסיה/קופת גמל, קרן השתלמות, החזרי מס. כתוב בעברית.',
      spendingInsights: 'זהה דפוסי הוצאות, השווה לממוצע, תן טיפים לחיסכון בקטגוריות. כתוב בעברית.',
    };
    return `${base}\n\n${sectionGuidance[section]}`;
  }

  private getFallbackForSection(
    data: Awaited<ReturnType<typeof this.getFinancialData>>,
    section: InsightSection,
    aiEnabled: boolean,
  ): string {
    const full = this.getFallbackInsights(data, aiEnabled);
    if (section === 'balanceForecast') return full.balanceForecast;
    if (section === 'savingsRecommendation') return full.savingsRecommendation;
    if (section === 'investmentRecommendations') return full.investmentRecommendations;
    if (section === 'taxTips') return 'הוסף נתוני הכנסות ו/או סטטוס תעסוקה (שכיר/עצמאי) כדי לקבל טיפים למס מותאמים.';
    if (section === 'spendingInsights') {
      const avgExpenses = data.monthlyData.length > 0
        ? data.monthlyData.reduce((s, m) => s + m.expenses, 0) / data.monthlyData.length
        : 0;
      return avgExpenses > 0
        ? `הוצאה חודשית ממוצעת: ${avgExpenses.toFixed(0)} ₪. הוסף פירוט לפי קטגוריות כדי לקבל תובנות מפורטות.`
        : 'הוסף תנועות והוצאות כדי לקבל תובנות על ההוצאות.';
    }
    return '';
  }

  private buildSystemPrompt(): string {
    const now = new Date();
    const currentDate = now.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = now.getFullYear();
    
    return `אתה יועץ פיננסי מומחה לשוק הישראלי. התאריך היום: ${currentDate}.

תפקידך לתת המלצות פיננסיות מפורטות, מעשיות וספציפיות למשתמש ישראלי.

## הנחיות חשובות:

### צפי יתרה (balanceForecast):
- חשב צפי מדויק על בסיס ההכנסות וההוצאות
- אם יש רק הוצאות ואין הכנסות - ציין זאת והמלץ להוסיף הכנסות
- תן תחזית ל-1-3 חודשים קדימה

### המלצות חיסכון (savingsRecommendation):
- המלץ על סכום ספציפי לחיסכון חירום (בדרך כלל 3-6 חודשי הוצאות)
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
- זהה דפוסי הוצאות חריגים
- השווה להוצאה ממוצעת במשק הישראלי
- תן טיפים לחיסכון בקטגוריות ספציפיות

## פורמט התשובה:
החזר JSON עם המפתחות:
- balanceForecast: טקסט מפורט
- savingsRecommendation: טקסט מפורט עם סכומים ספציפיים
- investmentRecommendations: טקסט מפורט עם שמות קרנות/מוצרים ספציפיים, אחוזי הקצאה מומלצים
- taxTips: טיפים למס (אופציונלי)
- spendingInsights: תובנות על ההוצאות (אופציונלי)

כתוב בעברית, בצורה ברורה ומעשית. השתמש בנתונים עדכניים על השוק הישראלי.`;
  }

  private openai: OpenAI | null = null;

  private getOpenAIClient(): OpenAI | null {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    if (!this.openai) this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  private buildPrompt(data: Awaited<ReturnType<typeof this.getFinancialData>>): string {
    const monthly = data.monthlyData
      .map((m) => {
        const surplus = m.income - m.expenses;
        return `  ${m.month}: הכנסות ${m.income.toFixed(0)} ₪, הוצאות ${m.expenses.toFixed(0)} ₪, עודף/גירעון: ${surplus >= 0 ? '+' : ''}${surplus.toFixed(0)} ₪`;
      })
      .join('\n');
    
    const accs = data.accounts
      .map((a) => {
        const typeHeb = this.getAccountTypeHebrew(a.type);
        return `  • ${a.name} (${typeHeb}): ${a.balance != null ? a.balance.toLocaleString('he-IL') + ' ₪' : 'לא צוין'}`;
      })
      .join('\n');

    // Calculate statistics
    const totalIncome = data.monthlyData.reduce((s, m) => s + m.income, 0);
    const totalExpenses = data.monthlyData.reduce((s, m) => s + m.expenses, 0);
    const avgMonthlyIncome = data.monthlyData.length > 0 ? totalIncome / data.monthlyData.length : 0;
    const avgMonthlyExpenses = data.monthlyData.length > 0 ? totalExpenses / data.monthlyData.length : 0;
    const avgMonthlySurplus = avgMonthlyIncome - avgMonthlyExpenses;
    const savingsRate = avgMonthlyIncome > 0 ? ((avgMonthlySurplus / avgMonthlyIncome) * 100).toFixed(1) : 0;

    // Determine financial profile
    let financialProfile = '';
    if (data.totalBalance > 100000) {
      financialProfile = 'יתרה גבוהה - מתאים להשקעות מגוונות';
    } else if (data.totalBalance > 30000) {
      financialProfile = 'יתרה בינונית - יש מקום להתחיל להשקיע';
    } else if (data.totalBalance > 0) {
      financialProfile = 'יתרה נמוכה - כדאי להתמקד בבניית חיסכון חירום';
    } else {
      financialProfile = 'יתרה שלילית או אפסית - יש להתמקד בצמצום הוצאות';
    }

    return `## נתוני משק הבית שלי (6 חודשים אחרונים)

### סיכום פיננסי:
- יתרה נוכחית כוללת: ${data.totalBalance.toLocaleString('he-IL')} ₪
- הכנסה חודשית ממוצעת: ${avgMonthlyIncome.toLocaleString('he-IL')} ₪
- הוצאה חודשית ממוצעת: ${avgMonthlyExpenses.toLocaleString('he-IL')} ₪
- עודף/גירעון ממוצע: ${avgMonthlySurplus >= 0 ? '+' : ''}${avgMonthlySurplus.toLocaleString('he-IL')} ₪
- שיעור חיסכון: ${savingsRate}%
- פרופיל פיננסי: ${financialProfile}

### חשבונות:
${accs || 'אין חשבונות מוגדרים'}

### פירוט חודשי:
${monthly || 'אין נתונים'}

---

בבקשה תן לי:
1. צפי יתרה מפורט לחודשים הקרובים
2. המלצות חיסכון עם סכומים ספציפיים ואפשרויות השקעה לחיסכון (פק"מ, קרן כספית, וכו')
3. המלצות השקעה מפורטות ומותאמות לפרופיל שלי - כולל שמות של קרנות/מוצרים ספציפיים בשוק הישראלי, אחוזי הקצאה מומלצים, ותשואות צפויות
4. טיפים למס והטבות שאני עשוי לפספס
5. תובנות על דפוסי ההוצאות שלי והמלצות לשיפור`;
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

  private getFallbackInsights(data: Awaited<ReturnType<typeof this.getFinancialData>>, aiEnabled: boolean): FinancialInsights {
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

    // Build balance forecast message based on available data
    let balanceForecast: string;
    const hasIncome = avgIncome > 0;
    const hasExpenses = avgExpenses > 0;
    const hasBalance = data.totalBalance !== 0;

    if (!hasIncome && !hasExpenses) {
      balanceForecast = 'אין מספיק נתונים לצפי יתרה. הוסף תנועות (הכנסות והוצאות) כדי לקבל צפי מדויק.';
    } else if (!hasIncome && hasExpenses) {
      // Only expenses, no income recorded
      balanceForecast = `על בסיס הוצאות ממוצעות של ${avgExpenses.toFixed(0)} ₪ לחודש. ` +
        (hasBalance
          ? `היתרה הנוכחית: ${data.totalBalance.toFixed(0)} ₪.`
          : 'הוסף הכנסות כדי לקבל צפי מדויק יותר.');
    } else {
      // Have both income and expenses (or just income)
      const monthlySurplus = avgIncome - avgExpenses;
      const forecast = data.totalBalance + monthlySurplus;
      balanceForecast = `על בסיס הממוצע של החודשים האחרונים: צפי ליתרה בתחילת החודש הקרוב (${nextMonthStart.toLocaleDateString('he-IL')}) בערך ${forecast.toFixed(0)} ₪.`;
    }

    // Savings recommendation
    let savingsRecommendation: string;
    if (avgIncome > 0) {
      savingsRecommendation = `מומלץ להפריש 10-15% מההכנסה החודשית לחיסכון חירום. על בסיס הנתונים שלך: כ-${Math.round(avgIncome * 0.12)} ₪ לחודש.`;
    } else if (avgExpenses > 0) {
      // No income but has expenses - recommend based on expenses
      savingsRecommendation = `מומלץ להפריש 10-15% מההכנסה החודשית לחיסכון חירום. על בסיס הנתונים שלך: כ-0 ₪ לחודש.`;
    } else {
      savingsRecommendation = 'הוסף נתוני הכנסות כדי לקבל המלצת חיסכון מותאמת אישית.';
    }

    // Investment recommendations
    const investmentRecommendations = aiEnabled
      ? 'אפיקים נפוצים בישראל: קרנות נאמנות, קופות גמל, קרנות השתלמות, אגרות חוב ממשלתיות.'
      : 'להמלצות מותאמות אישית יש להפעיל את הבינה המלאכותית (OPENAI_API_KEY). אפיקים נפוצים בישראל: קרנות נאמנות, קופות גמל, קרנות השתלמות, אגרות חוב ממשלתיות.';

    return {
      balanceForecast,
      savingsRecommendation,
      investmentRecommendations,
    };
  }
}
