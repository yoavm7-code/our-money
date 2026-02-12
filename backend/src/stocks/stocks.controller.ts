import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StocksService } from './stocks.service';
import { StockPriceService } from './stock-price.service';

@Controller('api/stocks')
@UseGuards(JwtAuthGuard)
export class StocksController {
  constructor(
    private service: StocksService,
    private priceService: StockPriceService,
  ) {}

  // ─── Provider Info & Search ───

  /**
   * GET /api/stocks/provider
   * Get info about the stock price data provider.
   */
  @Get('provider')
  getProvider() {
    return this.priceService.getProviderInfo();
  }

  /**
   * GET /api/stocks/search?q=AAPL
   * Search for stock symbols.
   */
  @Get('search')
  search(@Query('q') query: string) {
    return this.priceService.searchSymbol(query || '');
  }

  /**
   * GET /api/stocks/quote/:ticker
   * Get real-time quote for a ticker.
   */
  @Get('quote/:ticker')
  getQuote(@Param('ticker') ticker: string) {
    return this.priceService.getQuote(ticker);
  }

  /**
   * GET /api/stocks/summary
   * Get overall summary of all portfolios.
   */
  @Get('summary')
  getSummary(@CurrentUser() user: { businessId: string }) {
    return this.service.getSummary(user.businessId);
  }

  // ─── Portfolios ───

  /**
   * POST /api/stocks/portfolios
   * Create a new stock portfolio.
   */
  @Post('portfolios')
  createPortfolio(
    @CurrentUser() user: { businessId: string },
    @Body() dto: {
      name: string;
      broker?: string;
      accountNum?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.service.createPortfolio(user.businessId, dto);
  }

  /**
   * GET /api/stocks/portfolios
   * List all active portfolios with holdings summary.
   */
  @Get('portfolios')
  listPortfolios(@CurrentUser() user: { businessId: string }) {
    return this.service.listPortfolios(user.businessId);
  }

  /**
   * GET /api/stocks/portfolios/:id
   * Get a specific portfolio with all holdings.
   */
  @Get('portfolios/:id')
  findOnePortfolio(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.service.findOnePortfolio(user.businessId, id);
  }

  /**
   * PUT /api/stocks/portfolios/:id
   * Update a portfolio.
   */
  @Put('portfolios/:id')
  updatePortfolio(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: {
      name?: string;
      broker?: string;
      accountNum?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.service.updatePortfolio(user.businessId, id, dto);
  }

  /**
   * DELETE /api/stocks/portfolios/:id
   * Soft-delete a portfolio.
   */
  @Delete('portfolios/:id')
  removePortfolio(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.service.removePortfolio(user.businessId, id);
  }

  // ─── Holdings ───

  /**
   * GET /api/stocks/portfolios/:portfolioId/holdings
   * List all holdings in a portfolio with P&L.
   */
  @Get('portfolios/:portfolioId/holdings')
  listHoldings(
    @CurrentUser() user: { businessId: string },
    @Param('portfolioId') portfolioId: string,
  ) {
    return this.service.listHoldings(user.businessId, portfolioId);
  }

  /**
   * POST /api/stocks/portfolios/:portfolioId/holdings
   * Add a holding to a portfolio.
   */
  @Post('portfolios/:portfolioId/holdings')
  createHolding(
    @CurrentUser() user: { businessId: string },
    @Param('portfolioId') portfolioId: string,
    @Body() dto: {
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
    return this.service.createHolding(user.businessId, portfolioId, dto);
  }

  /**
   * PUT /api/stocks/holdings/:id
   * Update a holding.
   */
  @Put('holdings/:id')
  updateHolding(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: {
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
    return this.service.updateHolding(user.businessId, id, dto);
  }

  /**
   * DELETE /api/stocks/holdings/:id
   * Soft-delete a holding.
   */
  @Delete('holdings/:id')
  removeHolding(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.service.removeHolding(user.businessId, id);
  }

  // ─── Price Refresh ───

  /**
   * POST /api/stocks/portfolios/:portfolioId/refresh
   * Refresh current prices for all holdings in a portfolio.
   */
  @Post('portfolios/:portfolioId/refresh')
  refreshPrices(
    @CurrentUser() user: { businessId: string },
    @Param('portfolioId') portfolioId: string,
  ) {
    return this.service.refreshPrices(user.businessId, portfolioId);
  }
}
