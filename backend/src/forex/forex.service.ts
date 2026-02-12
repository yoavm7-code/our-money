import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface RateCache {
  rates: Record<string, number>;
  base: string;
  date: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class ForexService {
  private readonly logger = new Logger(ForexService.name);
  private cache = new Map<string, RateCache>();

  constructor(private prisma: PrismaService) {}

  // ─── Forex Accounts CRUD ───

  async createAccount(
    businessId: string,
    dto: {
      name: string;
      currency: string;
      balance?: number;
      provider?: string;
      accountNum?: string;
      notes?: string;
    },
  ) {
    return this.prisma.forexAccount.create({
      data: {
        businessId,
        name: dto.name,
        currency: dto.currency,
        balance: dto.balance ?? 0,
        provider: dto.provider ?? null,
        accountNum: dto.accountNum ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async findAllAccounts(businessId: string) {
    return this.prisma.forexAccount.findMany({
      where: { businessId, isActive: true },
      include: { _count: { select: { transfers: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneAccount(businessId: string, id: string) {
    const account = await this.prisma.forexAccount.findFirst({
      where: { id, businessId },
      include: { _count: { select: { transfers: true } } },
    });
    if (!account) throw new NotFoundException('Forex account not found');
    return account;
  }

  async updateAccount(
    businessId: string,
    id: string,
    dto: {
      name?: string;
      currency?: string;
      balance?: number;
      provider?: string;
      accountNum?: string;
      notes?: string;
    },
  ) {
    const result = await this.prisma.forexAccount.updateMany({
      where: { id, businessId },
      data: dto,
    });
    if (result.count === 0) throw new NotFoundException('Forex account not found');
    return this.findOneAccount(businessId, id);
  }

  async removeAccount(businessId: string, id: string) {
    const result = await this.prisma.forexAccount.deleteMany({ where: { id, businessId } });
    if (result.count === 0) throw new NotFoundException('Forex account not found');
    return { deleted: true };
  }

  // ─── Forex Transfers CRUD ───

  async createTransfer(
    businessId: string,
    dto: {
      forexAccountId?: string;
      type: string;
      fromCurrency: string;
      toCurrency: string;
      fromAmount: number;
      toAmount: number;
      exchangeRate: number;
      fee?: number;
      date: string;
      description?: string;
      notes?: string;
    },
  ) {
    const transfer = await this.prisma.forexTransfer.create({
      data: {
        businessId,
        forexAccountId: dto.forexAccountId || null,
        type: dto.type as any,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        fromAmount: dto.fromAmount,
        toAmount: dto.toAmount,
        exchangeRate: dto.exchangeRate,
        fee: dto.fee ?? null,
        date: new Date(dto.date),
        description: dto.description ?? null,
        notes: dto.notes ?? null,
      },
      include: { forexAccount: { select: { id: true, name: true, currency: true } } },
    });

    // Update account balance if linked
    if (dto.forexAccountId) {
      const delta = dto.type === 'SELL' ? -dto.fromAmount : dto.toAmount;
      await this.prisma.forexAccount.update({
        where: { id: dto.forexAccountId },
        data: { balance: { increment: delta } },
      });
    }

    return transfer;
  }

  async findAllTransfers(businessId: string, forexAccountId?: string) {
    return this.prisma.forexTransfer.findMany({
      where: { businessId, ...(forexAccountId && { forexAccountId }) },
      include: { forexAccount: { select: { id: true, name: true, currency: true } } },
      orderBy: { date: 'desc' },
    });
  }

  async updateTransfer(businessId: string, id: string, dto: Record<string, unknown>) {
    const data = { ...dto };
    if (data.date) {
      data.date = new Date(data.date as string);
    }

    const result = await this.prisma.forexTransfer.updateMany({
      where: { id, businessId },
      data,
    });
    if (result.count === 0) throw new NotFoundException('Forex transfer not found');

    return this.prisma.forexTransfer.findFirst({
      where: { id, businessId },
      include: { forexAccount: { select: { id: true, name: true, currency: true } } },
    });
  }

  async removeTransfer(businessId: string, id: string) {
    const result = await this.prisma.forexTransfer.deleteMany({ where: { id, businessId } });
    if (result.count === 0) throw new NotFoundException('Forex transfer not found');
    return { deleted: true };
  }

  // ─── Exchange Rates (frankfurter.app - free, no API key) ───

  /**
   * Get latest exchange rates for a base currency.
   * Results are cached for 30 minutes.
   */
  async getRates(base = 'ILS'): Promise<{ base: string; date: string; rates: Record<string, number> }> {
    const cached = this.cache.get(base);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { base: cached.base, date: cached.date, rates: cached.rates };
    }

    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`);
      if (!res.ok) throw new Error(`Frankfurter API error: ${res.status}`);
      const data = (await res.json()) as { base: string; date: string; rates: Record<string, number> };
      const entry: RateCache = {
        rates: data.rates,
        base: data.base,
        date: data.date,
        fetchedAt: Date.now(),
      };
      this.cache.set(base, entry);
      return { base: data.base, date: data.date, rates: data.rates };
    } catch (err) {
      this.logger.warn(`Failed to fetch rates: ${err}`);
      if (cached) {
        return { base: cached.base, date: cached.date, rates: cached.rates };
      }
      return { base, date: new Date().toISOString().slice(0, 10), rates: this.getFallbackRates(base) };
    }
  }

  /**
   * Convert amount between currencies.
   */
  async convert(
    amount: number,
    from: string,
    to: string,
  ): Promise<{ from: string; to: string; amount: number; result: number; rate: number; date: string }> {
    if (from === to) {
      return { from, to, amount, result: amount, rate: 1, date: new Date().toISOString().slice(0, 10) };
    }

    const { rates, date } = await this.getRates(from);
    const rate = rates[to];
    if (!rate) {
      // Try reverse
      const reverse = await this.getRates(to);
      const reverseRate = reverse.rates[from];
      if (reverseRate) {
        const actualRate = 1 / reverseRate;
        return {
          from, to, amount,
          result: Math.round(amount * actualRate * 100) / 100,
          rate: actualRate,
          date: reverse.date,
        };
      }
      throw new Error(`No rate found for ${from} -> ${to}`);
    }
    return { from, to, amount, result: Math.round(amount * rate * 100) / 100, rate, date };
  }

  /**
   * Get historical rates for a currency pair.
   */
  async getHistory(
    from: string,
    to: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{ base: string; target: string; rates: Array<{ date: string; rate: number }> }> {
    const end = endDate || new Date().toISOString().slice(0, 10);
    const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const res = await fetch(
        `https://api.frankfurter.app/${start}..${end}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!res.ok) throw new Error(`Frankfurter history API error: ${res.status}`);
      const data = (await res.json()) as {
        base: string;
        start_date: string;
        end_date: string;
        rates: Record<string, Record<string, number>>;
      };
      const rates = Object.entries(data.rates)
        .map(([date, r]) => ({ date, rate: r[to] }))
        .filter((r) => r.rate != null)
        .sort((a, b) => a.date.localeCompare(b.date));
      return { base: from, target: to, rates };
    } catch (err) {
      this.logger.warn(`Failed to fetch history: ${err}`);
      return { base: from, target: to, rates: [] };
    }
  }

  /**
   * Get supported currencies list.
   */
  async getCurrencies(): Promise<Record<string, string>> {
    try {
      const res = await fetch('https://api.frankfurter.app/currencies');
      if (!res.ok) throw new Error(`Frankfurter currencies API error: ${res.status}`);
      return (await res.json()) as Record<string, string>;
    } catch {
      return {
        ILS: 'Israeli New Shekel',
        USD: 'United States Dollar',
        EUR: 'Euro',
        GBP: 'British Pound',
        JPY: 'Japanese Yen',
        CHF: 'Swiss Franc',
        CAD: 'Canadian Dollar',
        AUD: 'Australian Dollar',
        CNY: 'Chinese Yuan',
        THB: 'Thai Baht',
      };
    }
  }

  // ─── Private helpers ───

  private getFallbackRates(base: string): Record<string, number> {
    const ilsRates: Record<string, number> = {
      USD: 0.27, EUR: 0.25, GBP: 0.22, JPY: 40.5,
      CHF: 0.24, CAD: 0.37, AUD: 0.42, CNY: 1.96,
      THB: 9.5, SEK: 2.82, NOK: 2.87, DKK: 1.86,
      PLN: 1.08, CZK: 6.27, HUF: 99.0, TRY: 8.7,
      ZAR: 4.9, BRL: 1.35, MXN: 4.65, SGD: 0.36,
      HKD: 2.11, KRW: 371.0, INR: 22.7, RUB: 25.0,
    };
    if (base === 'ILS') return ilsRates;
    const baseInIls = ilsRates[base];
    if (!baseInIls) return {};
    const rates: Record<string, number> = { ILS: 1 / baseInIls };
    for (const [cur, rate] of Object.entries(ilsRates)) {
      if (cur !== base) rates[cur] = rate / baseInIls;
    }
    return rates;
  }
}
