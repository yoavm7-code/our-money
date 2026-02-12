import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AlertsService } from './alerts.service';

@Controller('api/alerts')
@UseGuards(AuthGuard('jwt'))
export class AlertsController {
  constructor(private service: AlertsService) {}

  @Get()
  async getAlerts(@Req() req: any) {
    return this.service.generate(req.user.householdId);
  }
}
