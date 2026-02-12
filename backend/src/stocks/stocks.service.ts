import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockPriceService } from './stock-price.service';

@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);

  constructor(
    private prisma: PrismaService,
    private priceService: StockPriceService,
  ) {}

  // ─── Portfolios ───

  async createPortfolio(
    businessId: string,
    dto: {
      name: string;
      broker?: string;
      accountNum?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.prisma.stockPortfolio.create({
      data: {
        businessId,
        name: dto.name,
        broker: dto.broker ?? null,
        accountNum: dto.accountNum ?? null,
        currency: dto.currency ?? 'ILS',
        notes: dto.notes ?? null,
      },
      include: { holdings: true },
    });
  }

  async listPortfolios(businessId: string) {
    const portfolios = await this.prisma.stockPortfolio.findMany({
      where: { businessId, isActive: true },
      include: {
        holdings: {
          where: { isActive: true },
          orderBy: { ticker: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return portfolios.map((p) => {
      let totalInvested = 0;
      let totalCurrentValue = 0;

      const holdings = p.holdings.map((h) => {
        const shares = Number(h.shares);
        const avgBuy = Number(h.avgBuyPrice);
        const current = h.currentPrice ? Number(h.currentPrice) : avgBuy;
        const invested = shares * avgBuy;
        const currentValue = shares * current;
        totalInvested += invested;
        totalCurrentValue += currentValue;
        return {
          ...h,
          shares,
          avgBuyPrice: avgBuy,
          currentPrice: h.currentPrice ? Number(h.currentPrice) : null,
          invested: Math.round(invested * 100) / 100,
          currentValue: Math.round(currentValue * 100) / 100,
          pnl: Math.round((currentValue - invested) * 100) / 100,
          pnlPercent: invested > 0 ? Math.round(((currentValue - invested) / invested) * 10000) / 100 : 0,
        };
      });

      const totalPnl = totalCurrentValue - totalInvested;
      const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

      return {
        ...p,
        holdings,
        holdingsCount: holdings.length,
        totalInvested: Math.round(totalInvested * 100) / 100,
        totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
      };
    });
  }

  async findOnePortfolio(businessId: string, id: string) {
    const portfolio = await this.prisma.stockPortfolio.findFirst({
      where: { id, businessId },
      include: { holdings: { where: { isActive: true }, orderBy: { ticker: 'asc' } } },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');
    return portfolio;
  }

  async updatePortfolio(
    businessId: string,
    id: string,
    dto: {
      name?: string;
      broker?: string;
      accountNum?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    const result = await this.prisma.stockPortfolio.updateMany({
      where: { id, businessId },
      data: dto,
    });
    if (result.count === 0) throw new NotFoundException('Portfolio not found');
    return this.findOnePortfolio(businessId, id);
  }

  async removePortfolio(businessId: string, id: string) {
    const result = await this.prisma.stockPortfolio.updateMany({
      where: { id, businessId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundException('Portfolio not found');
    return { deleted: true };
  }

  // ─── Holdings ───

  async listHoldings(businessId: string, portfolioId: string) {
    const portfolio = await this.prisma.stockPortfolio.findFirst({
      where: { id: portfolioId, businessId },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');

    const holdings = await this.prisma.stockHolding.findMany({
      where: { portfolioId, isActive: true },
      orderBy: { ticker: 'asc' },
    });

    return holdings.map((h) => {
      const shares = Number(h.shares);
      const avgBuy = Number(h.avgBuyPrice);
      const current = h.currentPrice ? Number(h.currentPrice) : null;
      const invested = shares * avgBuy;
      const currentValue = current != null ? shares * current : null;
      const pnl = currentValue != null ? currentValue - invested : null;
      const pnlPercent = pnl != null && invested > 0 ? (pnl / invested) * 100 : null;

      return {
        ...h,
        shares,
        avgBuyPrice: avgBuy,
        currentPrice: current,
        invested: Math.round(invested * 100) / 100,
        currentValue: currentValue != null ? Math.round(currentValue * 100) / 100 : null,
        pnl: pnl != null ? Math.round(pnl * 100) / 100 : null,
        pnlPercent: pnlPercent != null ? Math.round(pnlPercent * 100) / 100 : null,
      };
    });
  }

  async createHolding(
    businessId: string,
    portfolioId: string,
    dto: {
      ticker: string;
      name: string;
      exchange?: string;
      sector?: string;
      shares: number;
      avgBuyPrice: number;
      currency?: string;
      buyDate?: string;
      notes?: string;
    },
  ) {
    const portfolio = await this.prisma.stockPortfolio.findFirst({
      where: { id: portfolioId, businessId },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');

    return this.prisma.stockHolding.create({
      data: {
        portfolioId,
        ticker: dto.ticker.toUpperCase(),
        name: dto.name,
        exchange: dto.exchange ?? null,
        sector: dto.sector ?? null,
        shares: dto.shares,
        avgBuyPrice: dto.avgBuyPrice,
        currency: dto.currency ?? 'USD',
        buyDate: dto.buyDate ? new Date(dto.buyDate) : null,
        notes: dto.notes ?? null,
      },
    });
  }

  async updateHolding(
    businessId: string,
    id: string,
    dto: {
      ticker?: string;
      name?: string;
      exchange?: string;
      sector?: string;
      shares?: number;
      avgBuyPrice?: number;
      currency?: string;
      buyDate?: string;
      notes?: string;
    },
  ) {
    const holding = await this.prisma.stockHolding.findFirst({
      where: { id },
      include: { portfolio: { select: { businessId: true } } },
    });
    if (!holding || holding.portfolio.businessId !== businessId) {
      throw new NotFoundException('Holding not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.ticker !== undefined) data.ticker = dto.ticker.toUpperCase();
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.exchange !== undefined) data.exchange = dto.exchange;
    if (dto.sector !== undefined) data.sector = dto.sector;
    if (dto.shares !== undefined) data.shares = dto.shares;
    if (dto.avgBuyPrice !== undefined) data.avgBuyPrice = dto.avgBuyPrice;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.buyDate !== undefined) data.buyDate = dto.buyDate ? new Date(dto.buyDate) : null;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.stockHolding.update({
      where: { id },
      data,
    });
  }

  async removeHolding(businessId: string, id: string) {
    const holding = await this.prisma.stockHolding.findFirst({
      where: { id },
      include: { portfolio: { select: { businessId: true } } },
    });
    if (!holding || holding.portfolio.businessId !== businessId) {
      throw new NotFoundException('Holding not found');
    }

    await this.prisma.stockHolding.update({
      where: { id },
      data: { isActive: false },
    });
    return { deleted: true };
  }

  // ─── Price Refresh ───

  async refreshPrices(businessId: string, portfolioId: string) {
    const portfolio = await this.prisma.stockPortfolio.findFirst({
      where: { id: portfolioId, businessId },
      include: {
        holdings: {
          where: { isActive: true },
          select: { id: true, ticker: true },
        },
      },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');

    const results: Array<{ ticker: string; price: number | null; error?: string }> = [];

    for (const holding of portfolio.holdings) {
      try {
        const quote = await this.priceService.getQuote(holding.ticker);
        if (quote && quote.price > 0) {
          await this.prisma.stockHolding.update({
            where: { id: holding.id },
            data: { currentPrice: quote.price, priceUpdatedAt: new Date() },
          });
          results.push({ ticker: holding.ticker, price: quote.price });
        } else {
          results.push({ ticker: holding.ticker, price: null, error: 'Price not available' });
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch price for ${holding.ticker}: ${err}`);
        results.push({ ticker: holding.ticker, price: null, error: String(err) });
      }
    }

    return {
      portfolioId,
      refreshed: results.filter((r) => r.price != null).length,
      total: results.length,
      results,
    };
  }

  // ─── Summary ───

  async getSummary(businessId: string) {
    const portfolios = await this.listPortfolios(businessId);

    let totalInvested = 0;
    let totalCurrentValue = 0;
    let totalHoldings = 0;

    for (const p of portfolios) {
      totalInvested += p.totalInvested;
      totalCurrentValue += p.totalCurrentValue;
      totalHoldings += p.holdingsCount;
    }

    const totalPnl = totalCurrentValue - totalInvested;
    const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    return {
      portfolioCount: portfolios.length,
      holdingsCount: totalHoldings,
      totalInvested: Math.round(totalInvested * 100) / 100,
      totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
    };
  }
}
