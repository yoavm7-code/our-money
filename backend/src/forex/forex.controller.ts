import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ForexService } from './forex.service';

@Controller('api/forex')
@UseGuards(JwtAuthGuard)
export class ForexController {
  constructor(private forexService: ForexService) {}

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
}
