import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountType } from '@prisma/client';

const BALANCE_ACCOUNT_TYPES: AccountType[] = ['BANK', 'CREDIT_CARD', 'INVESTMENT', 'PENSION', 'INSURANCE', 'CASH'];
const TOTAL_BALANCE_TYPES: AccountType[] = ['BANK'];

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // ─── Summary ────────────────────────────────────────────────────────
  async getSummary(
    businessId: string,
    from?: string,
    to?: string,
    accountId?: string,
    categoryId?: string,
  ) {
    const fromDate = from ? new Date(from) : startOfMonth(new Date());
    const toDate = to ? new Date(to) : new Date();

    const txWhere = {
      businessId,
      date: { gte: fromDate, lte: toDate } as { gte: Date; lte: Date },
      ...(accountId && { accountId }),
      ...(categoryId && { categoryId }),
    };

    const excludedExpenseCategoryIds = await this.prisma.category
      .findMany({
        where: { businessId, excludeFromExpenseTotal: true },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));

    const [accountsRaw, transactions, unpaidInvoices, overdueInvoices] = await Promise.all([
      this.prisma.account.findMany({
        where: { businessId, isActive: true, ...(accountId && { id: accountId }) },
        select: { id: true, name: true, type: true, balance: true, balanceDate: true, currency: true },
      }),
      this.prisma.transaction.findMany({
        where: txWhere,
        select: { amount: true, categoryId: true, accountId: true, date: true, isRecurring: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.invoice.findMany({
        where: {
          businessId,
          status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        select: { total: true, paidAmount: true, status: true, clientId: true },
      }),
      this.prisma.invoice.count({
        where: {
          businessId,
          status: 'OVERDUE',
        },
      }),
    ]);

    // Calculate total balance from accounts
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

    const accounts = accountsRaw.map((a) => {
      const initial = Number(a.balance ?? 0);
      const showBalance = BALANCE_ACCOUNT_TYPES.includes(a.type as AccountType);
      if (!showBalance) return { ...a, balance: null };
      const txSum = sumByAccount.get(a.id) ?? 0;
      const calculated = initial + txSum;
      return { ...a, balance: calculated };
    });

    // For accounts with balanceDate, recalculate using only transactions after balanceDate
    const balanceDateAccountIds = accountsRaw
      .filter((a) => a.balanceDate && BALANCE_ACCOUNT_TYPES.includes(a.type as AccountType))
      .map((a) => a.id);
    if (balanceDateAccountIds.length > 0) {
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

    // Current balance: always as of today, ignoring filters
    const now = new Date();
    const allBankAccounts = await this.prisma.account.findMany({
      where: { businessId, isActive: true, type: 'BANK' },
      select: { id: true, name: true, balance: true, balanceDate: true },
    });
    const currentAccountBalances: Array<{ id: string; name: string; balance: number }> = [];
    let currentBalance = 0;
    for (const acct of allBankAccounts) {
      const initial = Number(acct.balance ?? 0);
      const dateFilter = acct.balanceDate
        ? { gt: new Date(acct.balanceDate), lte: now }
        : { lte: now };
      const s = await this.prisma.transaction.aggregate({
        where: { accountId: acct.id, date: dateFilter },
        _sum: { amount: true },
      });
      const bal = initial + Number(s._sum.amount ?? 0);
      currentAccountBalances.push({ id: acct.id, name: acct.name, balance: bal });
      currentBalance += bal;
    }

    const isExcludedExpense = (catId: string | null) =>
      catId != null && excludedExpenseCategoryIds.includes(catId);

    const income = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenses = transactions
      .filter((t) => Number(t.amount) < 0 && !isExcludedExpense(t.categoryId))
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    const profit = income - expenses;
    const profitMargin = income > 0 ? (profit / income) * 100 : 0;

    // Unpaid invoices total
    const unpaidInvoicesTotal = unpaidInvoices.reduce((sum, inv) => {
      const remaining = Number(inv.total) - Number(inv.paidAmount ?? 0);
      return sum + remaining;
    }, 0);

    // Spending by category
    const byCategoryWhere = {
      businessId,
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
    const byIncomeCategory = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        businessId,
        date: { gte: fromDate, lte: toDate },
        amount: { gt: 0 },
        ...(accountId && { accountId }),
        ...(categoryId && { categoryId }),
      },
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

    // Top 5 clients by revenue (paid invoices in period)
    const topClients = await this.getTopClientsByRevenue(businessId, fromDate, toDate, 5);

    // Fixed expenses/income sums
    const fixedExpensesSum = transactions
      .filter((t) => Number(t.amount) < 0 && !isExcludedExpense(t.categoryId))
      .reduce((sum, t) => sum + (t.isRecurring ? Math.abs(Number(t.amount)) : 0), 0);
    const fixedIncomeSum = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + (t.isRecurring ? Number(t.amount) : 0), 0);

    // Credit card charges
    const creditCardAccountIds = new Set(
      accountsRaw.filter((a) => a.type === 'CREDIT_CARD').map((a) => a.id),
    );
    const creditCardCharges = transactions
      .filter((t) => creditCardAccountIds.has(t.accountId) && Number(t.amount) < 0)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    return {
      totalBalance,
      currentBalance,
      income,
      expenses,
      profit,
      profitMargin: Math.round(profitMargin * 100) / 100,
      unpaidInvoicesTotal,
      overdueInvoicesCount: overdueInvoices,
      creditCardCharges,
      fixedExpensesSum,
      fixedIncomeSum,
      period: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },
      accounts,
      currentAccountBalances,
      spendingByCategory,
      incomeByCategory,
      topClients,
      transactionCount: transactions.length,
    };
  }

  // ─── Top Clients by Revenue ─────────────────────────────────────────
  private async getTopClientsByRevenue(
    businessId: string,
    from: Date,
    to: Date,
    limit: number,
  ) {
    const paidInvoices = await this.prisma.invoice.groupBy({
      by: ['clientId'],
      where: {
        businessId,
        status: 'PAID',
        paidDate: { gte: from, lte: to },
        clientId: { not: null },
      },
      _sum: { total: true },
      _count: true,
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });

    const clientIds = paidInvoices
      .map((p) => p.clientId)
      .filter(Boolean) as string[];
    const clients = clientIds.length
      ? await this.prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true, color: true },
        })
      : [];
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    return paidInvoices
      .filter((p) => p.clientId)
      .map((p) => ({
        clientId: p.clientId,
        client: clientMap.get(p.clientId!),
        revenue: Number(p._sum.total ?? 0),
        invoiceCount: p._count,
      }));
  }

  // ─── Trends ─────────────────────────────────────────────────────────
  async getTrends(
    businessId: string,
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
          where: { businessId, excludeFromExpenseTotal: true },
          select: { id: true },
        })
        .then((rows) => new Set(rows.map((r) => r.id))),
      this.prisma.transaction.findMany({
        where: {
          businessId,
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
    return sorted.map(([period, data]) => ({
      period,
      income: data.income,
      expenses: data.expenses,
      profit: data.income - data.expenses,
    }));
  }

  // ─── Recent Transactions ────────────────────────────────────────────
  async getRecentTransactions(businessId: string, limit = 10) {
    const rows = await this.prisma.transaction.findMany({
      where: { businessId },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        currency: true,
        isRecurring: true,
        category: { select: { name: true, slug: true, color: true, icon: true } },
        account: { select: { name: true, type: true } },
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      description: r.description,
      amount: Number(r.amount),
      currency: r.currency,
      isRecurring: r.isRecurring,
      categoryName: r.category?.name ?? null,
      categorySlug: r.category?.slug ?? null,
      categoryColor: r.category?.color ?? null,
      categoryIcon: r.category?.icon ?? null,
      accountName: r.account?.name ?? null,
      accountType: r.account?.type ?? null,
      client: r.client ?? null,
      project: r.project ?? null,
    }));
  }

  // ─── Cash Flow Forecast ─────────────────────────────────────────────
  async getCashFlow(businessId: string) {
    const now = new Date();

    // Current balance
    const bankAccounts = await this.prisma.account.findMany({
      where: { businessId, isActive: true, type: 'BANK' },
      select: { id: true, balance: true, balanceDate: true },
    });
    let currentBalance = 0;
    for (const acct of bankAccounts) {
      const initial = Number(acct.balance ?? 0);
      const dateFilter = acct.balanceDate
        ? { gt: new Date(acct.balanceDate), lte: now }
        : { lte: now };
      const s = await this.prisma.transaction.aggregate({
        where: { accountId: acct.id, date: dateFilter },
        _sum: { amount: true },
      });
      currentBalance += initial + Number(s._sum.amount ?? 0);
    }

    // Projected income from pending/sent invoices
    const pendingInvoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: {
        id: true,
        total: true,
        paidAmount: true,
        dueDate: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const projectedIncome = pendingInvoices.map((inv) => ({
      invoiceId: inv.id,
      clientName: inv.client?.name ?? 'Unknown',
      amount: Number(inv.total) - Number(inv.paidAmount ?? 0),
      dueDate: inv.dueDate
        ? (inv.dueDate instanceof Date ? inv.dueDate.toISOString().slice(0, 10) : String(inv.dueDate).slice(0, 10))
        : null,
      status: inv.status,
    }));

    const totalProjectedIncome = projectedIncome.reduce((s, p) => s + p.amount, 0);

    // Recurring expenses (monthly averages from last 3 months)
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const recurringExpenses = await this.prisma.transaction.findMany({
      where: {
        businessId,
        isRecurring: true,
        amount: { lt: 0 },
        date: { gte: threeMonthsAgo, lte: now },
      },
      select: { description: true, amount: true, categoryId: true },
    });

    // Also get recurring patterns
    const recurringPatterns = await this.prisma.recurringPattern.findMany({
      where: {
        businessId,
        isDismissed: false,
        type: 'expense',
      },
      select: { description: true, amount: true, frequency: true },
    });

    // Group recurring expenses by description to get monthly average
    const recurringMap = new Map<string, { total: number; count: number }>();
    for (const re of recurringExpenses) {
      const key = re.description.toLowerCase().trim();
      const existing = recurringMap.get(key) || { total: 0, count: 0 };
      existing.total += Math.abs(Number(re.amount));
      existing.count += 1;
      recurringMap.set(key, existing);
    }
    const monthlyRecurringExpenses = [...recurringMap.entries()].map(([desc, data]) => ({
      description: desc,
      monthlyAmount: data.total / 3,
    }));
    const totalMonthlyRecurringExpenses = monthlyRecurringExpenses.reduce((s, e) => s + e.monthlyAmount, 0);

    // Recurring income
    const recurringIncome = await this.prisma.transaction.findMany({
      where: {
        businessId,
        isRecurring: true,
        amount: { gt: 0 },
        date: { gte: threeMonthsAgo, lte: now },
      },
      select: { description: true, amount: true },
    });
    const incomeMap = new Map<string, { total: number; count: number }>();
    for (const ri of recurringIncome) {
      const key = ri.description.toLowerCase().trim();
      const existing = incomeMap.get(key) || { total: 0, count: 0 };
      existing.total += Number(ri.amount);
      existing.count += 1;
      incomeMap.set(key, existing);
    }
    const totalMonthlyRecurringIncome = [...incomeMap.values()].reduce((s, e) => s + e.total / 3, 0);

    // Active projects pipeline
    const activeProjects = await this.prisma.project.findMany({
      where: { businessId, status: 'ACTIVE', budgetAmount: { not: null } },
      select: {
        id: true,
        name: true,
        budgetAmount: true,
        client: { select: { name: true } },
      },
    });

    // 3-month forecast
    const forecast: Array<{
      month: string;
      projectedIncome: number;
      projectedExpenses: number;
      netForecast: number;
      runningBalance: number;
    }> = [];
    let runningBalance = currentBalance;
    for (let i = 1; i <= 3; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthKey = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;
      const forecastEnd = new Date(forecastDate.getFullYear(), forecastDate.getMonth() + 1, 0);

      // Income from invoices due this month
      const monthInvoiceIncome = projectedIncome
        .filter((p) => {
          if (!p.dueDate) return false;
          const dd = new Date(p.dueDate);
          return dd >= forecastDate && dd <= forecastEnd;
        })
        .reduce((s, p) => s + p.amount, 0);

      const monthProjectedIncome = monthInvoiceIncome + totalMonthlyRecurringIncome;
      const monthProjectedExpenses = totalMonthlyRecurringExpenses;
      const net = monthProjectedIncome - monthProjectedExpenses;
      runningBalance += net;

      forecast.push({
        month: monthKey,
        projectedIncome: Math.round(monthProjectedIncome * 100) / 100,
        projectedExpenses: Math.round(monthProjectedExpenses * 100) / 100,
        netForecast: Math.round(net * 100) / 100,
        runningBalance: Math.round(runningBalance * 100) / 100,
      });
    }

    return {
      currentBalance: Math.round(currentBalance * 100) / 100,
      projectedIncome,
      totalProjectedIncome: Math.round(totalProjectedIncome * 100) / 100,
      monthlyRecurringExpenses: Math.round(totalMonthlyRecurringExpenses * 100) / 100,
      monthlyRecurringIncome: Math.round(totalMonthlyRecurringIncome * 100) / 100,
      activeProjects: activeProjects.map((p) => ({
        id: p.id,
        name: p.name,
        budgetAmount: Number(p.budgetAmount),
        clientName: p.client?.name ?? null,
      })),
      forecast,
    };
  }

  // ─── Fixed Items (Recurring Income & Expenses) ──────────────────────
  async getFixedItems(businessId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [expenseRows, incomeRows] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { businessId, isRecurring: true, amount: { lt: 0 } },
        select: {
          id: true,
          description: true,
          amount: true,
          date: true,
          installmentCurrent: true,
          installmentTotal: true,
          category: { select: { name: true, icon: true, color: true } },
          account: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.transaction.findMany({
        where: { businessId, isRecurring: true, amount: { gt: 0 } },
        select: {
          id: true,
          description: true,
          amount: true,
          date: true,
          category: { select: { name: true, icon: true, color: true } },
          account: { select: { name: true } },
          client: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    const fixedExpenses: FixedItem[] = [];
    for (const r of expenseRows) {
      const cur = r.installmentCurrent ?? 0;
      const total = r.installmentTotal ?? 0;
      let expectedEndDate: string | null = null;
      if (total >= 1 && cur >= 1) {
        const firstDate = new Date(r.date);
        const endDate = addMonths(firstDate, total - 1);
        expectedEndDate = endDate.toISOString().slice(0, 10);
        if (endDate < today) continue;
      }
      fixedExpenses.push({
        id: r.id,
        description: r.description,
        amount: Math.abs(Number(r.amount)),
        categoryName: r.category?.name ?? null,
        categoryIcon: r.category?.icon ?? null,
        categoryColor: r.category?.color ?? null,
        accountName: r.account?.name ?? null,
        installmentCurrent: cur >= 1 ? cur : null,
        installmentTotal: total >= 1 ? total : null,
        expectedEndDate,
      });
    }

    const fixedIncome: FixedItem[] = incomeRows.map((r) => ({
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
      categoryName: r.category?.name ?? null,
      categoryIcon: r.category?.icon ?? null,
      categoryColor: r.category?.color ?? null,
      accountName: r.account?.name ?? null,
      clientName: r.client?.name ?? null,
      installmentCurrent: null,
      installmentTotal: null,
      expectedEndDate: null,
    }));

    return {
      fixedExpenses,
      fixedIncome,
      totalFixedExpenses: fixedExpenses.reduce((s, e) => s + e.amount, 0),
      totalFixedIncome: fixedIncome.reduce((s, i) => s + i.amount, 0),
    };
  }

  // ─── Search ─────────────────────────────────────────────────────────
  async search(businessId: string, query: string) {
    const trimmed = (query ?? '').trim();
    const empty = { transactions: [], clients: [], invoices: [], accounts: [], categories: [] };
    if (trimmed.length < 2) return empty;

    const [transactions, clients, invoices, accounts, categories] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          businessId,
          description: { contains: trimmed, mode: 'insensitive' },
        },
        take: 10,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
          category: { select: { name: true } },
          client: { select: { name: true } },
        },
      }),
      this.prisma.client.findMany({
        where: {
          businessId,
          isActive: true,
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { contactName: { contains: trimmed, mode: 'insensitive' } },
            { email: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        take: 5,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          contactName: true,
          email: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          businessId,
          OR: [
            { invoiceNumber: { contains: trimmed, mode: 'insensitive' } },
            { client: { name: { contains: trimmed, mode: 'insensitive' } } },
          ],
        },
        take: 5,
        orderBy: { issueDate: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          status: true,
          issueDate: true,
          client: { select: { name: true } },
        },
      }),
      this.prisma.account.findMany({
        where: {
          businessId,
          name: { contains: trimmed, mode: 'insensitive' },
        },
        take: 5,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          type: true,
          balance: true,
        },
      }),
      this.prisma.category.findMany({
        where: {
          businessId,
          name: { contains: trimmed, mode: 'insensitive' },
        },
        take: 5,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          isIncome: true,
        },
      }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id,
        date: t.date instanceof Date ? t.date.toISOString().slice(0, 10) : String(t.date).slice(0, 10),
        description: t.description,
        amount: Number(t.amount),
        categoryName: t.category?.name ?? null,
        clientName: t.client?.name ?? null,
      })),
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        contactName: c.contactName,
        email: c.email,
      })),
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        total: Number(inv.total),
        status: inv.status,
        issueDate: inv.issueDate instanceof Date
          ? inv.issueDate.toISOString().slice(0, 10)
          : String(inv.issueDate).slice(0, 10),
        clientName: inv.client?.name ?? null,
      })),
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: Number(a.balance),
      })),
      categories,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────
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
  categoryIcon?: string | null;
  categoryColor?: string | null;
  accountName?: string | null;
  clientName?: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  expectedEndDate: string | null;
}
