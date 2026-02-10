import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { DashboardService } from './dashboard.service';

@Controller('api/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @HouseholdId() householdId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.dashboardService.getSummary(householdId, from, to, accountId, categoryId);
  }

  @Get('trends')
  getTrends(
    @HouseholdId() householdId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy?: 'month' | 'year',
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const start = from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = to || new Date().toISOString().slice(0, 10);
    return this.dashboardService.getTrends(householdId, start, end, groupBy || 'month', accountId, categoryId);
  }

  @Get('recent-transactions')
  getRecentTransactions(@HouseholdId() householdId: string) {
    return this.dashboardService.getRecentTransactions(householdId);
  }

  @Get('search')
  search(
    @HouseholdId() householdId: string,
    @Query('q') q?: string,
  ) {
    return this.dashboardService.search(householdId, q ?? '');
  }

  @Get('fixed-expenses')
  getFixedExpenses(@HouseholdId() householdId: string) {
    return this.dashboardService.getFixedExpenses(householdId);
  }

  @Get('fixed-income')
  getFixedIncome(@HouseholdId() householdId: string) {
    return this.dashboardService.getFixedIncome(householdId);
  }

  @Get('report')
  getReport(
    @HouseholdId() householdId: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getReport(householdId, month, from, to);
  }
}
