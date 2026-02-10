import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Alert = {
  id: string;
  type: 'budget_exceeded' | 'low_balance' | 'goal_deadline' | 'unusual_expense' | 'recurring_missed';
  severity: 'warning' | 'info' | 'critical';
  title: string;
  description: string;
  data: Record<string, unknown>;
  createdAt: string;
};

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async generate(householdId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const now = new Date();

    await Promise.all([
      this.checkBudgetAlerts(householdId, now, alerts),
      this.checkLowBalanceAlerts(householdId, alerts),
      this.checkGoalDeadlineAlerts(householdId, now, alerts),
      this.checkUnusualExpenses(householdId, now, alerts),
      this.checkMissedRecurring(householdId, now, alerts),
    ]);

    // Sort by severity (critical first)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alerts;
  }

  private async checkBudgetAlerts(householdId: string, now: Date, alerts: Alert[]) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const budgetsData = await this.prisma.budget.findMany({
      where: { householdId },
      include: { category: true },
    });

    for (const budget of budgetsData) {
      const spent = await this.prisma.transaction.aggregate({
        where: {
          householdId,
          categoryId: budget.categoryId,
          date: { gte: startOfMonth, lte: endOfMonth },
          amount: { lt: 0 },
        },
        _sum: { amount: true },
      });

      const totalSpent = Math.abs(Number(spent._sum.amount) || 0);
      const budgetAmount = Number(budget.amount);

      if (totalSpent > budgetAmount) {
        alerts.push({
          id: `budget-${budget.id}`,
          type: 'budget_exceeded',
          severity: totalSpent > budgetAmount * 1.2 ? 'critical' : 'warning',
          title: 'budget_exceeded',
          description: 'budget_exceeded_desc',
          data: {
            category: budget.category.name,
            spent: Math.round(totalSpent),
            budget: budgetAmount,
            percent: Math.round((totalSpent / budgetAmount) * 100),
          },
          createdAt: now.toISOString(),
        });
      }
    }
  }

  private async checkLowBalanceAlerts(householdId: string, alerts: Alert[]) {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, isActive: true, type: { in: ['BANK', 'CASH'] } },
    });

    for (const account of accounts) {
      const balance = Number(account.balance);
      if (balance < 500 && balance >= 0) {
        alerts.push({
          id: `balance-${account.id}`,
          type: 'low_balance',
          severity: balance < 100 ? 'critical' : 'warning',
          title: 'low_balance',
          description: 'low_balance_desc',
          data: {
            account: account.name,
            balance: Math.round(balance),
          },
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  private async checkGoalDeadlineAlerts(householdId: string, now: Date, alerts: Alert[]) {
    const goals = await this.prisma.goal.findMany({
      where: { householdId, isActive: true, targetDate: { not: null } },
    });

    for (const goal of goals) {
      if (!goal.targetDate) continue;
      const targetDate = new Date(goal.targetDate);
      const daysLeft = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const progress = Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100);

      if (daysLeft > 0 && daysLeft <= 30 && progress < 90) {
        alerts.push({
          id: `goal-${goal.id}`,
          type: 'goal_deadline',
          severity: daysLeft <= 7 ? 'critical' : 'warning',
          title: 'goal_deadline',
          description: 'goal_deadline_desc',
          data: {
            goal: goal.name,
            days: daysLeft,
            progress,
          },
          createdAt: now.toISOString(),
        });
      }
    }
  }

  private async checkUnusualExpenses(householdId: string, now: Date, alerts: Alert[]) {
    // Look at last 7 days for unusually large transactions
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

    // Get average monthly spending
    const avgResult = await this.prisma.transaction.aggregate({
      where: {
        householdId,
        date: { gte: threeMonthsAgo, lt: sevenDaysAgo },
        amount: { lt: 0 },
      },
      _avg: { amount: true },
      _count: true,
    });

    const avgExpense = Math.abs(Number(avgResult._avg.amount) || 0);
    if (avgExpense === 0) return;

    // Find recent transactions that are 3x the average
    const recentLarge = await this.prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: sevenDaysAgo },
        amount: { lt: 0 },
      },
      orderBy: { amount: 'asc' },
      take: 5,
    });

    for (const tx of recentLarge) {
      const txAmount = Math.abs(Number(tx.amount));
      if (txAmount > avgExpense * 3 && txAmount > 200) {
        alerts.push({
          id: `unusual-${tx.id}`,
          type: 'unusual_expense',
          severity: 'info',
          title: 'unusual_expense',
          description: 'unusual_expense_desc',
          data: {
            amount: Math.round(txAmount),
            description: tx.description,
            average: Math.round(avgExpense),
          },
          createdAt: now.toISOString(),
        });
      }
    }
  }

  private async checkMissedRecurring(householdId: string, now: Date, alerts: Alert[]) {
    const confirmedPatterns = await this.prisma.recurringPattern.findMany({
      where: { householdId, isConfirmed: true, isDismissed: false, frequency: 'monthly' },
    });

    for (const pattern of confirmedPatterns) {
      const lastSeen = new Date(pattern.lastSeenDate);
      const daysSinceLast = Math.ceil((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));

      // If it's been more than 40 days since last seen, it may be missed
      if (daysSinceLast > 40) {
        alerts.push({
          id: `recurring-${pattern.id}`,
          type: 'recurring_missed',
          severity: 'info',
          title: 'recurring_missed',
          description: 'recurring_missed_desc',
          data: {
            description: pattern.description,
            daysSince: daysSinceLast,
          },
          createdAt: now.toISOString(),
        });
      }
    }
  }
}
