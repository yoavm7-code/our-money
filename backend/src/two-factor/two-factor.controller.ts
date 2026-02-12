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

  /**
   * GET /api/2fa/status
   * Check whether 2FA is enabled for the current user and which method is active.
   */
  @Get('status')
  async getStatus(@CurrentUser() user: { userId: string }) {
    const enabled = await this.twoFactorService.isTwoFactorEnabled(user.userId);
    const method = await this.twoFactorService.getTwoFactorMethod(user.userId);
    return { enabled, method };
  }

  /**
   * POST /api/2fa/generate
   * Generate a new TOTP secret and QR code for the user to scan.
   */
  @Post('generate')
  async generate(@CurrentUser() user: { userId: string }) {
    return this.twoFactorService.generateSecretForUser(user.userId);
  }

  /**
   * POST /api/2fa/enable
   * Verify the TOTP token and enable 2FA for the user.
   */
  @Post('enable')
  async enable(
    @CurrentUser() user: { userId: string },
    @Body() body: { token: string },
  ) {
    return this.twoFactorService.enableTwoFactor(user.userId, body.token);
  }

  /**
   * POST /api/2fa/disable
   * Disable 2FA for the user. Requires a valid token for verification.
   */
  @Post('disable')
  async disable(
    @CurrentUser() user: { userId: string },
    @Body() body: { token: string },
  ) {
    return this.twoFactorService.disableTwoFactor(user.userId, body.token);
  }

  /**
   * POST /api/2fa/send-code
   * Send a verification code via the user's configured method (email or SMS).
   */
  @Post('send-code')
  async sendCode(@CurrentUser() user: { userId: string }) {
    return this.twoFactorService.sendCodeForLogin(user.userId);
  }

  /**
   * GET /api/2fa/method
   * Get the current 2FA method for the user.
   */
  @Get('method')
  async getMethod(@CurrentUser() user: { userId: string }) {
    const method = await this.twoFactorService.getTwoFactorMethod(user.userId);
    return { method };
  }

  /**
   * PUT /api/2fa/method
   * Set the 2FA method (totp, email, or sms).
   */
  @Put('method')
  async setMethod(
    @CurrentUser() user: { userId: string },
    @Body() body: { method: 'totp' | 'email' | 'sms' },
  ) {
    return this.twoFactorService.setTwoFactorMethod(user.userId, body.method);
  }

  /**
   * GET /api/2fa/channels
   * Get available messaging channels (WhatsApp, SMS).
   */
  @Get('channels')
  getAvailableChannels() {
    return this.messagingService.getAvailableChannels();
  }
}
