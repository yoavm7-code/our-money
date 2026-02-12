import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ForexService } from './forex.service';

@Controller('api/forex')
@UseGuards(JwtAuthGuard)
export class ForexController {
  constructor(private forexService: ForexService) {}

  // ─── Exchange Rate endpoints (public data, but behind auth) ───

  /**
   * GET /api/forex/rates?base=ILS
   * Get latest exchange rates for a base currency.
   */
  @Get('rates')
  async getRates(@Query('base') base?: string) {
    return this.forexService.getRates(base || 'ILS');
  }

  /**
   * GET /api/forex/convert?amount=100&from=ILS&to=USD
   * Convert amount between currencies.
   */
  @Get('convert')
  async convert(
    @Query('amount') amount: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.forexService.convert(parseFloat(amount) || 0, from || 'ILS', to || 'USD');
  }

  /**
   * GET /api/forex/history?from=ILS&to=USD&start=2025-01-01&end=2025-03-01
   * Get historical exchange rates for a currency pair.
   */
  @Get('history')
  async getHistory(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.forexService.getHistory(from || 'ILS', to || 'USD', start, end);
  }

  /**
   * GET /api/forex/currencies
   * Get list of supported currencies.
   */
  @Get('currencies')
  async getCurrencies() {
    return this.forexService.getCurrencies();
  }

  // ─── Forex Account endpoints ───

  /**
   * POST /api/forex/accounts
   * Create a new forex (foreign currency) account.
   */
  @Post('accounts')
  createAccount(
    @CurrentUser() user: { businessId: string },
    @Body() dto: {
      name: string;
      currency: string;
      balance?: number;
      provider?: string;
      accountNum?: string;
      notes?: string;
    },
  ) {
    return this.forexService.createAccount(user.businessId, dto);
  }

  /**
   * GET /api/forex/accounts
   * List all forex accounts for the business.
   */
  @Get('accounts')
  findAllAccounts(@CurrentUser() user: { businessId: string }) {
    return this.forexService.findAllAccounts(user.businessId);
  }

  /**
   * GET /api/forex/accounts/:id
   * Get a specific forex account.
   */
  @Get('accounts/:id')
  findOneAccount(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.forexService.findOneAccount(user.businessId, id);
  }

  /**
   * PUT /api/forex/accounts/:id
   * Update a forex account.
   */
  @Put('accounts/:id')
  updateAccount(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: {
      name?: string;
      currency?: string;
      balance?: number;
      provider?: string;
      accountNum?: string;
      notes?: string;
    },
  ) {
    return this.forexService.updateAccount(user.businessId, id, dto);
  }

  /**
   * DELETE /api/forex/accounts/:id
   * Delete a forex account.
   */
  @Delete('accounts/:id')
  removeAccount(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.forexService.removeAccount(user.businessId, id);
  }

  // ─── Forex Transfer endpoints ───

  /**
   * POST /api/forex/transfers
   * Record a forex transfer (buy, sell, or transfer between accounts).
   */
  @Post('transfers')
  createTransfer(
    @CurrentUser() user: { businessId: string },
    @Body() dto: {
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
    return this.forexService.createTransfer(user.businessId, dto);
  }

  /**
   * GET /api/forex/transfers?accountId=xxx
   * List all forex transfers, optionally filtered by account.
   */
  @Get('transfers')
  findAllTransfers(
    @CurrentUser() user: { businessId: string },
    @Query('accountId') accountId?: string,
  ) {
    return this.forexService.findAllTransfers(user.businessId, accountId);
  }

  /**
   * PUT /api/forex/transfers/:id
   * Update a forex transfer.
   */
  @Put('transfers/:id')
  updateTransfer(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.forexService.updateTransfer(user.businessId, id, dto);
  }

  /**
   * DELETE /api/forex/transfers/:id
   * Delete a forex transfer.
   */
  @Delete('transfers/:id')
  removeTransfer(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.forexService.removeTransfer(user.businessId, id);
  }
}
