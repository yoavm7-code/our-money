import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class StockPriceService {
  private readonly logger = new Logger(StockPriceService.name);
  private readonly apiKey = process.env.FINNHUB_API_KEY || '';
  private readonly baseUrl = 'https://finnhub.io/api/v1';

  async getQuote(ticker: string): Promise<{ price: number; change: number; changePercent: number; high: number; low: number; open: number; prevClose: number } | null> {
    if (!this.apiKey) {
      this.logger.warn('FINNHUB_API_KEY not set, skipping price fetch');
      return null;
    }
    try {
      const res = await fetch(`${this.baseUrl}/quote?symbol=${encodeURIComponent(ticker)}&token=${this.apiKey}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || data.c === 0) return null;
      return {
        price: data.c,        // current price
        change: data.d,        // change
        changePercent: data.dp, // change percent
        high: data.h,          // day high
        low: data.l,           // day low
        open: data.o,          // open
        prevClose: data.pc,    // previous close
      };
    } catch (err) {
      this.logger.error(`Failed to fetch quote for ${ticker}`, err);
      return null;
    }
  }

  async searchSymbol(query: string): Promise<Array<{ symbol: string; description: string; type: string }>> {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/search?q=${encodeURIComponent(query)}&token=${this.apiKey}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.result || []).slice(0, 10).map((r: any) => ({
        symbol: r.symbol,
        description: r.description,
        type: r.type,
      }));
    } catch {
      return [];
    }
  }

  getProviderInfo() {
    return {
      name: 'Finnhub',
      url: 'https://finnhub.io',
      hasApiKey: !!this.apiKey,
      description: 'Real-time stock data powered by Finnhub.io',
    };
  }
}
