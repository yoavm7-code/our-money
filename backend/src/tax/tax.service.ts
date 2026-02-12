import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaxType, TaxPeriodStatus } from '@prisma/client';

@Injectable()
export class TaxService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // List tax periods
  // ---------------------------------------------------------------------------

  async findAllPeriods(
    businessId: string,
    filters?: { year?: number; type?: string },
  ) {
    const where: Record<string, unknown> = { businessId };

    if (filters?.type) {
      where.type = filters.type as TaxType;
    }

    if (filters?.year) {
      where.periodStart = {
        gte: new Date(`${filters.year}-01-01`),
        lte: new Date(`${filters.year}-12-31`),
      };
    }

    return this.prisma.taxPeriod.findMany({
      where,
      orderBy: { periodStart: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Create tax period
  // ---------------------------------------------------------------------------

  async createPeriod(
    businessId: string,
    dto: {
      type: string;
      periodStart: string;
      periodEnd: string;
      notes?: string;
    },
  ) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    if (periodEnd <= periodStart) {
      throw new BadRequestException(
        'Period end must be after period start',
      );
    }

    // Check for overlapping periods of the same type
    const overlap = await this.prisma.taxPeriod.findFirst({
      where: {
        businessId,
        type: dto.type as TaxType,
        OR: [
          {
            periodStart: { lte: periodEnd },
            periodEnd: { gte: periodStart },
          },
        ],
      },
    });

    if (overlap) {
      throw new BadRequestException(
        'A tax period of this type already exists for the overlapping date range',
      );
    }

    return this.prisma.taxPeriod.create({
      data: {
        businessId,
        type: dto.type as TaxType,
        periodStart,
        periodEnd,
        notes: dto.notes ?? null,
        status: 'OPEN',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Update tax period
  // ---------------------------------------------------------------------------

  async updatePeriod(
    businessId: string,
    id: string,
    dto: {
      notes?: string;
      taxAdvance?: number;
    },
  ) {
    const existing = await this.prisma.taxPeriod.findFirst({
      where: { id, businessId },
    });

    if (!existing) {
      throw new NotFoundException('Tax period not found');
    }

    if (existing.status === 'FILED' || existing.status === 'PAID') {
      throw new BadRequestException(
        'Cannot update a filed or paid tax period',
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.taxAdvance !== undefined) data.taxAdvance = dto.taxAdvance;

    return this.prisma.taxPeriod.update({
      where: { id },
      data,
    });
  }

  // ---------------------------------------------------------------------------
  // Calculate tax period from transactions and invoices
  // ---------------------------------------------------------------------------

  async calculatePeriod(businessId: string, id: string) {
    const period = await this.prisma.taxPeriod.findFirst({
      where: { id, businessId },
    });

    if (!period) {
      throw new NotFoundException('Tax period not found');
    }

    if (period.status === 'FILED' || period.status === 'PAID') {
      throw new BadRequestException(
        'Cannot recalculate a filed or paid tax period',
      );
    }

    const periodStart = new Date(period.periodStart);
    const periodEnd = new Date(period.periodEnd);

    // --- Calculate VAT collected from invoices issued in this period ---
    const invoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        issueDate: { gte: periodStart, lte: periodEnd },
        status: { in: ['SENT', 'PAID', 'PARTIALLY_PAID'] },
      },
      select: {
        subtotal: true,
        vatAmount: true,
        total: true,
      },
    });

    const vatCollected = invoices.reduce(
      (sum, inv) => sum + Number(inv.vatAmount),
      0,
    );
    const revenue = invoices.reduce(
      (sum, inv) => sum + Number(inv.subtotal),
      0,
    );

    // --- Calculate VAT paid on expenses in this period ---
    // Expense transactions are negative amounts with VAT
    const expenseTransactions = await this.prisma.transaction.findMany({
      where: {
        businessId,
        date: { gte: periodStart, lte: periodEnd },
        amount: { lt: 0 },
        isTaxDeductible: true,
      },
      select: {
        amount: true,
        vatAmount: true,
        isVatIncluded: true,
      },
    });

    let vatPaid = 0;
    let expenses = 0;

    for (const tx of expenseTransactions) {
      const amount = Math.abs(Number(tx.amount));
      expenses += amount;

      if (tx.vatAmount != null) {
        // Explicit VAT amount recorded
        vatPaid += Math.abs(Number(tx.vatAmount));
      } else if (tx.isVatIncluded) {
        // Extract VAT from amount (assuming business VAT rate)
        const business = await this.prisma.business.findUnique({
          where: { id: businessId },
          select: { vatRate: true },
        });
        const rate = business ? Number(business.vatRate) : 17;
        // If amount includes VAT: vatComponent = amount * rate / (100 + rate)
        const vatComponent = (amount * rate) / (100 + rate);
        vatPaid += Math.round(vatComponent * 100) / 100;
      }
    }

    // Also add income transactions to revenue calculation
    const incomeTransactions = await this.prisma.transaction.aggregate({
      where: {
        businessId,
        date: { gte: periodStart, lte: periodEnd },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    // Use the higher of invoice revenue or transaction income
    const transactionIncome = Number(incomeTransactions._sum.amount ?? 0);
    const effectiveRevenue = Math.max(revenue, transactionIncome);

    const vatDue = Math.round((vatCollected - vatPaid) * 100) / 100;

    // Calculate income tax advance (simplified: based on profit)
    // Israeli freelancers typically pay advances based on revenue
    const profit = effectiveRevenue - expenses;
    // Default advance rate: approximately 4-5% of revenue for small businesses
    const taxAdvanceRate = 0.04;
    const taxAdvance =
      Number(period.taxAdvance) > 0
        ? Number(period.taxAdvance)
        : Math.round(effectiveRevenue * taxAdvanceRate * 100) / 100;

    await this.prisma.taxPeriod.update({
      where: { id },
      data: {
        revenue: Math.round(effectiveRevenue * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        vatCollected: Math.round(vatCollected * 100) / 100,
        vatPaid: Math.round(vatPaid * 100) / 100,
        vatDue,
        taxAdvance,
        status: 'CALCULATED',
      },
    });

    return this.prisma.taxPeriod.findUnique({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Mark period as filed
  // ---------------------------------------------------------------------------

  async markAsFiled(
    businessId: string,
    id: string,
    dto: { filedDate?: string },
  ) {
    const period = await this.prisma.taxPeriod.findFirst({
      where: { id, businessId },
    });

    if (!period) {
      throw new NotFoundException('Tax period not found');
    }

    if (period.status === 'OPEN') {
      throw new BadRequestException(
        'Tax period must be calculated before filing',
      );
    }

    if (period.status === 'FILED' || period.status === 'PAID') {
      throw new BadRequestException('Tax period is already filed');
    }

    return this.prisma.taxPeriod.update({
      where: { id },
      data: {
        status: 'FILED',
        filedDate: dto.filedDate ? new Date(dto.filedDate) : new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Yearly tax summary
  // ---------------------------------------------------------------------------

  async getYearlySummary(businessId: string, year: number) {
    const yearStart = new Date(`${year}-01-01`);
    const yearEnd = new Date(`${year}-12-31`);

    // Get all tax periods for the year
    const periods = await this.prisma.taxPeriod.findMany({
      where: {
        businessId,
        periodStart: { gte: yearStart },
        periodEnd: { lte: yearEnd },
      },
      orderBy: { periodStart: 'asc' },
    });

    // Calculate totals from paid invoices in the year
    const paidInvoices = await this.prisma.invoice.aggregate({
      where: {
        businessId,
        status: 'PAID',
        issueDate: { gte: yearStart, lte: yearEnd },
      },
      _sum: {
        subtotal: true,
        vatAmount: true,
        total: true,
        paidAmount: true,
      },
      _count: true,
    });

    // All invoices issued
    const allInvoices = await this.prisma.invoice.aggregate({
      where: {
        businessId,
        issueDate: { gte: yearStart, lte: yearEnd },
        status: { not: 'CANCELLED' },
      },
      _sum: {
        subtotal: true,
        vatAmount: true,
        total: true,
      },
      _count: true,
    });

    // Expense transactions for the year
    const expensesAgg = await this.prisma.transaction.aggregate({
      where: {
        businessId,
        date: { gte: yearStart, lte: yearEnd },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    });

    // Income transactions for the year
    const incomeAgg = await this.prisma.transaction.aggregate({
      where: {
        businessId,
        date: { gte: yearStart, lte: yearEnd },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    // Tax deductible expenses
    const deductibleExpenses = await this.prisma.transaction.aggregate({
      where: {
        businessId,
        date: { gte: yearStart, lte: yearEnd },
        amount: { lt: 0 },
        isTaxDeductible: true,
      },
      _sum: { amount: true },
    });

    // Sum up from tax periods
    const totalVatCollected = periods.reduce(
      (s, p) => s + Number(p.vatCollected),
      0,
    );
    const totalVatPaid = periods.reduce(
      (s, p) => s + Number(p.vatPaid),
      0,
    );
    const totalVatDue = periods.reduce(
      (s, p) => s + Number(p.vatDue),
      0,
    );
    const totalTaxAdvances = periods.reduce(
      (s, p) => s + Number(p.taxAdvance),
      0,
    );

    const totalRevenue = Number(paidInvoices._sum.subtotal ?? 0);
    const transactionIncome = Number(incomeAgg._sum.amount ?? 0);
    const totalExpenses = Math.abs(Number(expensesAgg._sum.amount ?? 0));
    const totalDeductible = Math.abs(
      Number(deductibleExpenses._sum.amount ?? 0),
    );

    const effectiveRevenue = Math.max(totalRevenue, transactionIncome);
    const profit = effectiveRevenue - totalDeductible;

    // Estimated annual income tax (simplified Israeli bracket approximation)
    const estimatedIncomeTax = this.estimateIsraeliIncomeTax(profit);

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      year,
      periods,
      invoices: {
        totalIssued: allInvoices._count,
        totalPaid: paidInvoices._count,
        invoicedAmount: round2(Number(allInvoices._sum.subtotal ?? 0)),
        paidAmount: round2(Number(paidInvoices._sum.paidAmount ?? 0)),
      },
      revenue: round2(effectiveRevenue),
      transactionIncome: round2(transactionIncome),
      invoiceRevenue: round2(totalRevenue),
      expenses: round2(totalExpenses),
      deductibleExpenses: round2(totalDeductible),
      profit: round2(profit),
      vat: {
        collected: round2(totalVatCollected),
        paid: round2(totalVatPaid),
        netDue: round2(totalVatDue),
      },
      incomeTax: {
        advances: round2(totalTaxAdvances),
        estimatedAnnual: round2(estimatedIncomeTax),
        estimatedRemaining: round2(
          Math.max(0, estimatedIncomeTax - totalTaxAdvances),
        ),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // VAT report for a specific period
  // ---------------------------------------------------------------------------

  async getVatReport(businessId: string, from: string, to: string) {
    if (!from || !to) {
      throw new BadRequestException(
        'Both "from" and "to" query parameters are required',
      );
    }

    const periodStart = new Date(from);
    const periodEnd = new Date(to);

    // Get business VAT rate
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { vatRate: true, name: true, businessNumber: true },
    });

    const vatRate = business ? Number(business.vatRate) : 17;

    // --- Output VAT (collected) from invoices ---
    const invoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        issueDate: { gte: periodStart, lte: periodEnd },
        status: { in: ['SENT', 'PAID', 'PARTIALLY_PAID'] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        subtotal: true,
        vatAmount: true,
        total: true,
        status: true,
        client: {
          select: { name: true, taxId: true },
        },
      },
      orderBy: { issueDate: 'asc' },
    });

    const outputVat = invoices.reduce(
      (sum, inv) => sum + Number(inv.vatAmount),
      0,
    );
    const outputBase = invoices.reduce(
      (sum, inv) => sum + Number(inv.subtotal),
      0,
    );

    // --- Input VAT (paid) from expense transactions ---
    const expenses = await this.prisma.transaction.findMany({
      where: {
        businessId,
        date: { gte: periodStart, lte: periodEnd },
        amount: { lt: 0 },
        isTaxDeductible: true,
      },
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        vatAmount: true,
        isVatIncluded: true,
        category: {
          select: { name: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    let inputVat = 0;
    let inputBase = 0;

    const expenseDetails = expenses.map((tx) => {
      const amount = Math.abs(Number(tx.amount));
      let txVat = 0;
      let txBase = 0;

      if (tx.vatAmount != null) {
        txVat = Math.abs(Number(tx.vatAmount));
        txBase = amount - txVat;
      } else if (tx.isVatIncluded) {
        txVat = Math.round((amount * vatRate) / (100 + vatRate) * 100) / 100;
        txBase = amount - txVat;
      } else {
        txBase = amount;
        txVat = 0;
      }

      inputVat += txVat;
      inputBase += txBase;

      return {
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: Number(tx.amount),
        vatAmount: txVat,
        baseAmount: txBase,
        category: tx.category?.name ?? null,
      };
    });

    const netVatDue = Math.round((outputVat - inputVat) * 100) / 100;
    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      period: { from, to },
      business: {
        name: business?.name ?? null,
        businessNumber: business?.businessNumber ?? null,
        vatRate,
      },
      output: {
        invoices: invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          clientName: inv.client?.name ?? null,
          clientTaxId: inv.client?.taxId ?? null,
          subtotal: Number(inv.subtotal),
          vatAmount: Number(inv.vatAmount),
          total: Number(inv.total),
          status: inv.status,
        })),
        totalBase: round2(outputBase),
        totalVat: round2(outputVat),
      },
      input: {
        expenses: expenseDetails,
        totalBase: round2(inputBase),
        totalVat: round2(inputVat),
      },
      netVatDue: round2(netVatDue),
    };
  }

  // ---------------------------------------------------------------------------
  // Israeli income tax estimation (simplified 2024 brackets)
  // ---------------------------------------------------------------------------

  private estimateIsraeliIncomeTax(annualProfit: number): number {
    if (annualProfit <= 0) return 0;

    // Simplified Israeli income tax brackets (annual, approximate)
    const brackets = [
      { limit: 84120, rate: 0.1 },
      { limit: 120720, rate: 0.14 },
      { limit: 193800, rate: 0.2 },
      { limit: 269280, rate: 0.31 },
      { limit: 560280, rate: 0.35 },
      { limit: 721560, rate: 0.47 },
      { limit: Infinity, rate: 0.5 },
    ];

    let tax = 0;
    let remaining = annualProfit;
    let prevLimit = 0;

    for (const bracket of brackets) {
      const taxableInBracket = Math.min(
        remaining,
        bracket.limit - prevLimit,
      );
      if (taxableInBracket <= 0) break;

      tax += taxableInBracket * bracket.rate;
      remaining -= taxableInBracket;
      prevLimit = bracket.limit;
    }

    return Math.round(tax * 100) / 100;
  }
}
