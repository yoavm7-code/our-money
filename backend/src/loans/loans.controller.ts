import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LoansService } from './loans.service';

@Controller('api/loans')
@UseGuards(JwtAuthGuard)
export class LoansController {
  constructor(private loansService: LoansService) {}

  /**
   * POST /api/loans
   * Create a new loan for the business.
   */
  @Post()
  create(
    @CurrentUser() user: { businessId: string },
    @Body() dto: {
      name: string;
      lender?: string;
      originalAmount: number;
      remainingAmount: number;
      interestRate?: number;
      monthlyPayment?: number;
      startDate?: string;
      endDate?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.loansService.create(user.businessId, dto);
  }

  /**
   * GET /api/loans
   * List all active loans for the business.
   */
  @Get()
  findAll(@CurrentUser() user: { businessId: string }) {
    return this.loansService.findAll(user.businessId);
  }

  /**
   * GET /api/loans/:id
   * Get a specific loan by ID.
   */
  @Get(':id')
  findOne(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.loansService.findOne(user.businessId, id);
  }

  /**
   * PUT /api/loans/:id
   * Update a loan.
   */
  @Put(':id')
  update(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
    @Body() dto: {
      name?: string;
      lender?: string;
      originalAmount?: number;
      remainingAmount?: number;
      interestRate?: number;
      monthlyPayment?: number;
      startDate?: string;
      endDate?: string;
      currency?: string;
      notes?: string;
    },
  ) {
    return this.loansService.update(user.businessId, id, dto);
  }

  /**
   * DELETE /api/loans/:id
   * Soft-delete a loan (set isActive = false).
   */
  @Delete(':id')
  remove(@CurrentUser() user: { businessId: string }, @Param('id') id: string) {
    return this.loansService.remove(user.businessId, id);
  }
}
