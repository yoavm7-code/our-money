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
    @HouseholdId() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.dashboardService.getSummary(businessId, from, to, accountId, categoryId);
  }

  @Get('trends')
  getTrends(
    @HouseholdId() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: 'month' | 'year',
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const start = from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = to || new Date().toISOString().slice(0, 10);
    return this.dashboardService.getTrends(businessId, start, end, groupBy || 'month', accountId, categoryId);
  }

  @Get('recent-transactions')
  getRecentTransactions(@HouseholdId() businessId: string) {
    return this.dashboardService.getRecentTransactions(businessId);
  }

  @Get('cash-flow')
  getCashFlow(@HouseholdId() businessId: string) {
    return this.dashboardService.getCashFlow(businessId);
  }

  @Get('fixed-items')
  getFixedItems(@HouseholdId() businessId: string) {
    return this.dashboardService.getFixedItems(businessId);
  }

  @Get('search')
  search(
    @HouseholdId() businessId: string,
    @Query('q') q?: string,
  ) {
    return this.dashboardService.search(businessId, q ?? '');
  }
}
