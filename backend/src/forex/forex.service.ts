import { Injectable, Logger } from '@nestjs/common';

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

  /**
   * Get latest exchange rates for a base currency.
   * Uses frankfurter.app (free, no API key needed).
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
      // Return cached even if stale, or fallback rates
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
        return { from, to, amount, result: Math.round(amount * actualRate * 100) / 100, rate: actualRate, date: reverse.date };
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
      const data = (await res.json()) as { base: string; start_date: string; end_date: string; rates: Record<string, Record<string, number>> };
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

  private getFallbackRates(base: string): Record<string, number> {
    // Approximate fallback rates relative to ILS
    const ilsRates: Record<string, number> = {
      USD: 0.27, EUR: 0.25, GBP: 0.22, JPY: 40.5,
      CHF: 0.24, CAD: 0.37, AUD: 0.42, CNY: 1.96,
      THB: 9.5, SEK: 2.82, NOK: 2.87, DKK: 1.86,
      PLN: 1.08, CZK: 6.27, HUF: 99.0, TRY: 8.7,
      ZAR: 4.9, BRL: 1.35, MXN: 4.65, SGD: 0.36,
      HKD: 2.11, KRW: 371.0, INR: 22.7, RUB: 25.0,
    };
    if (base === 'ILS') return ilsRates;
    // Try converting via ILS
    const baseInIls = ilsRates[base];
    if (!baseInIls) return {};
    const rates: Record<string, number> = { ILS: 1 / baseInIls };
    for (const [cur, rate] of Object.entries(ilsRates)) {
      if (cur !== base) rates[cur] = rate / baseInIls;
    }
    return rates;
  }
}
