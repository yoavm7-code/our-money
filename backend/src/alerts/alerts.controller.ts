import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AlertsService } from './alerts.service';

@Controller('api/alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private service: AlertsService) {}

  /**
   * GET /api/alerts
   * Generate and return all active alerts for the business.
   * Alerts are dynamically computed (not stored) based on current data.
   */
  @Get()
  async getAlerts(@CurrentUser() user: { businessId: string }) {
    return this.service.generate(user.businessId);
  }
}
