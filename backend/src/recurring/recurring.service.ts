import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

interface GroupedTransaction {
  id: string;
  date: Date;
  amount: number;
  description: string;
  categoryId: string | null;
  accountId: string;
}

@Injectable()
export class RecurringService {
  constructor(private prisma: PrismaService) {}

  /**
   * Analyze all transactions from the last 6 months and detect recurring patterns.
   * Groups by normalized description, checks for roughly monthly intervals (25-35 days),
   * and creates/updates RecurringPattern records for both income and expenses.
   */
  async detect(businessId: string) {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

    // Fetch all transactions from the last 6 months
    const transactions = await this.prisma.transaction.findMany({
      where: {
        businessId,
        date: { gte: sixMonthsAgo, lte: now },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        categoryId: true,
        accountId: true,
      },
      orderBy: { date: 'asc' },
    });

    // Fetch already dismissed patterns so we can skip them
    const dismissedPatterns = await this.prisma.recurringPattern.findMany({
      where: { businessId, isDismissed: true },
      select: { description: true },
    });
    const dismissedDescriptions = new Set(
      dismissedPatterns.map((p) => this.normalize(p.description)),
    );

    // Group transactions by normalized description
    const groups = new Map<string, GroupedTransaction[]>();
    for (const tx of transactions) {
      const key = this.normalize(tx.description);
      if (!key) continue;
      if (dismissedDescriptions.has(key)) continue;

      const entry: GroupedTransaction = {
        id: tx.id,
        date: new Date(tx.date),
        amount: Number(tx.amount),
        description: tx.description,
        categoryId: tx.categoryId,
        accountId: tx.accountId,
      };

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entry);
    }

    const detected: Array<{
      description: string;
      amount: number;
      type: string;
      categoryId: string | null;
      accountId: string;
      lastSeenDate: Date;
      occurrences: number;
    }> = [];

    for (const [normalizedDesc, txList] of groups) {
      if (txList.length < 2) continue;

      // Split into income and expense sub-groups, then further by amount similarity
      const incomeGroup = txList.filter((t) => t.amount > 0);
      const expenseGroup = txList.filter((t) => t.amount < 0);

      for (const subGroup of [incomeGroup, expenseGroup]) {
        if (subGroup.length < 2) continue;

        // Further cluster by amount similarity (within 10% variance)
        const clusters = this.clusterByAmount(subGroup);

        for (const cluster of clusters) {
          if (cluster.length < 2) continue;

          // Sort by date and check for monthly intervals
          cluster.sort((a, b) => a.date.getTime() - b.date.getTime());
          const monthlyMatches = this.findMonthlyOccurrences(cluster);

          if (monthlyMatches.length >= 2) {
            const avgAmount =
              monthlyMatches.reduce((sum, t) => sum + t.amount, 0) / monthlyMatches.length;
            const lastTx = monthlyMatches[monthlyMatches.length - 1];

            const categoryId = this.mostCommon(monthlyMatches.map((t) => t.categoryId));
            const accountId = this.mostCommon(monthlyMatches.map((t) => t.accountId)) ?? lastTx.accountId;

            detected.push({
              description: normalizedDesc,
              amount: Math.round(avgAmount * 100) / 100,
              type: avgAmount > 0 ? 'income' : 'expense',
              categoryId,
              accountId,
              lastSeenDate: lastTx.date,
              occurrences: monthlyMatches.length,
            });
          }
        }
      }
    }

    // Upsert detected patterns
    const results = [];
    for (const pattern of detected) {
      const existing = await this.prisma.recurringPattern.findFirst({
        where: {
          businessId,
          description: pattern.description,
          type: pattern.type,
        },
      });

      if (existing) {
        const updated = await this.prisma.recurringPattern.update({
          where: { id: existing.id },
          data: {
            amount: new Decimal(pattern.amount.toFixed(2)),
            lastSeenDate: pattern.lastSeenDate,
            occurrences: pattern.occurrences,
            categoryId: pattern.categoryId,
            accountId: pattern.accountId,
          },
        });
        results.push(updated);
      } else {
        const created = await this.prisma.recurringPattern.create({
          data: {
            businessId,
            description: pattern.description,
            amount: new Decimal(pattern.amount.toFixed(2)),
            type: pattern.type,
            frequency: 'monthly',
            categoryId: pattern.categoryId,
            accountId: pattern.accountId,
            lastSeenDate: pattern.lastSeenDate,
            occurrences: pattern.occurrences,
          },
        });
        results.push(created);
      }
    }

