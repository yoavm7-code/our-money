import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ─── Profit & Loss Report ──────────────────────────────────────────
  async getProfitLoss(businessId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const [transactions, invoicesPaid, categories] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          businessId,
          date: { gte: fromDate, lte: toDate },
        },
        select: {
          amount: true,
          categoryId: true,
          vatAmount: true,
          isTaxDeductible: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          businessId,
          status: 'PAID',
          paidDate: { gte: fromDate, lte: toDate },
        },
        select: {
          subtotal: true,
          vatAmount: true,
          total: true,
        },
      }),
      this.prisma.category.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          slug: true,
          isIncome: true,
          isTaxDeductible: true,
          deductionRate: true,
          excludeFromExpenseTotal: true,
        },
      }),
    ]);

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const excludedIds = new Set(
      categories.filter((c) => c.excludeFromExpenseTotal).map((c) => c.id),
    );

    // Revenue from invoices paid in period
    const invoiceRevenue = invoicesPaid.reduce(
      (sum, inv) => sum + Number(inv.subtotal),
      0,
    );
    const invoiceVat = invoicesPaid.reduce(
      (sum, inv) => sum + Number(inv.vatAmount),
      0,
    );

    // Revenue from income transactions (positive amounts)
    const transactionIncome = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Use the higher of invoice revenue or transaction income as total revenue
    const totalRevenue = Math.max(invoiceRevenue, transactionIncome);

    // Operating expenses by category
    const expensesByCategory = new Map<string, { name: string; total: number; deductible: number }>();
    let totalOperatingExpenses = 0;

    for (const t of transactions) {
      const amt = Number(t.amount);
      if (amt >= 0) continue;
      if (t.categoryId && excludedIds.has(t.categoryId)) continue;

      const absAmt = Math.abs(amt);
      const cat = t.categoryId ? catMap.get(t.categoryId) : null;
      const catName = cat?.name ?? 'Uncategorized';
      const catKey = t.categoryId ?? '__uncategorized';

      const existing = expensesByCategory.get(catKey) || {
        name: catName,
        total: 0,
        deductible: 0,
      };
      existing.total += absAmt;

      // Calculate deductible amount
      const deductionRate = cat?.deductionRate ? Number(cat.deductionRate) / 100 : 1;
      const isDeductible = cat?.isTaxDeductible !== false && t.isTaxDeductible;
      existing.deductible += isDeductible ? absAmt * deductionRate : 0;

      expensesByCategory.set(catKey, existing);
      totalOperatingExpenses += absAmt;
    }

    const operatingExpenses = [...expensesByCategory.values()]
      .sort((a, b) => b.total - a.total)
      .map((e) => ({
        category: e.name,
        total: Math.round(e.total * 100) / 100,
        deductible: Math.round(e.deductible * 100) / 100,
        percentage: totalOperatingExpenses > 0
          ? Math.round((e.total / totalOperatingExpenses) * 10000) / 100
          : 0,
      }));

    const grossProfit = totalRevenue;
    const netProfit = totalRevenue - totalOperatingExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const totalDeductibleExpenses = [...expensesByCategory.values()].reduce(
      (sum, e) => sum + e.deductible,
      0,
    );

    // Monthly breakdown
    const monthlyBreakdown = await this.getMonthlyBreakdown(businessId, fromDate, toDate);

    return {
      period: { from, to },
      revenue: {
        invoiceRevenue: Math.round(invoiceRevenue * 100) / 100,
        invoiceVat: Math.round(invoiceVat * 100) / 100,
        transactionIncome: Math.round(transactionIncome * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      },
      grossProfit: Math.round(grossProfit * 100) / 100,
      operatingExpenses,
      totalOperatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
      totalDeductibleExpenses: Math.round(totalDeductibleExpenses * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      monthlyBreakdown,
    };
  }

  // ─── Cash Flow Report ──────────────────────────────────────────────
  async getCashFlowReport(businessId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Opening balance: sum of all bank account balances + transactions before period
    const bankAccounts = await this.prisma.account.findMany({
      where: { businessId, isActive: true, type: 'BANK' },
      select: { id: true, name: true, balance: true, balanceDate: true },
    });

    let openingBalance = 0;
    for (const acct of bankAccounts) {
      const initial = Number(acct.balance ?? 0);
      const dateFilter = acct.balanceDate
        ? { gt: new Date(acct.balanceDate), lt: fromDate }
        : { lt: fromDate };
      const s = await this.prisma.transaction.aggregate({
        where: { accountId: acct.id, date: dateFilter },
        _sum: { amount: true },
      });
      openingBalance += initial + Number(s._sum.amount ?? 0);
    }

    // Transactions in period
    const transactions = await this.prisma.transaction.findMany({
      where: {
        businessId,
        date: { gte: fromDate, lte: toDate },
      },
      select: {
        amount: true,
        date: true,
        categoryId: true,
        description: true,
      },
      orderBy: { date: 'asc' },
    });

    const categories = await this.prisma.category.findMany({
      where: { businessId },
      select: { id: true, name: true, isIncome: true, excludeFromExpenseTotal: true },
    });
    const catMap = new Map(categories.map((c) => [c.id, c]));

    // Inflows
    const invoicesPaidInPeriod = await this.prisma.invoice.findMany({
      where: {
        businessId,
        status: 'PAID',
        paidDate: { gte: fromDate, lte: toDate },
      },
      select: { total: true, clientId: true, client: { select: { name: true } } },
    });
    const invoiceInflow = invoicesPaidInPeriod.reduce(
      (sum, inv) => sum + Number(inv.total),
      0,
    );

    const otherIncome = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Take the max to avoid double-counting
    const totalInflows = Math.max(invoiceInflow, otherIncome);

    // Outflows by category
    const outflowsByCategory = new Map<string, { name: string; total: number }>();
    let totalOutflows = 0;
    for (const t of transactions) {
      const amt = Number(t.amount);
      if (amt >= 0) continue;
      const absAmt = Math.abs(amt);
      const cat = t.categoryId ? catMap.get(t.categoryId) : null;
      const catName = cat?.name ?? 'Uncategorized';
      const catKey = t.categoryId ?? '__uncategorized';
      const existing = outflowsByCategory.get(catKey) || { name: catName, total: 0 };
      existing.total += absAmt;
      outflowsByCategory.set(catKey, existing);
      totalOutflows += absAmt;
    }

    const outflows = [...outflowsByCategory.values()]
      .sort((a, b) => b.total - a.total)
      .map((o) => ({
        category: o.name,
        total: Math.round(o.total * 100) / 100,
        percentage: totalOutflows > 0
          ? Math.round((o.total / totalOutflows) * 10000) / 100
          : 0,
      }));

    const closingBalance = openingBalance + totalInflows - totalOutflows;

    // Monthly breakdown
    const monthBuckets = new Map<string, { inflows: number; outflows: number }>();
    for (const t of transactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthBuckets.has(key)) monthBuckets.set(key, { inflows: 0, outflows: 0 });
      const b = monthBuckets.get(key)!;
      const amt = Number(t.amount);
      if (amt > 0) b.inflows += amt;
      else b.outflows += Math.abs(amt);
    }

    let runningBal = openingBalance;
    const monthlyBreakdown = [...monthBuckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => {
        runningBal += data.inflows - data.outflows;
        return {
          month,
          inflows: Math.round(data.inflows * 100) / 100,
          outflows: Math.round(data.outflows * 100) / 100,
          net: Math.round((data.inflows - data.outflows) * 100) / 100,
          runningBalance: Math.round(runningBal * 100) / 100,
        };
      });

    return {
      period: { from, to },
      openingBalance: Math.round(openingBalance * 100) / 100,
      inflows: {
        invoicePayments: Math.round(invoiceInflow * 100) / 100,
        otherIncome: Math.round(otherIncome * 100) / 100,
        total: Math.round(totalInflows * 100) / 100,
      },
      outflows: {
        byCategory: outflows,
        total: Math.round(totalOutflows * 100) / 100,
      },
      netCashFlow: Math.round((totalInflows - totalOutflows) * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
      monthlyBreakdown,
    };
  }

  // ─── Client Revenue Report ─────────────────────────────────────────
  async getClientRevenue(businessId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Get all invoices paid in period grouped by client
    const invoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        status: 'PAID',
        paidDate: { gte: fromDate, lte: toDate },
      },
      select: {
        clientId: true,
        total: true,
        subtotal: true,
        vatAmount: true,
        issueDate: true,
        paidDate: true,
        client: { select: { id: true, name: true, color: true } },
      },
    });

    // Group by client
    const clientData = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        clientColor: string | null;
        totalRevenue: number;
        totalBeforeVat: number;
        invoiceCount: number;
        totalPaymentDays: number;
        paidInvoiceCount: number;
      }
    >();

    for (const inv of invoices) {
      const clientId = inv.clientId ?? '__no_client';
      const clientName = inv.client?.name ?? 'No Client';
      const clientColor = inv.client?.color ?? null;

      const existing = clientData.get(clientId) || {
        clientId,
        clientName,
        clientColor,
        totalRevenue: 0,
        totalBeforeVat: 0,
        invoiceCount: 0,
        totalPaymentDays: 0,
        paidInvoiceCount: 0,
      };

      existing.totalRevenue += Number(inv.total);
      existing.totalBeforeVat += Number(inv.subtotal);
      existing.invoiceCount += 1;

      // Calculate payment speed
      if (inv.issueDate && inv.paidDate) {
        const issued = new Date(inv.issueDate);
        const paid = new Date(inv.paidDate);
        const daysDiff = Math.max(0, Math.floor((paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24)));
        existing.totalPaymentDays += daysDiff;
        existing.paidInvoiceCount += 1;
      }

      clientData.set(clientId, existing);
    }

    const totalRevenue = [...clientData.values()].reduce(
      (s, c) => s + c.totalRevenue,
      0,
    );

    const clients = [...clientData.values()]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .map((c) => ({
        clientId: c.clientId === '__no_client' ? null : c.clientId,
        clientName: c.clientName,
        clientColor: c.clientColor,
        totalRevenue: Math.round(c.totalRevenue * 100) / 100,
        totalBeforeVat: Math.round(c.totalBeforeVat * 100) / 100,
        invoiceCount: c.invoiceCount,
        averageInvoiceSize:
          c.invoiceCount > 0
            ? Math.round((c.totalRevenue / c.invoiceCount) * 100) / 100
            : 0,
        averagePaymentDays:
          c.paidInvoiceCount > 0
            ? Math.round(c.totalPaymentDays / c.paidInvoiceCount)
            : null,
        revenuePercentage:
          totalRevenue > 0
            ? Math.round((c.totalRevenue / totalRevenue) * 10000) / 100
            : 0,
      }));

    // Also include outstanding amounts per client
    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: {
        clientId: true,
        total: true,
        paidAmount: true,
        client: { select: { name: true } },
      },
    });

    const outstandingByClient = new Map<string, number>();
    for (const inv of outstandingInvoices) {
      const cid = inv.clientId ?? '__no_client';
      const remaining = Number(inv.total) - Number(inv.paidAmount ?? 0);
      outstandingByClient.set(cid, (outstandingByClient.get(cid) ?? 0) + remaining);
    }

    const clientsWithOutstanding = clients.map((c) => ({
      ...c,
      outstandingAmount: Math.round(
        (outstandingByClient.get(c.clientId ?? '__no_client') ?? 0) * 100,
      ) / 100,
    }));

    return {
      period: { from, to },
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      clientCount: clients.length,
      clients: clientsWithOutstanding,
    };
  }

  // ─── Category Breakdown Report ─────────────────────────────────────
  async getCategoryBreakdown(businessId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const [expenseGroups, incomeGroups, categories] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          businessId,
          date: { gte: fromDate, lte: toDate },
          amount: { lt: 0 },
        },
        _sum: { amount: true },
        _count: true,
        _avg: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          businessId,
          date: { gte: fromDate, lte: toDate },
          amount: { gt: 0 },
        },
        _sum: { amount: true },
        _count: true,
        _avg: { amount: true },
      }),
      this.prisma.category.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          slug: true,
          icon: true,
          color: true,
          isIncome: true,
          isTaxDeductible: true,
          deductionRate: true,
        },
      }),
    ]);

    const catMap = new Map(categories.map((c) => [c.id, c]));

    const totalExpenses = expenseGroups.reduce(
      (sum, g) => sum + Math.abs(Number(g._sum.amount ?? 0)),
      0,
    );
    const totalIncome = incomeGroups.reduce(
      (sum, g) => sum + Number(g._sum.amount ?? 0),
      0,
    );

    const expenseCategories = expenseGroups
      .map((g) => {
        const cat = g.categoryId ? catMap.get(g.categoryId) : null;
        const total = Math.abs(Number(g._sum.amount ?? 0));
        return {
          categoryId: g.categoryId,
          categoryName: cat?.name ?? 'Uncategorized',
          categorySlug: cat?.slug ?? null,
          categoryIcon: cat?.icon ?? null,
          categoryColor: cat?.color ?? null,
          isTaxDeductible: cat?.isTaxDeductible ?? true,
          deductionRate: cat?.deductionRate ? Number(cat.deductionRate) : 100,
          total: Math.round(total * 100) / 100,
          count: g._count,
          average: Math.round(Math.abs(Number(g._avg.amount ?? 0)) * 100) / 100,
          percentage: totalExpenses > 0
            ? Math.round((total / totalExpenses) * 10000) / 100
            : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    const incomeCategories = incomeGroups
      .map((g) => {
        const cat = g.categoryId ? catMap.get(g.categoryId) : null;
        const total = Number(g._sum.amount ?? 0);
        return {
          categoryId: g.categoryId,
          categoryName: cat?.name ?? 'Uncategorized',
          categorySlug: cat?.slug ?? null,
          categoryIcon: cat?.icon ?? null,
          categoryColor: cat?.color ?? null,
          total: Math.round(total * 100) / 100,
          count: g._count,
          average: Math.round(Number(g._avg.amount ?? 0) * 100) / 100,
          percentage: totalIncome > 0
            ? Math.round((total / totalIncome) * 10000) / 100
            : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      period: { from, to },
      expenses: {
        total: Math.round(totalExpenses * 100) / 100,
        categories: expenseCategories,
      },
      income: {
        total: Math.round(totalIncome * 100) / 100,
        categories: incomeCategories,
      },
    };
  }

  // ─── Tax Summary Report ────────────────────────────────────────────
  async getTaxSummary(businessId: string, year: number) {
    const fromDate = new Date(year, 0, 1);
    const toDate = new Date(year, 11, 31, 23, 59, 59);

    const [
      transactions,
      invoices,
      categories,
      taxPeriods,
      business,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          businessId,
          date: { gte: fromDate, lte: toDate },
        },
        select: {
          amount: true,
          vatAmount: true,
          categoryId: true,
          isTaxDeductible: true,
          isVatIncluded: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          businessId,
          issueDate: { gte: fromDate, lte: toDate },
        },
        select: {
          subtotal: true,
          vatAmount: true,
          total: true,
          status: true,
        },
      }),
      this.prisma.category.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          isTaxDeductible: true,
          deductionRate: true,
          isIncome: true,
          excludeFromExpenseTotal: true,
        },
      }),
      this.prisma.taxPeriod.findMany({
        where: {
          businessId,
          periodStart: { gte: fromDate },
          periodEnd: { lte: toDate },
        },
        orderBy: { periodStart: 'asc' },
      }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { vatRate: true, defaultCurrency: true },
      }),
    ]);

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const vatRate = Number(business?.vatRate ?? 17);

    // Total revenue (from invoices issued)
    const totalInvoicedRevenue = invoices.reduce(
      (sum, inv) => sum + Number(inv.subtotal),
      0,
    );
    const totalVatCollected = invoices.reduce(
      (sum, inv) => sum + Number(inv.vatAmount),
      0,
    );

    // Revenue from transactions (positive amounts)
    const transactionIncome = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalRevenue = Math.max(totalInvoicedRevenue, transactionIncome);

    // Deductible expenses
    let totalExpenses = 0;
    let totalDeductibleExpenses = 0;
    let totalVatOnExpenses = 0;

    const deductibleByCategory = new Map<
      string,
      { name: string; total: number; deductible: number; vatPaid: number }
    >();

    for (const t of transactions) {
      const amt = Number(t.amount);
      if (amt >= 0) continue;

      const absAmt = Math.abs(amt);
      const cat = t.categoryId ? catMap.get(t.categoryId) : null;
      if (cat?.excludeFromExpenseTotal) continue;

      totalExpenses += absAmt;

      const catName = cat?.name ?? 'Uncategorized';
      const catKey = t.categoryId ?? '__uncategorized';
      const isCatDeductible = cat?.isTaxDeductible !== false;
      const deductionRate = cat?.deductionRate ? Number(cat.deductionRate) / 100 : 1;
      const isDeductible = isCatDeductible && t.isTaxDeductible;

      const deductibleAmount = isDeductible ? absAmt * deductionRate : 0;
      totalDeductibleExpenses += deductibleAmount;

      // VAT on expense
      const vatAmt = t.vatAmount ? Math.abs(Number(t.vatAmount)) : 0;
      const deductibleVat = isDeductible ? vatAmt * deductionRate : 0;
      totalVatOnExpenses += deductibleVat;

      const existing = deductibleByCategory.get(catKey) || {
        name: catName,
        total: 0,
        deductible: 0,
        vatPaid: 0,
      };
      existing.total += absAmt;
      existing.deductible += deductibleAmount;
      existing.vatPaid += deductibleVat;
      deductibleByCategory.set(catKey, existing);
    }

    const expenseBreakdown = [...deductibleByCategory.values()]
      .sort((a, b) => b.deductible - a.deductible)
      .map((e) => ({
        category: e.name,
        totalExpenses: Math.round(e.total * 100) / 100,
        deductibleAmount: Math.round(e.deductible * 100) / 100,
        vatPaid: Math.round(e.vatPaid * 100) / 100,
      }));

    // Net VAT
    const netVat = totalVatCollected - totalVatOnExpenses;

    // Taxable income
    const taxableIncome = totalRevenue - totalDeductibleExpenses;

    // Quarterly breakdown from tax periods
    const quarterlyData = taxPeriods.map((tp) => ({
      periodStart: tp.periodStart instanceof Date
        ? tp.periodStart.toISOString().slice(0, 10)
        : String(tp.periodStart).slice(0, 10),
      periodEnd: tp.periodEnd instanceof Date
        ? tp.periodEnd.toISOString().slice(0, 10)
        : String(tp.periodEnd).slice(0, 10),
      type: tp.type,
      status: tp.status,
      revenue: Number(tp.revenue),
      expenses: Number(tp.expenses),
      vatCollected: Number(tp.vatCollected),
      vatPaid: Number(tp.vatPaid),
      vatDue: Number(tp.vatDue),
      taxAdvance: Number(tp.taxAdvance),
    }));

    return {
      year,
      currency: business?.defaultCurrency ?? 'ILS',
      vatRate,
      revenue: {
        totalInvoicedRevenue: Math.round(totalInvoicedRevenue * 100) / 100,
        transactionIncome: Math.round(transactionIncome * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      },
      vat: {
        vatCollected: Math.round(totalVatCollected * 100) / 100,
        vatOnExpenses: Math.round(totalVatOnExpenses * 100) / 100,
        netVat: Math.round(netVat * 100) / 100,
      },
      expenses: {
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalDeductibleExpenses: Math.round(totalDeductibleExpenses * 100) / 100,
        breakdown: expenseBreakdown,
      },
      taxableIncome: Math.round(taxableIncome * 100) / 100,
      quarterlyData,
    };
  }

  // ─── Revenue/Expense Forecast ──────────────────────────────────────
  async getForecast(businessId: string) {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    // Historical monthly data
    const transactions = await this.prisma.transaction.findMany({
      where: {
        businessId,
        date: { gte: sixMonthsAgo, lte: now },
      },
      select: { date: true, amount: true },
    });

    // Build monthly buckets
    const monthlyData = new Map<string, { income: number; expenses: number }>();
    for (const t of transactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData.has(key)) monthlyData.set(key, { income: 0, expenses: 0 });
      const b = monthlyData.get(key)!;
      const amt = Number(t.amount);
      if (amt > 0) b.income += amt;
      else b.expenses += Math.abs(amt);
    }

    const sortedMonths = [...monthlyData.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    if (sortedMonths.length < 2) {
      // Not enough data for trend analysis
      const avgIncome = sortedMonths.length > 0
        ? sortedMonths.reduce((s, [, d]) => s + d.income, 0) / sortedMonths.length
        : 0;
      const avgExpenses = sortedMonths.length > 0
        ? sortedMonths.reduce((s, [, d]) => s + d.expenses, 0) / sortedMonths.length
        : 0;

      const forecast = [];
      for (let i = 1; i <= 6; i++) {
        const fDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthKey = `${fDate.getFullYear()}-${String(fDate.getMonth() + 1).padStart(2, '0')}`;
        forecast.push({
          month: monthKey,
          projectedIncome: Math.round(avgIncome * 100) / 100,
          projectedExpenses: Math.round(avgExpenses * 100) / 100,
          projectedProfit: Math.round((avgIncome - avgExpenses) * 100) / 100,
          confidence: 'low',
        });
      }

      return {
        historicalMonths: sortedMonths.map(([month, data]) => ({
          month,
          income: Math.round(data.income * 100) / 100,
          expenses: Math.round(data.expenses * 100) / 100,
          profit: Math.round((data.income - data.expenses) * 100) / 100,
        })),
        forecast,
        methodology: 'average',
        dataPoints: sortedMonths.length,
      };
    }

    // Linear regression for trend analysis
    const incomes = sortedMonths.map(([, d]) => d.income);
    const expenses = sortedMonths.map(([, d]) => d.expenses);

    const incomeTrend = linearRegression(incomes);
    const expenseTrend = linearRegression(expenses);

    // Pending invoices that boost projected income
    const pendingInvoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID'] },
      },
      select: {
        total: true,
        paidAmount: true,
        dueDate: true,
      },
    });

    // Active projects pipeline
    const activeProjects = await this.prisma.project.findMany({
      where: {
        businessId,
        status: 'ACTIVE',
        budgetAmount: { not: null },
      },
      select: {
        budgetAmount: true,
        startDate: true,
        endDate: true,
      },
    });

    const forecast = [];
    const n = sortedMonths.length;
    for (let i = 1; i <= 6; i++) {
      const fDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const fEnd = new Date(fDate.getFullYear(), fDate.getMonth() + 1, 0);
      const monthKey = `${fDate.getFullYear()}-${String(fDate.getMonth() + 1).padStart(2, '0')}`;

      // Projected via trend
      let projectedIncome = Math.max(0, incomeTrend.slope * (n + i - 1) + incomeTrend.intercept);
      const projectedExpenses = Math.max(0, expenseTrend.slope * (n + i - 1) + expenseTrend.intercept);

      // Add income from pending invoices due in this month
      const invoiceBoost = pendingInvoices
        .filter((inv) => {
          if (!inv.dueDate) return false;
          const dd = new Date(inv.dueDate);
          return dd >= fDate && dd <= fEnd;
        })
        .reduce(
          (sum, inv) => sum + Number(inv.total) - Number(inv.paidAmount ?? 0),
          0,
        );
      projectedIncome += invoiceBoost;

      // Confidence based on data points and distance
      const confidence = n >= 5 ? (i <= 3 ? 'high' : 'medium') : (i <= 2 ? 'medium' : 'low');

      forecast.push({
        month: monthKey,
        projectedIncome: Math.round(projectedIncome * 100) / 100,
        projectedExpenses: Math.round(projectedExpenses * 100) / 100,
        projectedProfit: Math.round((projectedIncome - projectedExpenses) * 100) / 100,
        invoiceBoost: Math.round(invoiceBoost * 100) / 100,
        confidence,
      });
    }

    return {
      historicalMonths: sortedMonths.map(([month, data]) => ({
        month,
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        profit: Math.round((data.income - data.expenses) * 100) / 100,
      })),
      forecast,
      trends: {
        incomeSlope: Math.round(incomeTrend.slope * 100) / 100,
        expenseSlope: Math.round(expenseTrend.slope * 100) / 100,
        incomeDirection: incomeTrend.slope > 50 ? 'growing' : incomeTrend.slope < -50 ? 'declining' : 'stable',
        expenseDirection: expenseTrend.slope > 50 ? 'growing' : expenseTrend.slope < -50 ? 'declining' : 'stable',
      },
      methodology: 'linear_regression',
      dataPoints: n,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────
  private async getMonthlyBreakdown(
    businessId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        businessId,
        date: { gte: fromDate, lte: toDate },
      },
      select: { date: true, amount: true },
    });

    const buckets = new Map<string, { income: number; expenses: number }>();
    for (const t of transactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets.has(key)) buckets.set(key, { income: 0, expenses: 0 });
      const b = buckets.get(key)!;
      const amt = Number(t.amount);
      if (amt > 0) b.income += amt;
      else b.expenses += Math.abs(amt);
    }

    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month,
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        profit: Math.round((data.income - data.expenses) * 100) / 100,
      }));
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────
function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}
