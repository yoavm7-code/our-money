import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { ForexService } from './forex.service';
import { CreateForexAccountDto } from './dto/create-forex-account.dto';
import { UpdateForexAccountDto } from './dto/update-forex-account.dto';
import { CreateForexTransferDto } from './dto/create-forex-transfer.dto';
import { UpdateForexTransferDto } from './dto/update-forex-transfer.dto';

@Controller('api/forex')
@UseGuards(JwtAuthGuard)
export class ForexController {
  constructor(private forexService: ForexService) {}

  // ─── Exchange Rate endpoints ───

  @Get('rates')
  async getRates(@Query('base') base?: string) {
    return this.forexService.getRates(base || 'ILS');
  }

  @Get('convert')
  async convert(
    @Query('amount') amount: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.forexService.convert(parseFloat(amount) || 0, from || 'ILS', to || 'USD');
  }

  @Get('history')
  async getHistory(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.forexService.getHistory(from || 'ILS', to || 'USD', start, end);
  }

  @Get('currencies')
  async getCurrencies() {
    return this.forexService.getCurrencies();
  }

  // ─── Forex Account endpoints ───

  @Post('accounts')
  createAccount(@HouseholdId() householdId: string, @Body() dto: CreateForexAccountDto) {
    return this.forexService.createAccount(householdId, dto);
  }

  @Get('accounts')
  findAllAccounts(@HouseholdId() householdId: string) {
    return this.forexService.findAllAccounts(householdId);
  }

  @Get('accounts/:id')
  findOneAccount(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.forexService.findOneAccount(householdId, id);
  }

  @Put('accounts/:id')
  updateAccount(@HouseholdId() householdId: string, @Param('id') id: string, @Body() dto: UpdateForexAccountDto) {
    return this.forexService.updateAccount(householdId, id, dto);
  }

  @Delete('accounts/:id')
  removeAccount(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.forexService.removeAccount(householdId, id);
  }

  // ─── Forex Transfer endpoints ───

  @Post('transfers')
  createTransfer(@HouseholdId() householdId: string, @Body() dto: CreateForexTransferDto) {
    return this.forexService.createTransfer(householdId, dto);
  }

  @Get('transfers')
  findAllTransfers(@HouseholdId() householdId: string, @Query('accountId') accountId?: string) {
    return this.forexService.findAllTransfers(householdId, accountId);
  }

  @Put('transfers/:id')
  updateTransfer(@HouseholdId() householdId: string, @Param('id') id: string, @Body() dto: UpdateForexTransferDto) {
    return this.forexService.updateTransfer(householdId, id, dto);
  }

  @Delete('transfers/:id')
  removeTransfer(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.forexService.removeTransfer(householdId, id);
  }
}
