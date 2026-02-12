import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns all active budgets with category info and current month's spending.
   * For each budget, calculates `spent` by summing negative transactions
   * in that category for the current month.
   */
  async list(householdId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const budgets = await this.prisma.budget.findMany({
      where: { householdId, isActive: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true, color: true, icon: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const categoryIds = budgets.map((b) => b.categoryId);

    // Aggregate spending (negative amounts) per category for the current month
    const spending = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        householdId,
        categoryId: { in: categoryIds },
        amount: { lt: 0 },
        date: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amount: true },
    });

    const spendingMap = new Map(
      spending.map((s) => [s.categoryId, Math.abs(Number(s._sum.amount ?? 0))]),
    );

    return budgets.map((b) => {
      const amount = Number(b.amount);
      const spent = spendingMap.get(b.categoryId) ?? 0;
      const remaining = amount - spent;
      const percentUsed = amount > 0 ? Math.round((spent / amount) * 100) : 0;

      return {
        id: b.id,
        categoryId: b.categoryId,
        category: b.category,
        amount,
        spent,
        remaining,
        percentUsed,
        isOver: spent > amount,
      };
    });
  }

  /**
   * Create or update a budget for a category.
   * Uses Prisma upsert with unique constraint on [householdId, categoryId].
   */
  async upsert(householdId: string, dto: { categoryId: string; amount: number }) {
    return this.prisma.budget.upsert({
      where: {
        householdId_categoryId: {
          householdId,
          categoryId: dto.categoryId,
        },
      },
      create: {
        householdId,
        categoryId: dto.categoryId,
        amount: dto.amount,
        isActive: true,
      },
      update: {
        amount: dto.amount,
        isActive: true,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true, color: true, icon: true },
        },
      },
    });
  }

  /**
   * Soft delete a budget by setting isActive = false.
   */
  async remove(householdId: string, id: string) {
    return this.prisma.budget.updateMany({
      where: { id, householdId },
      data: { isActive: false },
    });
  }

  /**
   * Get budget summary for a specific month (YYYY-MM format).
   * Returns total budgeted, total spent, remaining, and categories over budget.
   */
  async getSummary(householdId: string, month?: string) {
    const now = new Date();
    let year = now.getFullYear();
    let monthIndex = now.getMonth();

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      year = y;
      monthIndex = m - 1;
    }

    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 1);

    const budgets = await this.prisma.budget.findMany({
      where: { householdId, isActive: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true, color: true, icon: true },
        },
      },
    });

    const categoryIds = budgets.map((b) => b.categoryId);

    const spending = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        householdId,
        categoryId: { in: categoryIds },
        amount: { lt: 0 },
        date: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amount: true },
    });

    const spendingMap = new Map(
      spending.map((s) => [s.categoryId, Math.abs(Number(s._sum.amount ?? 0))]),
    );

    let totalBudgeted = 0;
    let totalSpent = 0;
    const overBudget: Array<{
      categoryId: string;
      category: { id: string; name: string; slug: string; color: string | null; icon: string | null };
      amount: number;
      spent: number;
      overBy: number;
    }> = [];

    for (const b of budgets) {
      const amount = Number(b.amount);
      const spent = spendingMap.get(b.categoryId) ?? 0;
      totalBudgeted += amount;
      totalSpent += spent;

      if (spent > amount) {
        overBudget.push({
          categoryId: b.categoryId,
          category: b.category,
          amount,
          spent,
          overBy: spent - amount,
        });
      }
    }

    return {
      month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      totalBudgeted,
      totalSpent,
      remaining: totalBudgeted - totalSpent,
      percentUsed: totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0,
      budgetCount: budgets.length,
      overBudgetCount: overBudget.length,
      overBudget,
    };
  }
}
