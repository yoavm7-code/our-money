import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountType } from '@prisma/client';

const BALANCE_ACCOUNT_TYPES: AccountType[] = ['BANK', 'CREDIT_CARD', 'INVESTMENT', 'PENSION', 'INSURANCE', 'CASH'];
const TOTAL_BALANCE_TYPES: AccountType[] = ['BANK'];

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(
    householdId: string,
    from?: string,
    to?: string,
    accountId?: string,
    categoryId?: string,
  ) {
    const fromDate = from ? new Date(from) : startOfMonth(new Date());
    const toDate = to ? new Date(to) : new Date();
    const txWhere = {
      householdId,
      date: { gte: fromDate, lte: toDate } as { gte: Date; lte: Date },
      ...(accountId && { accountId }),
      ...(categoryId && { categoryId }),
    };

    const excludedExpenseCategoryIds = await this.prisma.category
      .findMany({
        where: { householdId, excludeFromExpenseTotal: true },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));

    const [accountsRaw, transactions] = await Promise.all([
      this.prisma.account.findMany({
        where: { householdId, isActive: true, ...(accountId && { id: accountId }) },
        select: { id: true, name: true, type: true, balance: true, balanceDate: true, currency: true },
      }),
      this.prisma.transaction.findMany({
        where: txWhere,
        select: { amount: true, categoryId: true, accountId: true, date: true, isRecurring: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    // Calculate balance up to the filter end date (not all time)
    const accountIds = accountsRaw.map((a) => a.id);
    const sums = accountIds.length > 0
      ? await this.prisma.transaction.groupBy({
          by: ['accountId'],
          where: {
            accountId: { in: accountIds },
            date: { lte: toDate },
          },
          _sum: { amount: true },
        })
      : [];
    const sumByAccount = new Map(sums.map((s) => [s.accountId, Number(s._sum.amount ?? 0)]));

    // Also calculate sums only for transactions after balanceDate (if set) up to toDate
    const accounts = accountsRaw.map((a) => {
      const initial = Number(a.balance ?? 0);
      const showBalance = BALANCE_ACCOUNT_TYPES.includes(a.type as AccountType);
      if (!showBalance) return { ...a, balance: null };
      // If balanceDate is set, we need transactions from balanceDate to toDate only
      // The groupBy above sums ALL tx up to toDate, so we use it as-is when no balanceDate
      const txSum = sumByAccount.get(a.id) ?? 0;
      const calculated = initial + txSum;
      return { ...a, balance: calculated };
    });

    // For date-filtered balance, recalculate per-account if balanceDate is set
    const balanceDateAccountIds = accountsRaw
      .filter((a) => a.balanceDate && BALANCE_ACCOUNT_TYPES.includes(a.type as AccountType))
      .map((a) => a.id);
    if (balanceDateAccountIds.length > 0) {
      // For accounts with balanceDate, sum only transactions AFTER balanceDate up to toDate
      for (const acct of accounts) {
        const raw = accountsRaw.find((a) => a.id === acct.id);
        if (!raw?.balanceDate || acct.balance === null) continue;
        const bDate = new Date(raw.balanceDate);
        const filteredSum = await this.prisma.transaction.aggregate({
          where: {
            accountId: acct.id,
            date: { gt: bDate, lte: toDate },
          },
          _sum: { amount: true },
        });
        acct.balance = Number(raw.balance ?? 0) + Number(filteredSum._sum.amount ?? 0);
      }
    }

    const totalBalance = accounts
      .filter((a) => TOTAL_BALANCE_TYPES.includes(a.type as AccountType))
      .reduce((sum, a) => sum + Number(a.balance), 0);
    const income = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const isExcludedExpense = (catId: string | null) =>
      catId != null && excludedExpenseCategoryIds.includes(catId);
    const expenses = transactions
      .filter((t) => Number(t.amount) < 0 && !isExcludedExpense(t.categoryId))
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    const byCategoryWhere = {
      householdId,
      date: { gte: fromDate, lte: toDate },
      amount: { lt: 0 },
      ...(accountId && { accountId }),
      ...(categoryId && { categoryId }),
      ...(excludedExpenseCategoryIds.length > 0 && {
        OR: [
          { categoryId: null },
          { categoryId: { notIn: excludedExpenseCategoryIds } },
        ],
      }),
    };
    const byCategory = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: byCategoryWhere,
      _sum: { amount: true },
    });

    const categoryIds = [...new Set(byCategory.map((c) => c.categoryId).filter(Boolean))] as string[];
    const categories = categoryIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, slug: true, color: true, icon: true },
        })
      : [];
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const spendingByCategory = byCategory
      .filter((c) => c.categoryId)
      .map((c) => ({
        categoryId: c.categoryId,
        category: catMap.get(c.categoryId!),
        total: Math.abs(Number((c._sum.amount as Decimal) || 0)),
      }))
      .sort((a, b) => b.total - a.total);

    // Income by category
    const incomeByCategoryWhere = {
      householdId,
      date: { gte: fromDate, lte: toDate },
      amount: { gt: 0 },
      ...(accountId && { accountId }),
      ...(categoryId && { categoryId }),
    };
    const byIncomeCategory = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: incomeByCategoryWhere,
      _sum: { amount: true },
    });
    const incomeCategoryIds = [...new Set(byIncomeCategory.map((c) => c.categoryId).filter(Boolean))] as string[];
    const incomeCategories = incomeCategoryIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: incomeCategoryIds } },
          select: { id: true, name: true, slug: true, color: true, icon: true },
        })
      : [];
    const incomeCatMap = new Map(incomeCategories.map((c) => [c.id, c]));
    const incomeByCategory = byIncomeCategory
      .filter((c) => c.categoryId)
      .map((c) => ({
        categoryId: c.categoryId,
        category: incomeCatMap.get(c.categoryId!),
        total: Number((c._sum.amount as Decimal) || 0),
      }))
      .sort((a, b) => b.total - a.total);

    const fixedExpensesSum = transactions
      .filter((t) => Number(t.amount) < 0 && !isExcludedExpense(t.categoryId))
      .reduce((sum, t) => sum + (t.isRecurring ? Math.abs(Number(t.amount)) : 0), 0);
    const fixedIncomeSum = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + (t.isRecurring ? Number(t.amount) : 0), 0);

    return {
      totalBalance,
      income,
      expenses,
      fixedExpensesSum,
      fixedIncomeSum,
      period: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },
      accounts,
      spendingByCategory,
      incomeByCategory,
      transactionCount: transactions.length,
    };
  }

  async getTrends(
    householdId: string,
    from: string,
    to: string,
    groupBy: 'month' | 'year' = 'month',
    accountId?: string,
    categoryId?: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const [excludedIds, transactions] = await Promise.all([
      this.prisma.category
        .findMany({
          where: { householdId, excludeFromExpenseTotal: true },
          select: { id: true },
        })
        .then((rows) => new Set(rows.map((r) => r.id))),
      this.prisma.transaction.findMany({
        where: {
          householdId,
          date: { gte: fromDate, lte: toDate },
          ...(accountId && { accountId }),
          ...(categoryId && { categoryId }),
        },
        select: { date: true, amount: true, categoryId: true },
      }),
    ]);

    const buckets = new Map<string, { income: number; expenses: number }>();
    for (const t of transactions) {
      const d = new Date(t.date);
      const key =
        groupBy === 'month'
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          : String(d.getFullYear());
      if (!buckets.has(key)) buckets.set(key, { income: 0, expenses: 0 });
      const b = buckets.get(key)!;
      const amt = Number(t.amount);
      if (amt > 0) b.income += amt;
      else if (t.categoryId == null || !excludedIds.has(t.categoryId))
        b.expenses += Math.abs(amt);
    }

    const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([period, data]) => ({ period, ...data }));
  }

  async getFixedExpenses(householdId: string): Promise<FixedItem[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await this.prisma.transaction.findMany({
      where: { householdId, isRecurring: true, amount: { lt: 0 } },
      select: {
        id: true,
        description: true,
        amount: true,
        date: true,
        installmentCurrent: true,
        installmentTotal: true,
        category: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });
    const result: FixedItem[] = [];
    for (const r of rows) {
      const cur = r.installmentCurrent ?? 0;
      const total = r.installmentTotal ?? 0;
      let expectedEndDate: string | null = null;
      if (total >= 1 && cur >= 1) {
        const firstDate = new Date(r.date);
        const endDate = addMonths(firstDate, total - 1);
        expectedEndDate = endDate.toISOString().slice(0, 10);
        if (endDate < today) continue; // installment plan ended, don't show
      }
      result.push({
        id: r.id,
        description: r.description,
        amount: Math.abs(Number(r.amount)),
        categoryName: r.category?.name ?? null,
        installmentCurrent: cur >= 1 ? cur : null,
        installmentTotal: total >= 1 ? total : null,
        expectedEndDate,
      });
    }
    return result;
  }

  async getRecentTransactions(householdId: string, limit = 5) {
    const rows = await this.prisma.transaction.findMany({
      where: { householdId },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        category: { select: { name: true, slug: true, color: true } },
        account: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      description: r.description,
      amount: Number(r.amount),
      categoryName: r.category?.name ?? null,
      categorySlug: r.category?.slug ?? null,
      categoryColor: r.category?.color ?? null,
      accountName: r.account?.name ?? null,
    }));
  }

  async getFixedIncome(householdId: string): Promise<FixedItem[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { householdId, isRecurring: true, amount: { gt: 0 } },
      select: {
        id: true,
        description: true,
        amount: true,
        category: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
      categoryName: r.category?.name ?? null,
      installmentCurrent: null,
      installmentTotal: null,
      expectedEndDate: null,
    }));
  }
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setMonth(out.getMonth() + months);
  return out;
}

export interface FixedItem {
  id: string;
  description: string;
  amount: number;
  categoryName: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  expectedEndDate: string | null; // YYYY-MM-DD, only for installments
}
