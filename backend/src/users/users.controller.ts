import { Body, Controller, Delete, Get, Post, Put, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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
    @Body() body: { name?: string; email?: string; password?: string; countryCode?: string | null; phone?: string | null },
  ) {
    return this.usersService.update(user.id, body);
  }

  @Get('me/notification-settings')
  async getNotificationSettings(@CurrentUser() user: { id: string }) {
    return this.usersService.getNotificationSettings(user.id);
  }

  @Put('me/notification-settings')
  async updateNotificationSettings(
    @CurrentUser() user: { id: string },
    @Body() body: {
      notifyLogin?: boolean;
      notifyLargeTransaction?: boolean;
      notifyBudgetExceeded?: boolean;
      notifyGoalDeadline?: boolean;
      notifyWeeklyReport?: boolean;
      notifyMonthlyReport?: boolean;
      largeTransactionThreshold?: number | null;
    },
  ) {
    return this.usersService.updateNotificationSettings(user.id, body);
  }

  @Post('me/complete-onboarding')
  async completeOnboarding(@CurrentUser() user: { id: string }) {
    return this.usersService.completeOnboarding(user.id);
  }

  @Get('me/avatar')
  async getAvatar(
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    const avatar = await this.usersService.getAvatarData(user.id);
    if (!avatar) {
      res.status(404).json({ message: 'No avatar' });
      return;
    }
    res.set('Content-Type', avatar.mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(avatar.data);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed');
    if (file.size > 2 * 1024 * 1024) throw new BadRequestException('File must be under 2MB');
    return this.usersService.uploadAvatar(user.id, file);
  }

  @Delete('me/avatar')
  async deleteAvatar(@CurrentUser() user: { id: string }) {
    return this.usersService.deleteAvatar(user.id);
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
