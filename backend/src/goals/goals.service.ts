import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new financial goal for the business.
   * Automatically calculates monthlyTarget if targetDate is provided.
   */
  async create(
    businessId: string,
    dto: {
      name: string;
      targetAmount: number;
      currentAmount?: number;
      targetDate?: string;
      icon?: string;
      color?: string;
      priority?: number;
      monthlyTarget?: number;
      currency?: string;
      notes?: string;
    },
  ) {
    const monthlyTarget =
      dto.monthlyTarget ?? this.calcMonthlyTarget(dto.targetAmount, dto.currentAmount ?? 0, dto.targetDate);

    return this.prisma.goal.create({
      data: {
        businessId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        currentAmount: dto.currentAmount ?? 0,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        priority: dto.priority ?? 0,
        monthlyTarget,
        currency: dto.currency ?? 'ILS',
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * List all active goals with computed progress metrics.
   */
  async findAll(businessId: string) {
    const goals = await this.prisma.goal.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return goals.map((g) => ({
      ...g,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
      monthlyTarget: g.monthlyTarget != null ? Number(g.monthlyTarget) : null,
      progress:
        Number(g.targetAmount) > 0
          ? Math.min(100, Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100))
          : 0,
      remainingAmount: Math.max(0, Number(g.targetAmount) - Number(g.currentAmount)),
      monthsRemaining: g.targetDate
        ? Math.max(0, this.monthsBetween(new Date(), new Date(g.targetDate)))
        : null,
    }));
  }

  /**
   * Get a specific goal by ID, scoped to the business.
   */
  async findOne(businessId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, businessId },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  /**
   * Update a goal.
   */
  async update(
    businessId: string,
    id: string,
    dto: {
      name?: string;
      targetAmount?: number;
      currentAmount?: number;
      targetDate?: string;
      icon?: string;
      color?: string;
      priority?: number;
      monthlyTarget?: number;
      currency?: string;
      notes?: string;
      isActive?: boolean;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.targetAmount !== undefined) data.targetAmount = dto.targetAmount;
    if (dto.currentAmount !== undefined) data.currentAmount = dto.currentAmount;
    if (dto.targetDate !== undefined) data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.monthlyTarget !== undefined) data.monthlyTarget = dto.monthlyTarget;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const result = await this.prisma.goal.updateMany({
      where: { id, businessId },
      data,
    });
    if (result.count === 0) throw new NotFoundException('Goal not found');
    return this.findOne(businessId, id);
  }

  /**
   * Soft-delete a goal.
   */
  async remove(businessId: string, id: string) {
    const result = await this.prisma.goal.updateMany({
      where: { id, businessId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundException('Goal not found');
    return { deleted: true };
  }

  /**
   * Update the AI tips for a goal.
   */
  async updateAiTips(businessId: string, id: string, tips: string) {
    return this.prisma.goal.updateMany({
      where: { id, businessId },
      data: { aiTips: tips, aiTipsUpdatedAt: new Date() },
    });
  }

  // ─── Private helpers ───

  private calcMonthlyTarget(target: number, current: number, targetDate?: string): number | null {
    if (!targetDate) return null;
    const remaining = Math.max(0, target - current);
    const months = this.monthsBetween(new Date(), new Date(targetDate));
    return months > 0 ? Math.ceil(remaining / months) : remaining;
  }

  private monthsBetween(a: Date, b: Date): number {
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  }
}
