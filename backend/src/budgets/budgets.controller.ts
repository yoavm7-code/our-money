import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BudgetsService } from './budgets.service';

@Controller('api/budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private service: BudgetsService) {}

  /**
   * GET /api/budgets
   * List all active budgets with category info and current month spending.
   */
  @Get()
  async list(@CurrentUser() user: { businessId: string }) {
    return this.service.list(user.businessId);
  }

  /**
   * POST /api/budgets
   * Create or update (upsert) a monthly budget for a category.
   */
  @Post()
  async upsert(
    @CurrentUser() user: { businessId: string },
    @Body() body: { categoryId: string; amount: number },
  ) {
    return this.service.upsert(user.businessId, body);
  }

  /**
   * DELETE /api/budgets/:id
   * Soft-delete a budget (set isActive = false).
   */
  @Delete(':id')
  async remove(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
  ) {
    return this.service.remove(user.businessId, id);
  }

  /**
   * GET /api/budgets/summary
   * Get a budget summary for a specific month (YYYY-MM format).
   * Defaults to current month if no month query param is provided.
   */
  @Get('summary')
  async summary(
    @CurrentUser() user: { businessId: string },
    @Query('month') month?: string,
  ) {
    return this.service.getSummary(user.businessId, month);
  }
}
