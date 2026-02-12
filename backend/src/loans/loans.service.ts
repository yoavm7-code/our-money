import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new loan for the business.
   */
  async create(
    businessId: string,
    dto: {
      name: string;
      lender?: string;
      originalAmount: number;
      remainingAmount: number;
      interestRate?: number;
      monthlyPayment?: number;
      startDate?: string;
      endDate?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.prisma.loan.create({
      data: {
        businessId,
        name: dto.name,
        lender: dto.lender ?? null,
        originalAmount: dto.originalAmount,
        remainingAmount: dto.remainingAmount,
        interestRate: dto.interestRate ?? null,
        monthlyPayment: dto.monthlyPayment ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        currency: dto.currency ?? 'ILS',
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * List all active loans for the business.
   */
  async findAll(businessId: string) {
    const loans = await this.prisma.loan.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
    });

    return loans.map((loan) => ({
      ...loan,
      originalAmount: Number(loan.originalAmount),
      remainingAmount: Number(loan.remainingAmount),
      interestRate: loan.interestRate != null ? Number(loan.interestRate) : null,
      monthlyPayment: loan.monthlyPayment != null ? Number(loan.monthlyPayment) : null,
      paidAmount: Number(loan.originalAmount) - Number(loan.remainingAmount),
      paidPercent:
        Number(loan.originalAmount) > 0
          ? Math.round(
              ((Number(loan.originalAmount) - Number(loan.remainingAmount)) /
                Number(loan.originalAmount)) *
                100,
            )
          : 0,
    }));
  }

  /**
   * Get a specific loan by ID, scoped to the business.
   */
  async findOne(businessId: string, id: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id, businessId },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    return loan;
  }

  /**
   * Update a loan, scoped to the business.
   */
  async update(
    businessId: string,
    id: string,
    dto: {
      name?: string;
      lender?: string;
      originalAmount?: number;
      remainingAmount?: number;
      interestRate?: number;
      monthlyPayment?: number;
      startDate?: string;
      endDate?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.lender !== undefined) data.lender = dto.lender;
    if (dto.originalAmount !== undefined) data.originalAmount = dto.originalAmount;
    if (dto.remainingAmount !== undefined) data.remainingAmount = dto.remainingAmount;
    if (dto.interestRate !== undefined) data.interestRate = dto.interestRate;
    if (dto.monthlyPayment !== undefined) data.monthlyPayment = dto.monthlyPayment;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const result = await this.prisma.loan.updateMany({
      where: { id, businessId },
      data,
    });

    if (result.count === 0) throw new NotFoundException('Loan not found');
    return this.findOne(businessId, id);
  }

  /**
   * Soft-delete a loan (set isActive = false).
   */
  async remove(businessId: string, id: string) {
    const result = await this.prisma.loan.updateMany({
      where: { id, businessId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundException('Loan not found');
    return { deleted: true };
  }
}