    return results;
  }

  /**
   * List all non-dismissed recurring patterns for the business,
   * ordered by type then by absolute amount descending.
   */
  async list(businessId: string) {
    return this.prisma.recurringPattern.findMany({
      where: {
        businessId,
        isDismissed: false,
      },
      orderBy: [
        { type: 'asc' },
        { amount: 'desc' },
      ],
    });
  }

  /**
   * Confirm a recurring pattern and mark all matching transactions as recurring.
   */
  async confirm(businessId: string, id: string) {
    const pattern = await this.prisma.recurringPattern.update({
      where: { id, businessId },
      data: { isConfirmed: true, isDismissed: false },
    });

    // Mark matching transactions as recurring
    await this.markMatchingTransactions(businessId, pattern);

    return pattern;
  }

  /**
   * Dismiss a recurring pattern so it won't be shown or re-detected.
   */
  async dismiss(businessId: string, id: string) {
    return this.prisma.recurringPattern.update({
      where: { id, businessId },
      data: { isDismissed: true, isConfirmed: false },
    });
  }

  /**
   * For all confirmed patterns, find new matching transactions
   * and mark them as isRecurring = true.
   */
  async applyConfirmed(businessId: string) {
    const confirmedPatterns = await this.prisma.recurringPattern.findMany({
      where: {
        businessId,
        isConfirmed: true,
        isDismissed: false,
      },
    });

    let totalUpdated = 0;
    for (const pattern of confirmedPatterns) {
      const count = await this.markMatchingTransactions(businessId, pattern);
      totalUpdated += count;
    }

    return { patternsApplied: confirmedPatterns.length, transactionsUpdated: totalUpdated };
  }

  // ─── Private helpers ───

  private normalize(description: string): string {
    return description.trim().toLowerCase();
  }

  private clusterByAmount(txList: GroupedTransaction[]): GroupedTransaction[][] {
    if (txList.length === 0) return [];

    const sorted = [...txList].sort(
      (a, b) => Math.abs(a.amount) - Math.abs(b.amount),
    );

    const clusters: GroupedTransaction[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const tx = sorted[i];
      let placed = false;

      for (const cluster of clusters) {
        const clusterAvg =
          cluster.reduce((s, t) => s + Math.abs(t.amount), 0) / cluster.length;
        const diff = Math.abs(Math.abs(tx.amount) - clusterAvg);
        if (clusterAvg === 0 || diff / clusterAvg <= 0.1) {
          cluster.push(tx);
          placed = true;
          break;
        }
      }

      if (!placed) {
        clusters.push([tx]);
      }
    }

    return clusters;
  }

  private findMonthlyOccurrences(sorted: GroupedTransaction[]): GroupedTransaction[] {
    if (sorted.length < 2) return [];

    let bestChain: GroupedTransaction[] = [];

    for (let startIdx = 0; startIdx < sorted.length; startIdx++) {
      const chain: GroupedTransaction[] = [sorted[startIdx]];

      for (let j = startIdx + 1; j < sorted.length; j++) {
        const lastInChain = chain[chain.length - 1];
        const daysDiff = this.daysBetween(lastInChain.date, sorted[j].date);

        if (daysDiff >= 25 && daysDiff <= 35) {
          chain.push(sorted[j]);
        }
      }

      if (chain.length > bestChain.length) {
        bestChain = chain;
      }
    }

    return bestChain.length >= 2 ? bestChain : [];
  }

  private daysBetween(a: Date, b: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round(Math.abs(b.getTime() - a.getTime()) / msPerDay);
  }

  private mostCommon<T>(values: (T | null)[]): T | null {
    const counts = new Map<string, { value: T; count: number }>();
    for (const v of values) {
      if (v == null) continue;
      const key = String(v);
      const entry = counts.get(key);
      if (entry) {
        entry.count++;
      } else {
        counts.set(key, { value: v, count: 1 });
      }
    }
    let best: { value: T; count: number } | null = null;
    for (const entry of counts.values()) {
      if (!best || entry.count > best.count) {
        best = entry;
      }
    }
    return best?.value ?? null;
  }

  private async markMatchingTransactions(
    businessId: string,
    pattern: { description: string; amount: Decimal | number; type: string },
  ): Promise<number> {
    const patternAmount = Number(pattern.amount);
    const tolerance = Math.abs(patternAmount) * 0.1;
    const minAmount = patternAmount - tolerance;
    const maxAmount = patternAmount + tolerance;

    const lowerBound = Math.min(minAmount, maxAmount);
    const upperBound = Math.max(minAmount, maxAmount);

    const matchingTransactions = await this.prisma.transaction.findMany({
      where: {
        businessId,
        isRecurring: false,
        amount: {
          gte: new Decimal(lowerBound.toFixed(2)),
          lte: new Decimal(upperBound.toFixed(2)),
        },
      },
      select: { id: true, description: true },
    });

    const normalizedPattern = this.normalize(pattern.description);
    const idsToUpdate = matchingTransactions
      .filter((tx) => this.normalize(tx.description) === normalizedPattern)
      .map((tx) => tx.id);

    if (idsToUpdate.length === 0) return 0;

    const result = await this.prisma.transaction.updateMany({
      where: { id: { in: idsToUpdate } },
      data: { isRecurring: true },
    });

    return result.count;
  }
}
