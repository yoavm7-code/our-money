import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TwoFactorService } from './two-factor.service';
import { MessagingService } from '../email/messaging.service';

@Controller('api/2fa')
@UseGuards(JwtAuthGuard)
export class TwoFactorController {
  constructor(
    private twoFactorService: TwoFactorService,
    private messagingService: MessagingService,
  ) {}

  @Get('status')
  async getStatus(@CurrentUser() user: { id: string }) {
    const enabled = await this.twoFactorService.isTwoFactorEnabled(user.id);
    const method = await this.twoFactorService.getTwoFactorMethod(user.id);
    return { enabled, method };
  }

  @Post('generate')
  async generate(@CurrentUser() user: { id: string }) {
    return this.twoFactorService.generateSecretForUser(user.id);
  }

  @Post('enable')
  async enable(
    @CurrentUser() user: { id: string },
    @Body() body: { token: string },
  ) {
    return this.twoFactorService.enableTwoFactor(user.id, body.token);
  }

  @Post('disable')
  async disable(
    @CurrentUser() user: { id: string },
    @Body() body: { token: string },
  ) {
    return this.twoFactorService.disableTwoFactor(user.id, body.token);
  }

  @Post('send-code')
  async sendCode(@CurrentUser() user: { id: string }) {
    return this.twoFactorService.sendCodeForLogin(user.id);
  }

  @Get('method')
  async getMethod(@CurrentUser() user: { id: string }) {
    const method = await this.twoFactorService.getTwoFactorMethod(user.id);
    return { method };
  }

  @Put('method')
  async setMethod(
    @CurrentUser() user: { id: string },
    @Body() body: { method: 'totp' | 'email' | 'sms' },
  ) {
    return this.twoFactorService.setTwoFactorMethod(user.id, body.method);
  }

  @Get('channels')
  getAvailableChannels() {
    return this.messagingService.getAvailableChannels();
  }
}
