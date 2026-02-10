import { Controller, Get, Post, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecurringService } from './recurring.service';

@Controller('api/recurring')
@UseGuards(AuthGuard('jwt'))
export class RecurringController {
  constructor(private service: RecurringService) {}

  @Post('detect')
  async detect(@Req() req: any) {
    return this.service.detect(req.user.householdId);
  }

  @Get()
  async list(@Req() req: any) {
    return this.service.list(req.user.householdId);
  }

  @Post(':id/confirm')
  async confirm(@Req() req: any, @Param('id') id: string) {
    return this.service.confirm(req.user.householdId, id);
  }

  @Post(':id/dismiss')
  async dismiss(@Req() req: any, @Param('id') id: string) {
    return this.service.dismiss(req.user.householdId, id);
  }
}
