import { Injectable, Logger } from '@nestjs/common';

interface PriceCache {
  price: number;
  data: QuoteData;
  fetchedAt: number;
}

interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class StockPriceService {
  private readonly logger = new Logger(StockPriceService.name);
  private readonly finnhubKey = process.env.FINNHUB_API_KEY || '';
  private readonly alphaVantageKey = process.env.ALPHA_VANTAGE_KEY || '';
  private readonly cache = new Map<string, PriceCache>();

  /**
   * Get a full quote (price, change, high, low, open, prevClose) for a ticker.
   * Tries Finnhub first, then Alpha Vantage, then Yahoo Finance.
   */
  async getQuote(ticker: string): Promise<QuoteData | null> {
    const upperTicker = ticker.toUpperCase();

    // Check cache
    const cached = this.cache.get(upperTicker);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    // Try Finnhub (primary - needs API key, free tier: 60 calls/min)
    if (this.finnhubKey) {
      const quote = await this.fetchFinnhub(upperTicker);
      if (quote) {
        this.cache.set(upperTicker, { price: quote.price, data: quote, fetchedAt: Date.now() });
        return quote;
      }
    }

    // Try Alpha Vantage (needs API key, free tier: 25 calls/day)
    if (this.alphaVantageKey) {
      const quote = await this.fetchAlphaVantage(upperTicker);
      if (quote) {
        this.cache.set(upperTicker, { price: quote.price, data: quote, fetchedAt: Date.now() });
        return quote;
      }
    }

    // Try Yahoo Finance (no key needed, may be rate limited)
    const quote = await this.fetchYahoo(upperTicker);
    if (quote) {
      this.cache.set(upperTicker, { price: quote.price, data: quote, fetchedAt: Date.now() });
      return quote;
    }

    this.logger.warn(`Could not fetch quote for ${upperTicker} from any provider`);
    return null;
  }

  /**
   * Search for stock symbols using Finnhub search endpoint.
   */
  async searchSymbol(query: string): Promise<Array<{ symbol: string; description: string; type: string }>> {
    if (!this.finnhubKey || !query) return [];
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${this.finnhubKey}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { result?: Array<{ symbol: string; description: string; type: string }> };
      return (data.result || []).slice(0, 10).map((r) => ({
        symbol: r.symbol,
        description: r.description,
        type: r.type,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get info about which stock data providers are configured.
   */
  getProviderInfo() {
    return {
      providers: [
        {
          name: 'Finnhub',
          url: 'https://finnhub.io',
          configured: !!this.finnhubKey,
          description: 'Real-time stock data (free: 60 calls/min)',
        },
        {
          name: 'Alpha Vantage',
          url: 'https://www.alphavantage.co',
          configured: !!this.alphaVantageKey,
          description: 'Stock data and fundamentals (free: 25 calls/day)',
        },
        {
          name: 'Yahoo Finance',
          url: 'https://finance.yahoo.com',
          configured: true, // no key needed
          description: 'Fallback provider (no API key required, may be rate limited)',
        },
      ],
      primaryProvider: this.finnhubKey ? 'Finnhub' : this.alphaVantageKey ? 'Alpha Vantage' : 'Yahoo Finance',
    };
  }

  // ─── Provider implementations ───

  private async fetchFinnhub(ticker: string): Promise<QuoteData | null> {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${this.finnhubKey}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        c: number; d: number; dp: number; h: number; l: number; o: number; pc: number;
      };
      if (!data || data.c === 0) return null;
      return {
        price: data.c,
        change: data.d,
        changePercent: data.dp,
        high: data.h,
        low: data.l,
        open: data.o,
        prevClose: data.pc,
      };
    } catch (err) {
      this.logger.debug(`Finnhub error for ${ticker}: ${err}`);
      return null;
    }
  }

  private async fetchAlphaVantage(ticker: string): Promise<QuoteData | null> {
    try {
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${this.alphaVantageKey}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        'Global Quote'?: {
          '05. price'?: string;
          '09. change'?: string;
          '10. change percent'?: string;
          '03. high'?: string;
          '04. low'?: string;
          '02. open'?: string;
          '08. previous close'?: string;
        };
      };
      const gq = data?.['Global Quote'];
      if (!gq || !gq['05. price']) return null;
      const price = parseFloat(gq['05. price'] || '0');
      if (price <= 0) return null;
      return {
        price,
        change: parseFloat(gq['09. change'] || '0'),
        changePercent: parseFloat((gq['10. change percent'] || '0').replace('%', '')),
        high: parseFloat(gq['03. high'] || '0'),
        low: parseFloat(gq['04. low'] || '0'),
        open: parseFloat(gq['02. open'] || '0'),
        prevClose: parseFloat(gq['08. previous close'] || '0'),
      };
    } catch (err) {
      this.logger.debug(`Alpha Vantage error for ${ticker}: ${err}`);
      return null;
    }
  }

  private async fetchYahoo(ticker: string): Promise<QuoteData | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              previousClose?: number;
              regularMarketDayHigh?: number;
              regularMarketDayLow?: number;
              regularMarketOpen?: number;
            };
          }>;
        };
      };
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta || !meta.regularMarketPrice || meta.regularMarketPrice <= 0) return null;
      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose ?? price;
      return {
        price,
        change: Math.round((price - prevClose) * 100) / 100,
        changePercent: prevClose > 0 ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : 0,
        high: meta.regularMarketDayHigh ?? price,
        low: meta.regularMarketDayLow ?? price,
        open: meta.regularMarketOpen ?? price,
        prevClose,
      };
    } catch (err) {
      this.logger.debug(`Yahoo Finance error for ${ticker}: ${err}`);
      return null;
    }
  }
}
