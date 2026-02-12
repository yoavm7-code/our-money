import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

export interface ParsedVoiceTransaction {
  type: 'expense' | 'income';
  amount: number;
  description: string;
  categorySlug: string | null;
  date: string; // YYYY-MM-DD
  currency: string;
}

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

  async parseVoiceText(
    householdId: string,
    text: string,
  ): Promise<ParsedVoiceTransaction | null> {
    const client = this.getClient();
    if (!client) {
      this.logger.warn('OPENAI_API_KEY not set, cannot parse voice');
      return null;
    }

    // Fetch user's categories for context
    const cats = await this.prisma.category.findMany({
      where: { householdId },
      select: { slug: true, name: true, isIncome: true },
    });

    const categorySlugs = cats.map((c) => c.slug).join(', ');
    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt = `You are a financial transaction parser for a personal finance app.
The user speaks in Hebrew or English. Parse their voice input into a structured transaction.

Available category slugs: ${categorySlugs || 'groceries, transport, utilities, rent, insurance, healthcare, dining, shopping, entertainment, salary, income, subscriptions, education, other'}

Rules:
- "type" must be "expense" or "income"
- "amount" must be a positive number
- "description" is a short description of the transaction
- "categorySlug" should match the most relevant category from the list above, or null if unsure
- "date" should be "${today}" unless the user specifies another date (e.g., "אתמול" = yesterday, "שלשום" = day before yesterday)
- "currency" is "ILS" by default, unless the user says dollars/דולר (USD), euros/יורו (EUR), etc.
- Hebrew examples: "הוצאתי 50 שקל על קפה" → expense, 50, "קפה", "dining"
- "קיבלתי משכורת 15000" → income, 15000, "משכורת", "salary"
- "שילמתי 200 על חשמל" → expense, 200, "חשמל", "utilities"
- "הוצאה 80 שקל סופר" → expense, 80, "סופר", "groceries"

Return ONLY valid JSON with this exact structure:
{"type":"expense","amount":50,"description":"קפה","categorySlug":"dining","date":"${today}","currency":"ILS"}`;

    try {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200,
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      // Validate required fields
      if (!parsed.type || !parsed.amount || !parsed.description) return null;

      return {
        type: parsed.type === 'income' ? 'income' : 'expense',
        amount: Math.abs(Number(parsed.amount)),
        description: String(parsed.description),
        categorySlug: parsed.categorySlug || null,
        date: parsed.date || today,
        currency: parsed.currency || 'ILS',
      };
    } catch (err) {
      this.logger.error('Failed to parse voice text', err);
      return null;
    }
  }
}
