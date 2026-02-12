import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RecurringService } from './recurring.service';

@Controller('api/recurring')
@UseGuards(JwtAuthGuard)
export class RecurringController {
  constructor(private service: RecurringService) {}

  /**
   * POST /api/recurring/detect
   * Analyze recent transactions and auto-detect recurring patterns
   * (monthly subscriptions, regular income, etc.).
   */
  @Post('detect')
  async detect(@CurrentUser() user: { businessId: string }) {
    return this.service.detect(user.businessId);
  }

  /**
   * GET /api/recurring
   * List all detected (non-dismissed) recurring patterns.
   */
  @Get()
  async list(@CurrentUser() user: { businessId: string }) {
    return this.service.list(user.businessId);
  }

  /**
   * POST /api/recurring/:id/confirm
   * Confirm a recurring pattern and mark matching transactions as recurring.
   */
  @Post(':id/confirm')
  async confirm(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
  ) {
    return this.service.confirm(user.businessId, id);
  }

  /**
   * POST /api/recurring/:id/dismiss
   * Dismiss a recurring pattern so it won't appear again.
   */
  @Post(':id/dismiss')
  async dismiss(
    @CurrentUser() user: { businessId: string },
    @Param('id') id: string,
  ) {
    return this.service.dismiss(user.businessId, id);
  }
}
