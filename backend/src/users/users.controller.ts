import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

interface RequestUser {
  userId: string;
  email: string;
  businessId: string;
  isAdmin: boolean;
}

@Controller('api/users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /api/users/me - get current user profile with business info */
  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    return this.usersService.findById(user.userId);
  }

  /** PUT /api/users/me - update name, email, password, countryCode, phone */
  @Put('me')
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      name?: string;
      email?: string;
      password?: string;
      countryCode?: string | null;
      phone?: string | null;
    },
  ) {
    return this.usersService.update(user.userId, body);
  }

  /** POST /api/users/me/avatar - upload avatar (file -> base64) */
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP, and GIF images are allowed',
      );
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('File must be under 2MB');
    }
    return this.usersService.uploadAvatar(user.userId, file);
  }

  /** DELETE /api/users/me/avatar - remove avatar */
  @Delete('me/avatar')
  async deleteAvatar(@CurrentUser() user: RequestUser) {
    return this.usersService.deleteAvatar(user.userId);
  }

  /** GET /api/users/me/notification-settings - get notification prefs */
  @Get('me/notification-settings')
  async getNotificationSettings(@CurrentUser() user: RequestUser) {
    return this.usersService.getNotificationSettings(user.userId);
  }

  /** PUT /api/users/me/notification-settings - update notification prefs */
  @Put('me/notification-settings')
  async updateNotificationSettings(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      notifyLogin?: boolean;
      notifyLargeTransaction?: boolean;
      notifyBudgetExceeded?: boolean;
      notifyGoalDeadline?: boolean;
      notifyWeeklyReport?: boolean;
      notifyMonthlyReport?: boolean;
      notifyInvoiceOverdue?: boolean;
      largeTransactionThreshold?: number | null;
    },
  ) {
    return this.usersService.updateNotificationSettings(user.userId, body);
  }

  /** POST /api/users/me/complete-onboarding - mark onboarding done */
  @Post('me/complete-onboarding')
  async completeOnboarding(@CurrentUser() user: RequestUser) {
    return this.usersService.completeOnboarding(user.userId);
  }

  /** GET /api/users/me/dashboard-config - get dashboard widget config */
  @Get('me/dashboard-config')
  async getDashboardConfig(@CurrentUser() user: RequestUser) {
    return this.usersService.getDashboardConfig(user.userId);
  }

  /** PUT /api/users/me/dashboard-config - save dashboard widget config */
  @Put('me/dashboard-config')
  async saveDashboardConfig(
    @CurrentUser() user: RequestUser,
    @Body() body: { widgets: unknown[] },
  ) {
    return this.usersService.saveDashboardConfig(user.userId, body);
  }
}
