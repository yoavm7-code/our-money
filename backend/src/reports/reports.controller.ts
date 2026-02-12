import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { ReportsService } from './reports.service';

@Controller('api/reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('profit-loss')
  getProfitLoss(
    @HouseholdId() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const defaultTo = new Date().toISOString().slice(0, 10);
    return this.reportsService.getProfitLoss(
      businessId,
      from || defaultFrom,
      to || defaultTo,
    );
  }

  @Get('cash-flow')
  getCashFlow(
    @HouseholdId() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const defaultTo = new Date().toISOString().slice(0, 10);
    return this.reportsService.getCashFlowReport(
      businessId,
      from || defaultFrom,
      to || defaultTo,
    );
  }

  @Get('client-revenue')
  getClientRevenue(
    @HouseholdId() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const defaultFrom = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const defaultTo = new Date().toISOString().slice(0, 10);
    return this.reportsService.getClientRevenue(
      businessId,
      from || defaultFrom,
      to || defaultTo,
    );
  }

  @Get('category-breakdown')
  getCategoryBreakdown(
    @HouseholdId() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const defaultTo = new Date().toISOString().slice(0, 10);
    return this.reportsService.getCategoryBreakdown(
      businessId,
      from || defaultFrom,
      to || defaultTo,
    );
  }

  @Get('tax-summary')
  getTaxSummary(
    @HouseholdId() businessId: string,
    @Query('year') year?: string,
  ) {
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.reportsService.getTaxSummary(businessId, targetYear);
  }

  @Get('forecast')
  getForecast(@HouseholdId() businessId: string) {
    return this.reportsService.getForecast(businessId);
  }
}
