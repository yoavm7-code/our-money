import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionSource } from '@prisma/client';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsQueryDto } from './dto/transactions-query.dto';
import { RulesService } from '../rules/rules.service';
import { CategoriesService } from '../categories/categories.service';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private rulesService: RulesService,
    private categoriesService: CategoriesService,
  ) {}

  async suggestCategory(householdId: string, description: string): Promise<string | null> {
    return this.rulesService.suggestCategory(householdId, description);
  }

  async create(
    householdId: string,
    dto: CreateTransactionDto,
    source: TransactionSource = 'MANUAL',
    documentId?: string,
  ) {
    let categoryId = dto.categoryId ?? null;
    if (!categoryId && dto.description) {
      const suggested = await this.rulesService.suggestCategory(householdId, dto.description);
      if (suggested) categoryId = suggested;
    }
    return this.prisma.transaction.create({
      data: {
        householdId,
        accountId: dto.accountId,
        categoryId,
        date: new Date(dto.date),
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency ?? 'ILS',
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

  /** Generate a readable name from a slug (e.g. "bank_fees" → "Bank fees") */
  private slugToName(slug: string): string {
    return slug
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async createMany(
    householdId: string,
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
    let categories = await this.categoriesService.findAll(householdId);
    let bySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const ensureCategory = async (slug: string) => {
      let id = bySlug.get(slug);
      if (!id) {
        // Create category: use known definition or generate from slug
        const def = this.KNOWN_SLUGS[slug];
        const name = def?.name ?? this.slugToName(slug);
        const isIncome = def?.isIncome ?? false;
        try {
          const created = await this.categoriesService.create(householdId, {
            name,
            slug,
            isIncome,
          });
          id = (created as { id: string }).id;
          bySlug.set(slug, id);
        } catch {
          // Might already exist (race condition) - refresh and get
          categories = await this.categoriesService.findAll(householdId);
          bySlug = new Map(categories.map((c) => [c.slug, c.id]));
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
        categoryId = await this.rulesService.suggestCategory(householdId, item.description);
      }
      const isRecurringIncome = item.categorySlug === 'salary' && item.amount > 0;
      const t = await this.prisma.transaction.create({
        data: {
          householdId,
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

  async findAll(householdId: string, query: TransactionsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const page = Math.max(1, parseInt(String(query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit), 10) || 20));
    const where: {
      householdId: string;
      date?: { gte?: Date; lte?: Date };
      accountId?: string;
      categoryId?: string;
      OR?: Array<{ description?: { contains: string; mode: 'insensitive' } }>;
    } = {
      householdId,
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.categoryId && { categoryId: query.categoryId }),
    };
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      const orConditions: unknown[] = [
        { description: { contains: term, mode: 'insensitive' } },
        { account: { name: { contains: term, mode: 'insensitive' } } },
      ];
      const numVal = parseFloat(term.replace(/,/g, ''));
      if (!Number.isNaN(numVal)) {
        orConditions.push({ amount: numVal });
        orConditions.push({ amount: -numVal });
      }
      const isoMatch = term.match(/^(\d{4})-(\d{2})-(\d{2})$/); // YYYY-MM-DD
      const dmyMatch = term.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/); // DD.MM.YYYY or DD/MM/YYYY
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
      where.OR = orConditions as typeof where.OR;
    }
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { account: true, category: true },
      }),
      this.prisma.transaction.count({ where }),
    ]);
    const items = rows.map((tx) => this.addDisplayDates(this.fixDisplayAmount(tx)));
    return { items, total, page, limit };
  }

  /** Prisma Decimal → number (Decimal has toNumber(); fallback toString/parseFloat). */
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
    if (Number.isNaN(firstDate.getTime())) return tx as Record<string, unknown>;
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

  async findOne(householdId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, householdId },
      include: { account: true, category: true, document: true },
    });
    return tx ? this.addDisplayDates(this.fixDisplayAmount(tx)) : null;
  }

  async update(householdId: string, id: string, dto: UpdateTransactionDto) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.date) {
      const s = String(dto.date).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        data.date = new Date(s + 'T00:00:00.000Z');
      }
    }
    if (dto.isRecurring !== undefined) data.isRecurring = dto.isRecurring;
    const result = await this.prisma.transaction.updateMany({
      where: { id, householdId },
      data,
    });
    if (result.count > 0 && dto.categoryId && dto.description) {
      await this.rulesService.learnFromCorrection(householdId, dto.description, dto.categoryId);
    }
    return result;
  }

  async updateCategory(householdId: string, id: string, categoryId: string | null) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, householdId },
    });
    if (!tx) return null;
    await this.prisma.transaction.updateMany({
      where: { id, householdId },
      data: { categoryId },
    });
    if (categoryId && tx.description) {
      await this.rulesService.learnFromCorrection(householdId, tx.description, categoryId);
    }
    return this.findOne(householdId, id);
  }

  async remove(householdId: string, id: string) {
    return this.prisma.transaction.deleteMany({
      where: { id, householdId },
    });
  }

  async removeMany(householdId: string, ids: string[]) {
    if (!ids?.length) return { count: 0 };
    const result = await this.prisma.transaction.deleteMany({
      where: { id: { in: ids }, householdId },
    });
    return { count: result.count };
  }

  async bulkUpdate(
    householdId: string,
    ids: string[],
    updates: { categoryId?: string | null; date?: string; description?: string },
  ) {
    if (!ids?.length) return { count: 0 };
    const data: Record<string, unknown> = {};
    if (updates.categoryId !== undefined) data.categoryId = updates.categoryId || null;
    if (updates.date) {
      const s = String(updates.date).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) data.date = new Date(s + 'T00:00:00.000Z');
    }
    if (updates.description !== undefined) data.description = updates.description;
    if (Object.keys(data).length === 0) return { count: 0 };
    const result = await this.prisma.transaction.updateMany({
      where: { id: { in: ids }, householdId },
      data,
    });
    // Learn from bulk category assignment
    if (updates.categoryId && result.count > 0) {
      const txs = await this.prisma.transaction.findMany({
        where: { id: { in: ids }, householdId },
        select: { description: true },
      });
      for (const tx of txs) {
        if (tx.description) {
          await this.rulesService.learnFromCorrection(householdId, tx.description, updates.categoryId);
        }
      }
    }
    return { count: result.count };
  }

  async bulkFlipSign(householdId: string, ids: string[]) {
    if (!ids?.length) return { count: 0 };
    const txs = await this.prisma.transaction.findMany({
      where: { id: { in: ids }, householdId },
      select: { id: true, amount: true },
    });
    for (const tx of txs) {
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: { amount: -Number(tx.amount) },
      });
    }
    return { count: txs.length };
  }
}
