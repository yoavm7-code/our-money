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
  groceries: [
    'סופר', 'סופרמרקט', 'מכולת', 'ירקות', 'פירות', 'מזון', 'שוק', 'מינימרקט',
    'רמי לוי', 'שופרסל', 'מגה', 'יוחננוף', 'אושר עד', 'ויקטורי', 'חצי חינם',
    'קמעונאי', 'מאפייה', 'לחם', 'חלב', 'ביצים', 'בשר', 'עוף', 'דגים',
    'grocery', 'supermarket', 'food market',
  ],
  dining: [
    'מסעדה', 'קפה', 'אוכל', 'פיצה', 'המבורגר', 'סושי', 'ארוחה', 'בית קפה',
    'פלאפל', 'שווארמה', 'חומוס', 'גלידה', 'משלוח אוכל', 'וולט', 'תן ביס',
    'ג\'רוזלם', 'מקדונלדס', 'בורגר', 'סטייק', 'פסטה', 'ארוחת בוקר', 'ארוחת צהריים',
    'ארוחת ערב', 'בר', 'פאב', 'מזנון', 'קפיטריה', 'קייטרינג', 'טייק אוויי',
    'כריך', 'סנדוויץ', 'בייגל', 'עוגה', 'מאפה', 'קינוח',
    'restaurant', 'coffee', 'food', 'cafe', 'delivery', 'takeaway', 'brunch',
    'lunch', 'dinner', 'breakfast', 'pizza', 'burger', 'sushi',
  ],
  transport: [
    'דלק', 'בנזין', 'סולר', 'רכבת', 'אוטובוס', 'מונית', 'חניה', 'חנייה',
    'גט', 'יאנגו', 'אגד', 'דן', 'מטרונית', 'רכבל', 'קלנועית', 'אופניים',
    'קורקינט', 'ליים', 'בירד', 'וינד', 'רב קו', 'כביש אגרה', 'כביש 6',
    'סונול', 'פז', 'דור אלון', 'טסט', 'רישיון', 'ביטוח רכב', 'שמן',
    'צמיגים', 'מוסך', 'טיפול לרכב', 'כביסת רכב', 'נסיעה', 'מעבורת',
    'fuel', 'gas', 'taxi', 'bus', 'train', 'parking', 'uber', 'gett',
    'toll', 'car wash', 'garage', 'tires',
  ],
  utilities: [
    'חשמל', 'מים', 'גז', 'ארנונה', 'ועד בית', 'חברת חשמל', 'מקורות',
    'עירייה', 'מועצה', 'אגרה', 'ביוב', 'פינוי אשפה',
    'electricity', 'water', 'gas bill', 'municipal tax',
  ],
  healthcare: [
    'רופא', 'תרופות', 'בית חולים', 'רפואה', 'מרפאה', 'רופא שיניים', 'שיניים',
    'אופטיקה', 'משקפיים', 'עדשות', 'בדיקת דם', 'בדיקה', 'ניתוח', 'טיפול',
    'פיזיותרפיה', 'פסיכולוג', 'דיאטנית', 'קופת חולים', 'מכבי', 'כללית',
    'מאוחדת', 'לאומית', 'בית מרקחת', 'סופר פארם', 'תרופה', 'ויטמינים',
    'אנטיביוטיקה', 'רצפט', 'מרשם', 'חיסון', 'אלרגיה',
    'doctor', 'medicine', 'pharmacy', 'dentist', 'hospital', 'clinic',
    'optician', 'glasses', 'therapy', 'physiotherapy',
  ],
  shopping: [
    'בגדים', 'נעליים', 'ביגוד', 'קניות', 'חולצה', 'מכנסיים', 'שמלה',
    'חצאית', 'ג\'ינס', 'סנדלים', 'מגפיים', 'תיק', 'ארנק', 'שעון',
    'תכשיטים', 'אקססוריז', 'קניון', 'עזריאלי', 'זארה', 'H&M', 'פוקס',
    'גולף', 'רנואר', 'קסטרו', 'אמריקן איגל', 'נייק', 'אדידס',
    'ASOS', 'שיין', 'עלי אקספרס', 'אמזון',
    'clothes', 'shoes', 'shopping', 'mall', 'fashion', 'clothing',
  ],
  entertainment: [
    'סרט', 'קולנוע', 'הופעה', 'הצגה', 'בילוי', 'תיאטרון', 'מוזיאון',
    'פארק', 'לונה פארק', 'בריכה', 'ספא', 'מופע', 'פסטיבל', 'קונצרט',
    'דיסקוטק', 'מועדון', 'באולינג', 'בילוי', 'יציאה', 'אטרקציה',
    'כרטיסים', 'סינמה סיטי', 'יס פלאנט', 'הוט סינמה', 'לב תל אביב',
    'movie', 'show', 'concert', 'theater', 'museum', 'park', 'spa',
    'festival', 'tickets', 'bowling', 'amusement',
  ],
  subscriptions: [
    'מנוי', 'נטפליקס', 'ספוטיפיי', 'אמזון פריים', 'דיסני פלוס',
    'HBO', 'אפל', 'יוטיוב פרימיום', 'חדשות', 'עיתון', 'ידיעות',
    'הארץ', 'וואלה', 'סלקום TV', 'פרטנר TV', 'הוט', 'יס',
    'סטינג TV', 'cellcom', 'partner', 'hot',
    'subscription', 'netflix', 'spotify', 'disney plus', 'apple',
    'youtube premium', 'HBO', 'amazon prime',
  ],
  education: [
    'לימודים', 'קורס', 'ספרים', 'אוניברסיטה', 'מכללה', 'סדנה',
    'הרצאה', 'שיעור', 'שיעור פרטי', 'מורה', 'מורה פרטי', 'חוג',
    'חוגים', 'תלמוד', 'ישיבה', 'אולפן', 'שכר לימוד', 'ספר',
    'מחברת', 'ציוד לימודי', 'תרגול', 'בחינה', 'מבחן',
    'course', 'books', 'education', 'university', 'college', 'workshop',
    'tutor', 'lesson', 'class',
  ],
  rent: [
    'שכירות', 'דירה', 'שכ"ד', 'שכר דירה', 'דמי שכירות', 'משכיר',
    'rent', 'apartment', 'lease',
  ],
  insurance: [
    'ביטוח', 'ביטוח בריאות', 'ביטוח חיים', 'ביטוח רכב', 'ביטוח דירה',
    'ביטוח נסיעות', 'פוליסה', 'הפניקס', 'מגדל', 'הראל', 'כלל', 'איילון',
    'insurance', 'policy',
  ],
  salary: ['משכורת', 'שכר', 'salary', 'wage', 'paycheck'],
  income: [
    'הכנסה', 'פרילנס', 'עבודה', 'תשלום', 'עמלה', 'בונוס', 'פרמיה',
    'דיבידנד', 'ריבית', 'השכרה', 'פנסיה',
    'income', 'revenue', 'freelance', 'bonus', 'dividend', 'commission',
  ],
  gifts: [
    'מתנה', 'מתנות', 'יום הולדת', 'חתונה', 'בר מצווה', 'בת מצווה',
    'חנוכה', 'פורים', 'משלוח מנות', 'מזל טוב',
    'gift', 'present', 'birthday', 'wedding',
  ],
  travel: [
    'טיסה', 'מלון', 'חופשה', 'נופש', 'צימר', 'אירבנב', 'בוקינג',
    'מזוודה', 'דרכון', 'ויזה', 'אטרקציות', 'סיור', 'טיול',
    'flight', 'hotel', 'vacation', 'travel', 'airbnb', 'booking',
    'hostel', 'trip',
  ],
  phone: [
    'טלפון', 'סלולר', 'סלולרי', 'אינטרנט', 'סלקום', 'פרטנר', 'הוט מובייל',
    'גולן טלקום', 'פלאפון', 'ווי', '012', '013', '019',
    'חבילת גלישה', 'חבילת דקות', 'סים', 'טלפון חדש', 'מכשיר',
    'phone', 'cellular', 'mobile', 'internet', 'wifi', 'data plan',
  ],
  kids: [
    'ילדים', 'צעצוע', 'צעצועים', 'גן', 'גן ילדים', 'מעון', 'מעונות',
    'חוגים', 'צהרון', 'בייביסיטר', 'שמרטפית', 'חיתולים', 'מוצץ',
    'עגלה', 'בגדי ילדים', 'תינוק', 'תינוקת', 'דמי גן',
    'kids', 'children', 'daycare', 'babysitter', 'toys', 'diapers',
  ],
  pets: [
    'כלב', 'חתול', 'וטרינר', 'חיות', 'מזון לחיות', 'מזון לכלב',
    'מזון לחתול', 'דוג', 'חיות מחמד', 'פט שופ',
    'pet', 'dog', 'cat', 'vet', 'veterinary', 'pet food',
  ],
  fitness: [
    'חדר כושר', 'ספורט', 'כושר', 'יוגה', 'פילאטיס', 'שחייה',
    'ריצה', 'אימון', 'מאמן', 'מאמנת', 'הולמס פלייס', 'גו אקטיב',
    'gym', 'fitness', 'yoga', 'pilates', 'swimming', 'sport',
  ],
  beauty: [
    'מספרה', 'תספורת', 'קוסמטיקה', 'קוסמטיקאית', 'מניקור', 'פדיקור',
    'איפור', 'שיער', 'צבע שיער', 'החלקה', 'פנים', 'עור',
    'haircut', 'beauty', 'salon', 'manicure', 'pedicure', 'cosmetics',
  ],
  home: [
    'ריהוט', 'שיפוץ', 'תיקון', 'אינסטלטור', 'חשמלאי', 'צבע', 'צביעה',
    'מיזוג', 'מזגן', 'דוד שמש', 'תנור', 'מכונת כביסה', 'מקרר',
    'מדיח', 'שואב אבק', 'אלקטרוניקה', 'ניקיון', 'עוזרת בית',
    'מפתח', 'מנעולן', 'איקאה', 'ריהוט', 'מטבח', 'חדר שינה',
    'furniture', 'repair', 'renovation', 'plumber', 'electrician',
    'cleaning', 'ikea', 'appliance',
  ],
  alcohol: [
    'אלכוהול', 'בירה', 'יין', 'ויסקי', 'וודקה', 'קוקטייל', 'משקאות',
    'beer', 'wine', 'whiskey', 'vodka', 'alcohol', 'cocktail', 'drinks',
  ],
  tobacco: [
    'סיגריות', 'טבק', 'סיגר', 'וייפ', 'אישון',
    'cigarettes', 'tobacco', 'vape',
  ],
  charity: [
    'צדקה', 'תרומה', 'תרומות', 'מעשר', 'עמותה',
    'charity', 'donation', 'tzedaka',
  ],
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
    // Also: "לוויתי" (I borrowed), "חוב" (debt), "חייב ל-X" (owe X)
    const loanMatch =
      trimmed.match(/(?:הלוואה|הלוואתי|לקחתי הלוואה|לוויתי|חוב|חובות|loan|borrowed)\s+(?:של\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים)?\s*(?:ל|מ|ל-|מ-|אצל)?\s*(.*)/i) ||
      trimmed.match(/(?:הלוואתי|לוויתי)\s+(.*?)\s+(\d[\d,.]*)/i) ||
      trimmed.match(/(?:חייב|חייבת)\s+(?:ל-?|ל)?\s*(.*?)\s+(\d[\d,.]*)/i);
    if (loanMatch) {
      const isReverse = /(?:הלוואתי|לוויתי|חייב|חייבת)\s+.+\s+\d/.test(trimmed);
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
    // Also: "שמתי בצד" (put aside), "הפרשתי" (set aside), "הכנסתי לחיסכון" (put into savings)
    const savingMatch =
      trimmed.match(/(?:חיסכון|חסכתי|הפקדתי.*חיסכון|שמתי בצד|הפרשתי|הכנסתי לחיסכון|saving|saved)\s+(?:של\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים)?\s*(?:ל|עבור|ל-)?\s*(.*)/i) ||
      trimmed.match(/(?:הפקדתי|שמתי בצד|הפרשתי)\s+(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים)?\s*(?:ל|לחיסכון|ל-חיסכון|בצד)?\s*(.*)/i);
    if (savingMatch) {
      const amt = parseFloat(savingMatch[1].replace(/,/g, ''));
      const rest = (savingMatch[2] || '').replace(/חיסכון|בצד/g, '').trim();
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
    // Also: "מטרה" (target), "חולם על" (dreaming of), "מתכנן לקנות" (planning to buy),
    //        "רוצה לקנות" (want to buy), "צריך לחסוך" (need to save)
    const goalMatch =
      trimmed.match(/(?:יעד|מטרה|goal|target)\s+(?:של\s+|חדש\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים)?\s*(?:ל|עבור|ל-|בשביל)?\s*(.*)/i) ||
      trimmed.match(/(?:רוצה לחסוך|לחסוך|צריך לחסוך|חולם על|חולמת על|מתכנן לקנות|מתכננת לקנות|רוצה לקנות|רוצה להגיע ל|want to save|planning to buy)\s+(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים)?\s*(?:ל|עבור|ל-|בשביל)?\s*(.*)/i);
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
    // Also: "מסגרת" (limit/framework), "הגבלה" (restriction), "להגביל" (to limit)
    const budgetMatch =
      trimmed.match(/(?:תקציב|מסגרת|הגבלה|budget|limit)\s+(?:של\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים)?\s*(?:ל|עבור|ל-|בשביל)?\s*(.*)/i) ||
      trimmed.match(/(?:תקציב|מסגרת|הגבלה|budget|limit)\s+(.+?)\s+(\d[\d,.]*)/i) ||
      trimmed.match(/(?:להגביל|להגדיר תקציב|לקבוע תקציב)\s+(?:של\s+)?(.+?)\s+(?:ל|ל-)?\s*(\d[\d,.]*)/i);
    if (budgetMatch) {
      const isReverse = /(?:תקציב|מסגרת|הגבלה|להגביל)\s+[^\d]+\s+\d/.test(trimmed);
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
    // Also: "לקחתי משכנתא" (I took a mortgage)
    const mortgageMatch = trimmed.match(
      /(?:משכנתא|לקחתי משכנתא|לקחנו משכנתא|mortgage)\s+(?:של\s+|בסך\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים)?\s*(?:מ|מ-|ב|בבנק|אצל)?\s*(.*)/i,
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
    // Also: "החלפתי" (exchanged), "העברתי ל-דולר" (transferred to dollars), "מכרתי דולר" (sold dollars)
    const forexCurrPattern = '(?:דולר|דולרים|יורו|לירות?|פאונד|dollars?|euros?|pounds?|usd|eur|gbp)';
    const forexMatch =
      trimmed.match(new RegExp(`(?:המרתי|המרה|החלפתי|converted|exchange)\\s+(\\d[\\d,.]*)\\s*${forexCurrPattern}\\s*(?:ב-?\\s*(\\d[\\d,.]*)\\s*(?:שקל|ש"ח|₪|שקלים)?)?`, 'i')) ||
      trimmed.match(new RegExp(`(?:קניתי|רכשתי|bought|purchased)\\s+(\\d[\\d,.]*)\\s*${forexCurrPattern}\\s*(?:ב-?\\s*(\\d[\\d,.]*)\\s*(?:שקל|ש"ח|₪|שקלים)?)?`, 'i')) ||
      trimmed.match(new RegExp(`(?:מכרתי|sold)\\s+(\\d[\\d,.]*)\\s*${forexCurrPattern}\\s*(?:ב-?\\s*(\\d[\\d,.]*)\\s*(?:שקל|ש"ח|₪|שקלים)?)?`, 'i'));
    if (forexMatch) {
      const fromAmt = parseFloat(forexMatch[1].replace(/,/g, ''));
      const toCurr = /דולר|dollar|usd/i.test(trimmed) ? 'USD'
        : /לירה|פאונד|pound|gbp/i.test(trimmed) ? 'GBP'
        : 'EUR';
      const toAmt = forexMatch[2] ? parseFloat(forexMatch[2].replace(/,/g, '')) : undefined;
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
    // Also: "פתחתי תיק" (opened portfolio), "תיק ניירות ערך" (securities portfolio)
    const stockMatch = trimmed.match(
      /(?:תיק מניות|תיק השקעות|תיק ניירות ערך|פתחתי תיק|stock portfolio|portfolio|investment account)\s*(.*)/i,
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
    // Also: "פתחתי חשבון" (opened account), common bank names
    const accountBankMatch = trimmed.match(
      /(?:חשבון בנק|חשבון חדש|פתחתי חשבון|חשבון עובר ושב|חשבון עו"ש|bank account|new account|checking account)\s*(.*)/i,
    );
    if (accountBankMatch) {
      return {
        action: 'account',
        name: accountBankMatch[1].trim() || 'חשבון חדש',
        accountType: 'BANK',
      };
    }
    const accountCCMatch = trimmed.match(
      /(?:כרטיס אשראי|כרטיס חדש|כרטיס ויזה|כרטיס מאסטרקארד|כרטיס ישראכרט|כרטיס אמקס|כרטיס דיינרס|credit card|visa|mastercard)\s*(.*)/i,
    );
    if (accountCCMatch) {
      return {
        action: 'account',
        name: accountCCMatch[1].trim() || 'כרטיס אשראי',
        accountType: 'CREDIT_CARD',
      };
    }
    // Insurance account
    const accountInsMatch = trimmed.match(
      /(?:חשבון ביטוח|פוליסת ביטוח|פוליסה|insurance account|insurance policy)\s*(.*)/i,
    );
    if (accountInsMatch) {
      return {
        action: 'account',
        name: accountInsMatch[1].trim() || 'ביטוח',
        accountType: 'INSURANCE',
      };
    }
    // Pension account
    const accountPensionMatch = trimmed.match(
      /(?:חשבון פנסיה|קרן פנסיה|פנסיה|pension|pension fund)\s*(.*)/i,
    );
    if (accountPensionMatch) {
      return {
        action: 'account',
        name: accountPensionMatch[1].trim() || 'פנסיה',
        accountType: 'PENSION',
      };
    }
    // Investment account
    const accountInvestMatch = trimmed.match(
      /(?:חשבון השקעות|קרן השתלמות|investment account)\s*(.*)/i,
    );
    if (accountInvestMatch) {
      return {
        action: 'account',
        name: accountInvestMatch[1].trim() || 'השקעות',
        accountType: 'INVESTMENT',
      };
    }
    // Cash
    const accountCashMatch = trimmed.match(
      /(?:מזומן|כסף מזומן|cash)\s*(.*)/i,
    );
    if (accountCashMatch) {
      return {
        action: 'account',
        name: accountCashMatch[1].trim() || 'מזומן',
        accountType: 'CASH',
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
    } else if (/לפני שבוע|שבוע שעבר|last week|a week ago/i.test(trimmed)) {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      date = d.toISOString().slice(0, 10);
    } else if (/לפני יומיים|לפני יומים|two days ago/i.test(trimmed)) {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      date = d.toISOString().slice(0, 10);
    } else if (/לפני שלושה ימים|לפני 3 ימים|three days ago/i.test(trimmed)) {
      const d = new Date();
      d.setDate(d.getDate() - 3);
      date = d.toISOString().slice(0, 10);
    } else if (/בחודש שעבר|חודש שעבר|last month/i.test(trimmed)) {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      date = d.toISOString().slice(0, 10);
    } else {
      // Day of week detection: "ביום ראשון", "ביום שני", etc. (find the most recent occurrence)
      const dayMap: Record<string, number> = {
        'ראשון': 0, 'sunday': 0,
        'שני': 1, 'monday': 1,
        'שלישי': 2, 'tuesday': 2,
        'רביעי': 3, 'wednesday': 3,
        'חמישי': 4, 'thursday': 4,
        'שישי': 5, 'friday': 5,
        'שבת': 6, 'saturday': 6,
      };
      const dayMatch = trimmed.match(/(?:ביום|יום|on)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
      if (dayMatch) {
        const targetDay = dayMap[dayMatch[1].toLowerCase()];
        if (targetDay !== undefined) {
          const d = new Date();
          const currentDay = d.getDay();
          let diff = currentDay - targetDay;
          if (diff <= 0) diff += 7; // go back to the previous occurrence
          d.setDate(d.getDate() - diff);
          date = d.toISOString().slice(0, 10);
        }
      }
    }

    // Income trigger words
    const incTrigger = '(?:קיבלתי|הכנסה|הרווחתי|זיכו אותי|נכנס|נכנסה|נכנסו|הפקידו לי|העבירו לי|הגיע|הגיעה|הגיעו|הוחזר לי|החזירו לי|received|got|earned)';

    // Income patterns
    const incomePatterns = [
      // "קיבלתי 15000 מהעבודה" / "הרווחתי 5000 מפרילנס" / "נכנסו 8000 מהשכרה"
      new RegExp(`${incTrigger}\\s+(?:משכורת\\s+|שכר\\s+)?(?:של\\s+)?(\\d[\\d,.]*)\\s*(?:שקל|ש"ח|₪|שקלים)?(?:\\s+(?:מ|מ-|על|עבור|בגלל|בזכות)\\s*(.+))?`, 'i'),
      // "קיבלתי תשלום 5000" / "קיבלתי החזר 200" / "קיבלתי מענק 3000"
      new RegExp(`${incTrigger}\\s+(.+?)\\s+(\\d[\\d,.]*)`, 'i'),
      // "משכורת 15000" / "בונוס 5000" / "דיבידנד 1200" / "פרמיה 3000"
      /(?:משכורת|שכר|בונוס|פרמיה|מענק|פרס|דיבידנד|ריבית|פרילנס|החזר מס|החזר|שכר דירה|salary|bonus|dividend|grant|refund|tip)\s+(?:של\s+)?(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים)?/i,
    ];

    for (let i = 0; i < incomePatterns.length; i++) {
      const m = trimmed.match(incomePatterns[i]);
      if (m) {
        type = 'income';
        if (i === 2) {
          // Named income source (salary/bonus/etc.) + amount
          amount = parseFloat(m[1].replace(/,/g, ''));
          // Extract the income source from the original match
          const srcMatch = trimmed.match(/^(משכורת|שכר|בונוס|פרמיה|מענק|פרס|דיבידנד|ריבית|פרילנס|החזר מס|החזר|שכר דירה|salary|bonus|dividend|grant|refund|tip)/i);
          description = srcMatch ? srcMatch[1] : 'הכנסה';
        } else if (i === 1) {
          // Description then amount
          description = m[1].trim();
          amount = parseFloat(m[2].replace(/,/g, ''));
        } else {
          // Amount then optional description
          amount = parseFloat(m[1].replace(/,/g, ''));
          description = m[2]?.trim() || 'הכנסה';
        }
        break;
      }
    }

    // Expense patterns (only if income not matched)
    if (type !== 'income' || !amount) {
      type = 'expense';

      // All Hebrew expense trigger verbs (amount + description pattern)
      const expAmtFirst = '(?:הוצאתי|שילמתי|בזבזתי|שרפתי|תרמתי|נתתי|העברתי|חידשתי|השקעתי|מימנתי|paid|spent|gave|donated)';
      // Trigger verbs where description comes before amount (bought X for Y)
      const expDescFirst = '(?:קניתי|רכשתי|הזמנתי|לקחתי|אכלתי|שתיתי|טסתי|נסעתי|תיקנתי|עשיתי|חגגתי|טיפלתי|bought|ordered|purchased|took|ate|drank)';
      // Passive/impersonal expense patterns
      const expPassive = '(?:עלה לי|עלתה לי|עלו לי|חייבו אותי|חייבו לי|ירד לי|יצא לי|זה עלה|it cost|was charged)';

      const expensePatterns = [
        // "הוצאתי 50 שקל על קפה" / "שילמתי 200 על חשמל" / "בזבזתי 100 על שטויות"
        new RegExp(`${expAmtFirst}\\s+(\\d[\\d,.]*)\\s*(?:שקל|ש"ח|₪|שקלים|דולר|יורו)?\\s+(?:על|ל|עבור|ב|בשביל|עם)\\s*(.+)`, 'i'),
        // "הוצאה 200 חשמל" / "expense 50 coffee"
        /(?:הוצאה|expense)\s+(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים|דולר|יורו)?\s+(.+)/i,
        // "קניתי קפה ב-15" / "הזמנתי פיצה ב-80" / "אכלתי סושי ב-120"
        new RegExp(`${expDescFirst}\\s+(.+?)\\s+(?:ב|ב-|תמורת|בסכום|במחיר)?\\s*(\\d[\\d,.]*)\\s*(?:שקל|ש"ח|₪|שקלים|דולר|יורו)?`, 'i'),
        // "עלה לי 50 שקל על קפה" / "חייבו אותי 200 על חשמל"
        new RegExp(`${expPassive}\\s+(\\d[\\d,.]*)\\s*(?:שקל|ש"ח|₪|שקלים|דולר|יורו)?\\s*(?:על|ל|עבור|ב|בשביל)?\\s*(.+)`, 'i'),
        // "50 שקל על קפה" / "200 ש"ח על חשמל"
        /(\d[\d,.]*)\s*(?:שקל|ש"ח|₪|שקלים|דולר|יורו)\s+(?:על|ל|עבור|ב|בשביל)\s*(.+)/i,
        // "הוצאתי 50 על קפה" (without currency)
        new RegExp(`${expAmtFirst}\\s+(\\d[\\d,.]*)\\s+(?:על|ל|עבור|ב|בשביל|עם)\\s*(.+)`, 'i'),
        // "קניתי קפה" with amount somewhere in the text
        new RegExp(`${expDescFirst}\\s+(.+?)\\s+(\\d[\\d,.]*)`, 'i'),
      ];

      // Patterns at index 2 and 6 have description first, amount second
      const descFirstIndexes = new Set([2, 6]);
      for (let i = 0; i < expensePatterns.length; i++) {
        const m = trimmed.match(expensePatterns[i]);
        if (m) {
          if (descFirstIndexes.has(i)) {
            description = m[1].trim();
            amount = parseFloat(m[2].replace(/,/g, ''));
          } else {
            amount = parseFloat(m[1].replace(/,/g, ''));
            description = (m[2] || '').trim();
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
          .replace(/שקל|שקלים|ש"ח|₪|דולר|דולרים|יורו|לירות?|פאונד/g, '')
          .replace(/הוצאתי|שילמתי|קניתי|רכשתי|הזמנתי|בזבזתי|שרפתי|תרמתי|נתתי|העברתי|חידשתי|השקעתי|מימנתי|לקחתי|אכלתי|שתיתי|טסתי|נסעתי|תיקנתי|עשיתי|חגגתי|טיפלתי/g, '')
          .replace(/קיבלתי|הרווחתי|הכנסה|הוצאה|משכורת|שכר|בונוס|פרמיה|מענק|פרס|דיבידנד|ריבית|החזר/g, '')
          .replace(/עלה לי|עלתה לי|עלו לי|חייבו אותי|חייבו לי|ירד לי|יצא לי|זה עלה/g, '')
          .replace(/על|ב-?|ל-?|עבור|בשביל|עם|תמורת|בסכום|במחיר|מ-?/g, '')
          .replace(/אתמול|שלשום|היום|לפני שבוע|שבוע שעבר|חודש שעבר|לפני יומיים/g, '')
          .replace(/ביום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/g, '')
          .trim();
        if (/קיבלתי|הרווחתי|הכנסה|משכורת|שכר|בונוס|פרמיה|מענק|פרס|דיבידנד|ריבית|נכנס|נכנסה|הפקידו|העבירו|זיכו|החזר/i.test(trimmed)) {
          type = 'income';
        }
      }
    }

    if (!amount || amount <= 0 || !description) return null;

    description = description
      .replace(/שקל|שקלים|ש"ח|₪|דולר|דולרים|יורו|לירות?|פאונד/g, '')
      .replace(/אתמול|שלשום|היום|לפני שבוע|שבוע שעבר|חודש שעבר|לפני יומיים/g, '')
      .replace(/ביום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/g, '')
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
    if (/דולר|דולרים|dollars?|\$|usd/i.test(text)) return 'USD';
    if (/יורו|euros?|€|eur\b/i.test(text)) return 'EUR';
    if (/לירה|לירות|פאונד|pounds?|£|gbp/i.test(text)) return 'GBP';
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
The user speaks in Hebrew or English (primarily Hebrew). Parse their voice input into a structured financial action.
Understand casual, colloquial Hebrew – users may phrase things in many different ways.

The app supports these action types:

1. "transaction" – an expense or income
   EXPENSE examples (all mean spending money):
   - "הוצאתי 50 שקל על קפה" (I spent 50 on coffee)
   - "שילמתי 200 על חשמל" (I paid 200 for electricity)
   - "קניתי נעליים ב-300" (I bought shoes for 300)
   - "רכשתי מנוי ב-50" (I purchased a subscription for 50)
   - "הזמנתי אוכל ב-80" (I ordered food for 80)
   - "בזבזתי 100 על שטויות" (I wasted 100 on stuff)
   - "שרפתי 500 בקניון" (I burned/spent 500 at the mall)
   - "תרמתי 200 לעמותה" (I donated 200 to charity)
   - "נתתי 50 טיפ" (I gave 50 tip)
   - "העברתי 1000 לבעל הבית" (I transferred 1000 to landlord)
   - "עלה לי 300 הביקור אצל הרופא" (the doctor visit cost me 300)
   - "חייבו אותי 150 על חניה" (I was charged 150 for parking)
   - "אכלתי במסעדה ב-200" (I ate at a restaurant for 200)
   - "נסעתי במונית ב-60" (I took a taxi for 60)
   - "לקחתי גט ב-40" (I took a Gett for 40)
   - "מילאתי דלק ב-350" (I filled gas for 350)
   - "תיקנתי את המזגן ב-500" (I fixed the AC for 500)
   - "חידשתי ביטוח ב-2000" (I renewed insurance for 2000)
   - "עשיתי קניות ב-400" (I did shopping for 400)
   - "טסתי לאילת ב-300" (I flew to Eilat for 300)
   - "חגגתי יום הולדת ב-1000" (I celebrated birthday for 1000)
   - "200 שקל סופר" (200 shekels supermarket)
   - "50 שקל על קפה אתמול" (50 on coffee yesterday)
   INCOME examples (all mean receiving money):
   - "קיבלתי משכורת 15000" (I received salary 15000)
   - "הרווחתי 5000 מפרילנס" (I earned 5000 from freelance)
   - "נכנסו 8000 מהשכרה" (8000 came in from rent)
   - "הפקידו לי 3000" (3000 was deposited to me)
   - "העבירו לי 500" (500 was transferred to me)
   - "בונוס 10000" (bonus 10000)
   - "קיבלתי החזר 200" (I got a refund of 200)
   - "דיבידנד 1200 שקל" (dividend 1200 shekels)
   - "פרמיה 3000" (premium 3000)
   - "מענק 5000" (grant 5000)
   - "החזר מס 2000" (tax refund 2000)
   - "זיכו אותי 100" (I was credited 100)
   - "ריבית 50 שקל" (interest 50 shekels)

2. "loan" – creating a loan record
   - "הלוואה 50000 שקל" / "הלוואתי 5000 לדוד" / "לוויתי 3000 מהבנק"
   - "לקחתי הלוואה 20000" / "חוב 5000 לחבר" / "חייב לדוד 1000"

3. "saving" – creating a savings entry
   - "חיסכון 1000" / "חסכתי 2000 לטיול" / "הפקדתי 500 לחיסכון"
   - "שמתי בצד 1000" / "הפרשתי 2000" / "הכנסתי 500 לחיסכון"

4. "goal" – setting a financial goal
   - "יעד 10000 לטיול" / "מטרה 50000 לרכב" / "רוצה לחסוך 100000 לדירה"
   - "חולם על טיול ב-20000" / "מתכנן לקנות רכב ב-80000" / "רוצה לקנות דירה"

5. "budget" – setting a budget for a category
   - "תקציב 3000 לאוכל" / "מסגרת 5000 לקניות" / "הגבלה 1000 לבילויים"
   - "תקציב מזון 2000" / "להגביל הוצאות אוכל ל-3000"

6. "forex" – currency exchange
   - "המרתי 1000 דולר" / "קניתי 500 דולר ב-1800 שקל" / "החלפתי 2000 יורו"
   - "מכרתי 300 דולר" / "רכשתי 1000 פאונד"

7. "mortgage" – creating a mortgage record
   - "משכנתא 800000 שקל מבנק לאומי" / "לקחתי משכנתא 1000000" / "לקחנו משכנתא 900000"

8. "stock_portfolio" – creating a stock portfolio
   - "תיק מניות IBI" / "תיק השקעות חדש" / "פתחתי תיק ניירות ערך"

9. "account" – creating a financial account
   - "חשבון בנק לאומי" / "כרטיס אשראי ויזה" / "פתחתי חשבון בדיסקונט"
   - "כרטיס מאסטרקארד" / "כרטיס ישראכרט" / "חשבון פנסיה" / "קרן השתלמות"

Available category slugs: ${slugList || 'groceries, transport, utilities, rent, insurance, healthcare, dining, shopping, entertainment, salary, income, subscriptions, education, gifts, travel, phone, kids, pets, fitness, beauty, home, alcohol, tobacco, charity, other'}

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
- Default currency is "ILS" unless user says דולר/dollar/$ (USD), יורו/euro/€ (EUR), or פאונד/לירה/pound/£ (GBP)
- Date defaults to "${today}". Recognize: אתמול (yesterday), שלשום (2 days ago), לפני שבוע/שבוע שעבר (last week), לפני יומיים (2 days ago), לפני שלושה ימים (3 days ago), בחודש שעבר (last month), day names like ביום ראשון (last Sunday), etc.
- For transactions: type must be "expense" or "income", amount positive
- For budget: try to match budgetCategorySlug from available slugs
- IMPORTANT: Understand casual Hebrew – "שרפתי" means spent, "בזבזתי" means wasted/spent, "עלה לי" means cost me, "חייבו אותי" means charged me, "נכנס/נכנסה/נכנסו" means income received, "זיכו" means credited, etc.`;

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
