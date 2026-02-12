import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  async create(householdId: string, dto: CreateGoalDto) {
    const monthlyTarget = dto.monthlyTarget ?? this.calcMonthlyTarget(dto.targetAmount, dto.currentAmount ?? 0, dto.targetDate);
    return this.prisma.goal.create({
      data: {
        householdId,
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

  async findAll(householdId: string) {
    const goals = await this.prisma.goal.findMany({
      where: { householdId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return goals.map((g) => ({
      ...g,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
      monthlyTarget: g.monthlyTarget != null ? Number(g.monthlyTarget) : null,
      progress: Number(g.targetAmount) > 0 ? Math.min(100, Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100)) : 0,
      remainingAmount: Math.max(0, Number(g.targetAmount) - Number(g.currentAmount)),
      monthsRemaining: g.targetDate ? Math.max(0, this.monthsBetween(new Date(), new Date(g.targetDate))) : null,
    }));
  }

  async findOne(householdId: string, id: string) {
    return this.prisma.goal.findFirst({
      where: { id, householdId },
    });
  }

  async update(householdId: string, id: string, dto: UpdateGoalDto) {
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
    return this.prisma.goal.updateMany({
      where: { id, householdId },
      data,
    });
  }

  async remove(householdId: string, id: string) {
    return this.prisma.goal.updateMany({
      where: { id, householdId },
      data: { isActive: false },
    });
  }

  async updateAiTips(householdId: string, id: string, tips: string) {
    return this.prisma.goal.updateMany({
      where: { id, householdId },
      data: { aiTips: tips, aiTipsUpdatedAt: new Date() },
    });
  }

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
