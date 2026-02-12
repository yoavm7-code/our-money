import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SavingsService } from './savings.service';

@Controller('api/savings')
@UseGuards(JwtAuthGuard)
export class SavingsController {
  constructor(private savingsService: SavingsService) {}

  /**
   * POST /api/savings
   * Create a new savings goal for the business.
   */
  @Post()
  create(
    @CurrentUser() user: { businessId: string },
    @Body() dto: {
      name: string;
      targetAmount?: number;
      currentAmount?: number;
      interestRate?: number;
      startDate?: string;
      targetDate?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.savingsService.create(user.businessId, dto);
  }

  /**
   * GET /api/savings
   * List all active savings goals for the business.
   */
  @Get()
  findAll(@CurrentUser() user: { businessId: string }) {
    return this.savingsService.findAll(user.businessId);
  }

  /**
   * GET /api/savings/:id
   * Get a specific savings goal by ID.
   */
  @Get(':id')
  findOne(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.savingsService.findOne(user.businessId, id);
  }

  /**
   * PUT /api/savings/:id
   * Update a savings goal.
   */
  @Put(':id')
  update(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: {
      name?: string;
      targetAmount?: number;
      currentAmount?: number;
      interestRate?: number;
      startDate?: string;
      targetDate?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.savingsService.update(user.businessId, id, dto);
  }

  /**
   * DELETE /api/savings/:id
   * Soft-delete a savings goal.
   */
  @Delete(':id')
  remove(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.savingsService.remove(user.businessId, id);
  }
}
