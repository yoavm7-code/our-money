import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { StocksService } from './stocks.service';
import { StockPriceService } from './stock-price.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { CreateHoldingDto } from './dto/create-holding.dto';
import { UpdateHoldingDto } from './dto/update-holding.dto';

@Controller('api/stocks')
@UseGuards(JwtAuthGuard)
export class StocksController {
  constructor(
    private stocksService: StocksService,
    private stockPriceService: StockPriceService,
  ) {}

  // ---- Provider Info & Search ----

  @Get('provider')
  getProvider() {
    return this.stockPriceService.getProviderInfo();
  }

  @Get('search')
  search(@Query('q') query: string) {
    return this.stockPriceService.searchSymbol(query || '');
  }

  // ---- Portfolios ----

  @Post('portfolios')
  createPortfolio(@HouseholdId() householdId: string, @Body() dto: CreatePortfolioDto) {
    return this.stocksService.createPortfolio(householdId, dto);
  }

  @Get('portfolios')
  findAllPortfolios(@HouseholdId() householdId: string) {
    return this.stocksService.findAllPortfolios(householdId);
  }

  @Get('portfolios/:id')
  findOnePortfolio(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.stocksService.findOnePortfolio(householdId, id);
  }

  @Put('portfolios/:id')
  updatePortfolio(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.stocksService.updatePortfolio(householdId, id, dto);
  }

  @Delete('portfolios/:id')
  removePortfolio(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.stocksService.removePortfolio(householdId, id);
  }

  // ---- Holdings ----

  @Post('portfolios/:id/holdings')
  addHolding(
    @HouseholdId() householdId: string,
    @Param('id') portfolioId: string,
    @Body() dto: CreateHoldingDto,
  ) {
    return this.stocksService.addHolding(householdId, portfolioId, dto);
  }

  @Put('portfolios/:id/holdings/:holdingId')
  updateHolding(
    @HouseholdId() householdId: string,
    @Param('id') portfolioId: string,
    @Param('holdingId') holdingId: string,
    @Body() dto: UpdateHoldingDto,
  ) {
    return this.stocksService.updateHolding(householdId, portfolioId, holdingId, dto);
  }

  @Delete('portfolios/:id/holdings/:holdingId')
  removeHolding(
    @HouseholdId() householdId: string,
    @Param('id') portfolioId: string,
    @Param('holdingId') holdingId: string,
  ) {
    return this.stocksService.removeHolding(householdId, portfolioId, holdingId);
  }

  // ---- Price Refresh ----

  @Post('portfolios/:id/refresh-prices')
  refreshPrices(@HouseholdId() householdId: string, @Param('id') portfolioId: string) {
    return this.stocksService.refreshPrices(householdId, portfolioId);
  }
}
