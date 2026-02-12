import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Alert = {
  id: string;
  type:
    | 'budget_exceeded'
    | 'low_balance'
    | 'goal_deadline'
    | 'unusual_expense'
    | 'recurring_missed'
    | 'invoice_overdue'
    | 'large_unpaid_invoices';
  severity: 'warning' | 'info' | 'critical';
  title: string;
  description: string;
  data: Record<string, unknown>;
  createdAt: string;
};

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate all alerts for a business by checking various conditions in parallel.
   * Returns alerts sorted by severity (critical first).
   */
  async generate(businessId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const now = new Date();

    await Promise.all([
      this.checkBudgetAlerts(businessId, now, alerts),
      this.checkLowBalanceAlerts(businessId, alerts),
      this.checkGoalDeadlineAlerts(businessId, now, alerts),
      this.checkUnusualExpenses(businessId, now, alerts),
      this.checkMissedRecurring(businessId, now, alerts),
      this.checkOverdueInvoices(businessId, now, alerts),
      this.checkLargeUnpaidInvoices(businessId, alerts),
    ]);

    // Sort by severity (critical first)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alerts;
  }

  // ─── Budget Exceeded Alerts ───

  private async checkBudgetAlerts(businessId: string, now: Date, alerts: Alert[]) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const budgets = await this.prisma.budget.findMany({
      where: { businessId, isActive: true },
      include: { category: true },
    });

    for (const budget of budgets) {
      const spent = await this.prisma.transaction.aggregate({
        where: {
          businessId,
          categoryId: budget.categoryId,
          date: { gte: startOfMonth, lte: endOfMonth },
          amount: { lt: 0 },
        },
        _sum: { amount: true },
      });

      const totalSpent = Math.abs(Number(spent._sum.amount) || 0);
      const budgetAmount = Number(budget.amount);

      if (totalSpent > budgetAmount) {
        const percent = Math.round((totalSpent / budgetAmount) * 100);
        alerts.push({
          id: `budget-${budget.id}`,
          type: 'budget_exceeded',
          severity: totalSpent > budgetAmount * 1.2 ? 'critical' : 'warning',
          title: 'budget_exceeded',
          description: 'budget_exceeded_desc',
          data: {
            category: budget.category.name,
            categoryId: budget.categoryId,
            spent: Math.round(totalSpent),
            budget: budgetAmount,
            percent,
            overBy: Math.round(totalSpent - budgetAmount),
          },
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // ─── Low Balance Alerts ───

  private async checkLowBalanceAlerts(businessId: string, alerts: Alert[]) {
    const accounts = await this.prisma.account.findMany({
      where: { businessId, isActive: true, type: { in: ['BANK', 'CASH'] } },
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
            accountId: account.id,
            balance: Math.round(balance),
            currency: account.currency,
          },
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // ─── Goal Deadline Alerts ───

  private async checkGoalDeadlineAlerts(businessId: string, now: Date, alerts: Alert[]) {
    const goals = await this.prisma.goal.findMany({
      where: { businessId, isActive: true, targetDate: { not: null } },
    });

    for (const goal of goals) {
      if (!goal.targetDate) continue;
      const targetDate = new Date(goal.targetDate);
      const daysLeft = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const progress = Number(goal.targetAmount) > 0
        ? Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100)
        : 0;

      if (daysLeft > 0 && daysLeft <= 30 && progress < 90) {
        alerts.push({
          id: `goal-${goal.id}`,
          type: 'goal_deadline',
          severity: daysLeft <= 7 ? 'critical' : 'warning',
          title: 'goal_deadline',
          description: 'goal_deadline_desc',
          data: {
            goal: goal.name,
            goalId: goal.id,
            days: daysLeft,
            progress,
            remaining: Math.round(Number(goal.targetAmount) - Number(goal.currentAmount)),
          },
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // ─── Unusual Expense Alerts ───

  private async checkUnusualExpenses(businessId: string, now: Date, alerts: Alert[]) {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

    // Get average expense over last 3 months (excluding last 7 days)
    const avgResult = await this.prisma.transaction.aggregate({
      where: {
        businessId,
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
        businessId,
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
            transactionId: tx.id,
            average: Math.round(avgExpense),
            date: tx.date,
          },
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // ─── Missed Recurring Alerts ───

  private async checkMissedRecurring(businessId: string, now: Date, alerts: Alert[]) {
    const confirmedPatterns = await this.prisma.recurringPattern.findMany({
      where: { businessId, isConfirmed: true, isDismissed: false, frequency: 'monthly' },
    });

    for (const pattern of confirmedPatterns) {
      const lastSeen = new Date(pattern.lastSeenDate);
      const daysSinceLast = Math.ceil(
        (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24),
      );

      // If it's been more than 40 days since last seen, it may be missed
      if (daysSinceLast > 40) {
        alerts.push({
          id: `recurring-${pattern.id}`,
          type: 'recurring_missed',
          severity: daysSinceLast > 60 ? 'warning' : 'info',
          title: 'recurring_missed',
          description: 'recurring_missed_desc',
          data: {
            description: pattern.description,
            patternId: pattern.id,
            amount: Number(pattern.amount),
            type: pattern.type,
            daysSince: daysSinceLast,
            lastSeen: lastSeen.toISOString(),
          },
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // ─── Overdue Invoice Alerts ───

  private async checkOverdueInvoices(businessId: string, now: Date, alerts: Alert[]) {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ['SENT', 'VIEWED'] },
        dueDate: { lt: now },
      },
      include: {
        client: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    for (const invoice of overdueInvoices) {
      const daysOverdue = Math.ceil(
        (now.getTime() - new Date(invoice.dueDate!).getTime()) / (1000 * 60 * 60 * 24),
      );
      const total = Number(invoice.total);

      alerts.push({
        id: `invoice-overdue-${invoice.id}`,
        type: 'invoice_overdue',
        severity: daysOverdue > 30 ? 'critical' : daysOverdue > 14 ? 'warning' : 'info',
        title: 'invoice_overdue',
        description: 'invoice_overdue_desc',
        data: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.client?.name || 'Unknown',
          total,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          daysOverdue,
        },
        createdAt: now.toISOString(),
      });
    }
  }

  // ─── Large Unpaid Invoices Alert (aggregate) ───

  private async checkLargeUnpaidInvoices(businessId: string, alerts: Alert[]) {
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ['SENT', 'VIEWED', 'OVERDUE'] },
      },
      select: { total: true, currency: true },
    });

    if (unpaidInvoices.length === 0) return;

    // Group by currency
    const byCurrency = new Map<string, { count: number; total: number }>();
    for (const inv of unpaidInvoices) {
      const cur = inv.currency || 'ILS';
      const entry = byCurrency.get(cur) || { count: 0, total: 0 };
      entry.count++;
      entry.total += Number(inv.total);
      byCurrency.set(cur, entry);
    }

    for (const [currency, { count, total }] of byCurrency) {
      // Alert if total unpaid exceeds threshold (e.g., 10,000 ILS or equivalent)
      const threshold = currency === 'ILS' ? 10000 : currency === 'USD' ? 3000 : currency === 'EUR' ? 2500 : 10000;

      if (total >= threshold) {
        alerts.push({
          id: `unpaid-invoices-${currency}`,
          type: 'large_unpaid_invoices',
          severity: total >= threshold * 3 ? 'critical' : 'warning',
          title: 'large_unpaid_invoices',
          description: 'large_unpaid_invoices_desc',
          data: {
            currency,
            totalUnpaid: Math.round(total),
            invoiceCount: count,
            threshold,
          },
          createdAt: new Date().toISOString(),
        });
      }
    }
  }
}
