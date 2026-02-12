import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockPriceService } from './stock-price.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { CreateHoldingDto } from './dto/create-holding.dto';
import { UpdateHoldingDto } from './dto/update-holding.dto';

@Injectable()
export class StocksService {
  constructor(
    private prisma: PrismaService,
    private stockPriceService: StockPriceService,
  ) {}

  // ---- Portfolios ----

  async createPortfolio(householdId: string, dto: CreatePortfolioDto) {
    return this.prisma.stockPortfolio.create({
      data: {
        householdId,
        name: dto.name,
        broker: dto.broker ?? null,
        accountNum: dto.accountNum ?? null,
        currency: dto.currency ?? 'ILS',
        notes: dto.notes ?? null,
      },
      include: { holdings: true },
    });
  }

  async findAllPortfolios(householdId: string) {
    return this.prisma.stockPortfolio.findMany({
      where: { householdId, isActive: true },
      include: { holdings: { where: { isActive: true }, orderBy: { ticker: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOnePortfolio(householdId: string, id: string) {
    return this.prisma.stockPortfolio.findFirst({
      where: { id, householdId },
      include: { holdings: { where: { isActive: true }, orderBy: { ticker: 'asc' } } },
    });
  }

  async updatePortfolio(householdId: string, id: string, dto: UpdatePortfolioDto) {
    return this.prisma.stockPortfolio.updateMany({
      where: { id, householdId },
      data: dto as Record<string, unknown>,
    });
  }

  async removePortfolio(householdId: string, id: string) {
    return this.prisma.stockPortfolio.updateMany({
      where: { id, householdId },
      data: { isActive: false },
    });
  }

  // ---- Holdings ----

  async addHolding(householdId: string, portfolioId: string, dto: CreateHoldingDto) {
    // Verify portfolio belongs to household
    const portfolio = await this.prisma.stockPortfolio.findFirst({
      where: { id: portfolioId, householdId },
    });
    if (!portfolio) return null;

    return this.prisma.stockHolding.create({
      data: {
        portfolioId,
        ticker: dto.ticker,
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

  async updateHolding(householdId: string, portfolioId: string, holdingId: string, dto: UpdateHoldingDto) {
    // Verify portfolio belongs to household
    const portfolio = await this.prisma.stockPortfolio.findFirst({
      where: { id: portfolioId, householdId },
    });
    if (!portfolio) return null;

    const data: Record<string, unknown> = { ...dto };
    if (dto.buyDate !== undefined) {
      data.buyDate = dto.buyDate ? new Date(dto.buyDate) : null;
    }

    return this.prisma.stockHolding.updateMany({
      where: { id: holdingId, portfolioId },
      data,
    });
  }

  async removeHolding(householdId: string, portfolioId: string, holdingId: string) {
    // Verify portfolio belongs to household
    const portfolio = await this.prisma.stockPortfolio.findFirst({
      where: { id: portfolioId, householdId },
    });
    if (!portfolio) return null;

    return this.prisma.stockHolding.updateMany({
      where: { id: holdingId, portfolioId },
      data: { isActive: false },
    });
  }

  // ---- Price Refresh ----

  async refreshPrices(householdId: string, portfolioId: string) {
    // Verify portfolio belongs to household
    const portfolio = await this.prisma.stockPortfolio.findFirst({
      where: { id: portfolioId, householdId },
      include: { holdings: { where: { isActive: true } } },
    });
    if (!portfolio) return null;

    for (const holding of portfolio.holdings) {
      const quote = await this.stockPriceService.getQuote(holding.ticker);
      if (quote) {
        await this.prisma.stockHolding.update({
          where: { id: holding.id },
          data: {
            currentPrice: quote.price,
            priceUpdatedAt: new Date(),
          },
        });
      }
    }

    // Return updated portfolio
    return this.prisma.stockPortfolio.findFirst({
      where: { id: portfolioId, householdId },
      include: { holdings: { where: { isActive: true }, orderBy: { ticker: 'asc' } } },
    });
  }
}
