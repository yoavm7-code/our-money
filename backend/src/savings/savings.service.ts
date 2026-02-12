import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SavingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new savings goal for the business.
   */
  async create(
    businessId: string,
    dto: {
      name: string;
      targetAmount?: number;
      currentAmount?: number;
      interestRate?: number;
      startDate?: string;
      targetDate?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.prisma.saving.create({
      data: {
        businessId,
        name: dto.name,
        targetAmount: dto.targetAmount ?? null,
        currentAmount: dto.currentAmount ?? 0,
        interestRate: dto.interestRate ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        currency: dto.currency ?? 'ILS',
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * List all active savings goals with progress info.
   */
  async findAll(businessId: string) {
    const savings = await this.prisma.saving.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
    });

    return savings.map((s) => {
      const targetAmount = s.targetAmount != null ? Number(s.targetAmount) : null;
      const currentAmount = Number(s.currentAmount);
      const progress =
        targetAmount && targetAmount > 0
          ? Math.min(100, Math.round((currentAmount / targetAmount) * 100))
          : 0;
      const remaining = targetAmount ? Math.max(0, targetAmount - currentAmount) : null;

      return {
        ...s,
        targetAmount,
        currentAmount,
        interestRate: s.interestRate != null ? Number(s.interestRate) : null,
        progress,
        remaining,
      };
    });
  }

  /**
   * Get a specific savings goal by ID.
   */
  async findOne(businessId: string, id: string) {
    const saving = await this.prisma.saving.findFirst({
      where: { id, businessId },
    });
    if (!saving) throw new NotFoundException('Savings goal not found');
    return saving;
  }

  /**
   * Update a savings goal.
   */
  async update(
    businessId: string,
    id: string,
    dto: {
      name?: string;
      targetAmount?: number;
      currentAmount?: number;
      interestRate?: number;
      startDate?: string;
      targetDate?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.targetAmount !== undefined) data.targetAmount = dto.targetAmount;
    if (dto.currentAmount !== undefined) data.currentAmount = dto.currentAmount;
    if (dto.interestRate !== undefined) data.interestRate = dto.interestRate;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.targetDate !== undefined) data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const result = await this.prisma.saving.updateMany({
      where: { id, businessId },
      data,
    });
    if (result.count === 0) throw new NotFoundException('Savings goal not found');
    return this.findOne(businessId, id);
  }

  /**
   * Soft-delete a savings goal.
   */
  async remove(businessId: string, id: string) {
    const result = await this.prisma.saving.updateMany({
      where: { id, businessId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundException('Savings goal not found');
    return { deleted: true };
  }
}
