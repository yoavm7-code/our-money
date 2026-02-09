import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: { id: string }) {
    return this.usersService.findById(user.id);
  }

  @Put('me')
  async updateMe(
    @CurrentUser() user: { id: string },
    @Body() body: { name?: string; email?: string; password?: string; countryCode?: string | null },
  ) {
    return this.usersService.update(user.id, body);
  }

  @Get('me/dashboard-config')
  async getDashboardConfig(@CurrentUser() user: { id: string }) {
    return this.usersService.getDashboardConfig(user.id);
  }

  @Put('me/dashboard-config')
  async saveDashboardConfig(
    @CurrentUser() user: { id: string },
    @Body() body: { widgets: unknown[] },
  ) {
    return this.usersService.saveDashboardConfig(user.id, body);
  }
}
