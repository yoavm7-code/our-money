import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionSource } from '@prisma/client';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsQueryDto } from './dto/transactions-query.dto';
import { RulesService } from '../rules/rules.service';
import { CategoriesService } from '../categories/categories.service';
import OpenAI from 'openai';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private openai: OpenAI | null = null;

  constructor(
    private prisma: PrismaService,
    private rulesService: RulesService,
    private categoriesService: CategoriesService,
  ) {}

  private getOpenAIClient(): OpenAI | null {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    if (!this.openai) this.openai = new OpenAI({ apiKey: key });
    return this.openai;
  }

  // ──────────────────────────────────────────────
  //  VAT Calculation
  // ──────────────────────────────────────────────

  /**
   * Calculate VAT amount from a transaction amount.
   * Default VAT rate is fetched from the Business entity.
   * If amount includes VAT (default): vatAmount = amount - (amount / (1 + rate/100))
   * If amount excludes VAT: vatAmount = amount * (rate / 100)
   */
  private async calculateVatAmount(
    businessId: string,
    amount: number,
    isVatIncluded: boolean,
    explicitVatAmount?: number | null,
  ): Promise<number | null> {
    // If explicitly provided, use it directly
    if (explicitVatAmount != null) return explicitVatAmount;

    // Fetch the business VAT rate
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { vatRate: true },
    });
    const vatRate = business?.vatRate ? Number(business.vatRate) : 17;
    if (vatRate <= 0) return null;

    const absAmount = Math.abs(amount);
    if (isVatIncluded) {
      // Amount includes VAT: extract the VAT component
      const vatComponent = absAmount - absAmount / (1 + vatRate / 100);
      return Math.round(vatComponent * 100) / 100;
    } else {
      // Amount excludes VAT: calculate VAT on top
      const vatComponent = absAmount * (vatRate / 100);
      return Math.round(vatComponent * 100) / 100;
    }
  }

  // ──────────────────────────────────────────────
  //  Category Suggestion (rules-based + AI)
  // ──────────────────────────────────────────────

  /**
   * Suggest a category for a given description.
   * First tries learned rules, then falls back to OpenAI if available.
   */
  async suggestCategory(businessId: string, description: string): Promise<string | null> {
    // Try rules-based suggestion first
    const ruleMatch = await this.rulesService.suggestCategory(businessId, description);
    if (ruleMatch) return ruleMatch;

    // Fall back to OpenAI suggestion
    const client = this.getOpenAIClient();
    if (!client || !description.trim()) return null;

    try {
      const categories = await this.categoriesService.findAll(businessId);
      const categoryList = categories.map((c) => `${c.slug}: ${c.name}`).join(', ');

      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a financial categorization assistant for an Israeli freelancer.
Given a transaction description, return the best matching category slug.
Available categories: ${categoryList}
Return ONLY the slug string, nothing else. If unsure, return "other".`,
          },
          { role: 'user', content: description },
        ],
        temperature: 0,
        max_tokens: 50,
      });

      const suggestedSlug = completion.choices[0]?.message?.content?.trim().toLowerCase();
      if (!suggestedSlug) return null;

      // Find the category by slug
      const matched = categories.find((c) => c.slug === suggestedSlug);
      return matched?.id ?? null;
    } catch (err) {
      this.logger.warn('AI category suggestion failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  //  Create Transaction
  // ──────────────────────────────────────────────

  async create(
    businessId: string,
    dto: CreateTransactionDto,
    source: TransactionSource = 'MANUAL',
    documentId?: string,
  ) {
    let categoryId = dto.categoryId ?? null;

    // Auto-suggest category if not provided
    if (!categoryId && dto.description) {
      const suggested = await this.rulesService.suggestCategory(businessId, dto.description);
      if (suggested) categoryId = suggested;
    }

    // Calculate VAT amount
    const isVatIncluded = dto.isVatIncluded ?? true;
    const vatAmount = await this.calculateVatAmount(
      businessId,
      dto.amount,
      isVatIncluded,
      dto.vatAmount,
    );

    return this.prisma.transaction.create({
      data: {
        businessId,
        accountId: dto.accountId,
        categoryId,
        clientId: dto.clientId ?? null,
        projectId: dto.projectId ?? null,
        date: new Date(dto.date),
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency ?? 'ILS',
        vatAmount,
        isVatIncluded,
        isTaxDeductible: dto.isTaxDeductible ?? true,
        source,
        documentId: documentId ?? null,
        rawText: dto.rawText ?? null,
        totalAmount: dto.totalAmount ?? null,
        installmentCurrent: dto.installmentCurrent ?? null,
        installmentTotal: dto.installmentTotal ?? null,
        isRecurring: dto.isRecurring ?? false,
      },
    });
  }

  // ──────────────────────────────────────────────
  //  Create Many (bulk import from documents)
  // ──────────────────────────────────────────────

  private readonly KNOWN_SLUGS: Record<string, { name: string; isIncome: boolean }> = {
    groceries: { name: 'Groceries', isIncome: false },
    transport: { name: 'Transport', isIncome: false },
    utilities: { name: 'Utilities', isIncome: false },
    rent: { name: 'Rent', isIncome: false },
    insurance: { name: 'Insurance', isIncome: false },
    healthcare: { name: 'Healthcare', isIncome: false },
    dining: { name: 'Dining', isIncome: false },
    shopping: { name: 'Shopping', isIncome: false },
    entertainment: { name: 'Entertainment', isIncome: false },
    other: { name: 'Other', isIncome: false },
    salary: { name: 'Salary', isIncome: true },
    income: { name: 'Income', isIncome: true },
    credit_charges: { name: 'Credit card charges', isIncome: false },
    transfers: { name: 'Transfers', isIncome: false },
    fees: { name: 'Fees', isIncome: false },
    subscriptions: { name: 'Subscriptions', isIncome: false },
    education: { name: 'Education', isIncome: false },
    pets: { name: 'Pets', isIncome: false },
    gifts: { name: 'Gifts', isIncome: false },
    childcare: { name: 'Childcare', isIncome: false },
    savings: { name: 'Savings', isIncome: false },
    pension: { name: 'Pension', isIncome: false },
    investment: { name: 'Investment', isIncome: false },
    bank_fees: { name: 'Bank fees', isIncome: false },
    online_shopping: { name: 'Online shopping', isIncome: false },
    loan_payment: { name: 'Loan payment', isIncome: false },
    loan_interest: { name: 'Loan interest', isIncome: false },
    standing_order: { name: 'Standing order', isIncome: false },
    finance: { name: 'Finance', isIncome: false },
    unknown: { name: 'Uncategorized', isIncome: false },
  };

  /** Generate a readable name from a slug (e.g. "bank_fees" -> "Bank fees") */
  private slugToName(slug: string): string {
    return slug
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async createMany(
    businessId: string,
    accountId: string,
    items: Array<{
      date: string;
      description: string;
      amount: number;
      categorySlug?: string;
      totalAmount?: number;
      installmentCurrent?: number;
      installmentTotal?: number;
    }>,
    source: TransactionSource,
    documentId?: string,
  ) {
    let categories = await this.categoriesService.findAll(businessId);
    let bySlug = new Map<string, string>(categories.map((c) => [c.slug, c.id as string]));

    const ensureCategory = async (slug: string): Promise<string | null> => {
      let id: string | undefined = bySlug.get(slug);
      if (!id) {
        const def = this.KNOWN_SLUGS[slug];
        const name = def?.name ?? this.slugToName(slug);
        const isIncome = def?.isIncome ?? false;
        try {
          const created = await this.categoriesService.create(businessId, {
            name,
            slug,
            isIncome,
          });
          id = (created as { id: string }).id;
          bySlug.set(slug, id);
        } catch {
          // Might already exist (race condition) - refresh and get
          categories = await this.categoriesService.findAll(businessId);
          bySlug = new Map<string, string>(categories.map((c) => [c.slug, c.id as string]));
          id = bySlug.get(slug);
        }
      }
      return id ?? null;
    };

    const created = [];
    for (const item of items) {
      let categoryId: string | null = null;
      if (item.categorySlug) {
        categoryId = bySlug.get(item.categorySlug) ?? null;
        if (!categoryId) categoryId = await ensureCategory(item.categorySlug);
      }
      if (!categoryId && item.description) {
        categoryId = await this.rulesService.suggestCategory(businessId, item.description);
      }

      const isRecurringIncome = item.categorySlug === 'salary' && item.amount > 0;

      const t = await this.prisma.transaction.create({
        data: {
          businessId,
          accountId,
          categoryId,
          date: new Date(item.date),
          description: item.description,
          amount: item.amount,
          currency: 'ILS',
          source,
          documentId: documentId ?? null,
          totalAmount: item.totalAmount ?? null,
          installmentCurrent: item.installmentCurrent ?? null,
          installmentTotal: item.installmentTotal ?? null,
          isRecurring: isRecurringIncome,
        },
      });
      created.push(t);
    }
    return created;
  }

  // ──────────────────────────────────────────────
  //  Find All (with pagination and filters)
  // ──────────────────────────────────────────────

  async findAll(businessId: string, query: TransactionsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const page = Math.max(1, parseInt(String(query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit), 10) || 20));

    const where: Record<string, unknown> = {
      businessId,
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.clientId && { clientId: query.clientId }),
      ...(query.projectId && { projectId: query.projectId }),
      ...(query.type === 'income' && { amount: { gt: 0 } }),
      ...(query.type === 'expense' && { amount: { lt: 0 } }),
    };

    // Full-text search across description, account name, amounts, and dates
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      const orConditions: unknown[] = [
        { description: { contains: term, mode: 'insensitive' } },
        { account: { name: { contains: term, mode: 'insensitive' } } },
        { client: { name: { contains: term, mode: 'insensitive' } } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
      ];

      // Search by numeric amount
      const numVal = parseFloat(term.replace(/,/g, ''));
      if (!Number.isNaN(numVal)) {
        orConditions.push({ amount: numVal });
        orConditions.push({ amount: -numVal });
      }

      // Search by date (ISO or DD.MM.YYYY / DD/MM/YYYY)
      const isoMatch = term.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const dmyMatch = term.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
      let searchDate: Date | null = null;
      if (isoMatch) {
        const [, y, m, d] = isoMatch;
        if (y && m && d) searchDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      } else if (dmyMatch) {
        const [, d, m, y] = dmyMatch;
        if (d && m && y) searchDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      }
      if (searchDate && !Number.isNaN(searchDate.getTime())) {
        const start = new Date(searchDate.getFullYear(), searchDate.getMonth(), searchDate.getDate());
        const end = new Date(searchDate.getFullYear(), searchDate.getMonth(), searchDate.getDate() + 1);
        orConditions.push({ date: { gte: start, lt: end } });
      }

      where.OR = orConditions;
    }

    // Date range filter
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, Date>).gte = from;
      if (to) (where.date as Record<string, Date>).lte = to;
    }

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          account: true,
          category: true,
          client: { select: { id: true, name: true, color: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    const items = rows.map((tx) => this.addDisplayDates(this.fixDisplayAmount(tx)));
    return { items, total, page, limit };
  }

  // ──────────────────────────────────────────────
  //  Display Helpers
  // ──────────────────────────────────────────────

  /** Prisma Decimal -> number */
  private toNum(v: unknown): number {
    if (v == null) return 0;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    const o = v as { toNumber?: () => number };
    if (typeof o?.toNumber === 'function') return o.toNumber();
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? 0 : n;
  }

  /** Add N calendar months to a date (for installment display date). */
  private addMonths(d: Date, months: number): Date {
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    out.setMonth(out.getMonth() + months);
    return out;
  }

  /** For installments: compute displayDate (actual charge date of this installment) and firstPaymentDate. */
  private addDisplayDates(tx: Record<string, unknown>): Record<string, unknown> {
    const cur = tx.installmentCurrent != null ? Math.max(1, Math.floor(this.toNum(tx.installmentCurrent))) : 0;
    const total = tx.installmentTotal != null ? Math.max(1, Math.floor(this.toNum(tx.installmentTotal))) : 0;
    const dateRaw = tx.date;
    const firstDate = dateRaw instanceof Date ? dateRaw : new Date(String(dateRaw));
    if (Number.isNaN(firstDate.getTime())) return tx;
    const firstYMD = firstDate.toISOString().slice(0, 10);

    if (cur >= 1 && total >= 1) {
      const displayDate = this.addMonths(firstDate, cur - 1);
      return {
        ...tx,
        displayDate: displayDate.toISOString().slice(0, 10),
        firstPaymentDate: firstYMD,
      };
    }
    return { ...tx, displayDate: firstYMD };
  }

  /** When amount was wrongly stored as total (full price), return the per-installment amount for display. */
  private fixDisplayAmount(tx: {
    amount: unknown;
    totalAmount?: unknown;
    installmentTotal?: unknown;
    [k: string]: unknown;
  }): Record<string, unknown> {
    const totalPayments = tx.installmentTotal != null ? this.toNum(tx.installmentTotal) : 0;
    if (totalPayments < 1) return tx as Record<string, unknown>;

    const storedAmount = this.toNum(tx.amount);
    const total = tx.totalAmount != null ? this.toNum(tx.totalAmount) : null;

    let totalToUse = total;
    if (totalToUse == null || totalToUse <= 0) {
      totalToUse = Math.abs(storedAmount);
    }
    const absStored = Math.abs(storedAmount);
    if (absStored < totalToUse * 0.99) return tx as Record<string, unknown>;

    const paymentPerInstallment = Math.round((totalToUse / totalPayments) * 100) / 100;
    const sign = storedAmount >= 0 ? 1 : -1;
    return { ...tx, amount: sign * paymentPerInstallment };
  }

  // ──────────────────────────────────────────────
  //  Find One
  // ──────────────────────────────────────────────

  async findOne(businessId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, businessId },
      include: {
        account: true,
        category: true,
        client: { select: { id: true, name: true, color: true } },
        project: { select: { id: true, name: true, color: true } },
        document: true,
      },
    });
    return tx ? this.addDisplayDates(this.fixDisplayAmount(tx)) : null;
  }

  // ──────────────────────────────────────────────
  //  Update
  // ──────────────────────────────────────────────

  async update(businessId: string, id: string, dto: UpdateTransactionDto) {
    const data: Record<string, unknown> = {};

    // Basic fields
    if (dto.accountId !== undefined) data.accountId = dto.accountId;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId || null;
    if (dto.clientId !== undefined) data.clientId = dto.clientId || null;
    if (dto.projectId !== undefined) data.projectId = dto.projectId || null;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.isRecurring !== undefined) data.isRecurring = dto.isRecurring;
    if (dto.isTaxDeductible !== undefined) data.isTaxDeductible = dto.isTaxDeductible;
    if (dto.isVatIncluded !== undefined) data.isVatIncluded = dto.isVatIncluded;

    // Date handling
    if (dto.date) {
      const s = String(dto.date).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        data.date = new Date(s + 'T00:00:00.000Z');
      }
    }

    // Installment fields (allow setting to null to clear them)
    if (dto.totalAmount !== undefined) data.totalAmount = dto.totalAmount;
    if (dto.installmentCurrent !== undefined) data.installmentCurrent = dto.installmentCurrent;
    if (dto.installmentTotal !== undefined) data.installmentTotal = dto.installmentTotal;

    // VAT amount: recalculate if amount changed and vatAmount not explicitly provided
    if (dto.vatAmount !== undefined) {
      data.vatAmount = dto.vatAmount;
    } else if (dto.amount !== undefined) {
      const isVatIncluded = dto.isVatIncluded ?? true;
      const vatAmount = await this.calculateVatAmount(businessId, dto.amount, isVatIncluded);
      if (vatAmount != null) data.vatAmount = vatAmount;
    }

    if (Object.keys(data).length === 0) return { count: 0 };

    const result = await this.prisma.transaction.updateMany({
      where: { id, businessId },
      data,
    });

    // Learn category rule from correction
    if (result.count > 0 && dto.categoryId && dto.description) {
      await this.rulesService.learnFromCorrection(businessId, dto.description, dto.categoryId);
    }

    return result;
  }

  // ──────────────────────────────────────────────
  //  Update Category (with rule learning)
  // ──────────────────────────────────────────────

  async updateCategory(businessId: string, id: string, categoryId: string | null) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, businessId },
    });
    if (!tx) return null;

    await this.prisma.transaction.updateMany({
      where: { id, businessId },
      data: { categoryId },
    });

    // Learn from user's category correction
    if (categoryId && tx.description) {
      await this.rulesService.learnFromCorrection(businessId, tx.description, categoryId);
    }

    return this.findOne(businessId, id);
  }

  // ──────────────────────────────────────────────
  //  Delete
  // ──────────────────────────────────────────────

  async remove(businessId: string, id: string) {
    return this.prisma.transaction.deleteMany({
      where: { id, businessId },
    });
  }

  async removeMany(businessId: string, ids: string[]) {
    if (!ids?.length) return { count: 0 };
    const result = await this.prisma.transaction.deleteMany({
      where: { id: { in: ids }, businessId },
    });
    return { count: result.count };
  }

  // ──────────────────────────────────────────────
  //  Bulk Update
  // ──────────────────────────────────────────────

  async bulkUpdate(
    businessId: string,
    ids: string[],
    updates: {
      categoryId?: string | null;
      accountId?: string;
      date?: string;
      description?: string;
    },
  ) {
    if (!ids?.length) return { count: 0 };

    const data: Record<string, unknown> = {};
    if (updates.categoryId !== undefined) data.categoryId = updates.categoryId || null;
    if (updates.accountId) data.accountId = updates.accountId;
    if (updates.date) {
      const s = String(updates.date).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) data.date = new Date(s + 'T00:00:00.000Z');
    }
    if (updates.description !== undefined) data.description = updates.description;
    if (Object.keys(data).length === 0) return { count: 0 };

    const result = await this.prisma.transaction.updateMany({
      where: { id: { in: ids }, businessId },
      data,
    });

    // Learn from bulk category assignment
    if (updates.categoryId && result.count > 0) {
      const txs = await this.prisma.transaction.findMany({
        where: { id: { in: ids }, businessId },
        select: { description: true },
      });
      for (const tx of txs) {
        if (tx.description) {
          await this.rulesService.learnFromCorrection(businessId, tx.description, updates.categoryId);
        }
      }
    }
    return { count: result.count };
  }

  // ──────────────────────────────────────────────
  //  Bulk Flip Sign
  // ──────────────────────────────────────────────

  async bulkFlipSign(businessId: string, ids: string[]) {
    if (!ids?.length) return { count: 0 };
    const txs = await this.prisma.transaction.findMany({
      where: { id: { in: ids }, businessId },
      select: { id: true, amount: true, vatAmount: true },
    });
    for (const tx of txs) {
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          amount: -Number(tx.amount),
          // Also flip VAT amount if present
          ...(tx.vatAmount != null && { vatAmount: -Number(tx.vatAmount) }),
        },
      });
    }
    return { count: txs.length };
  }
}
