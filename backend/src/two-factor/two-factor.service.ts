import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { MessagingService } from '../email/messaging.service';

// Create a TOTP-based authenticator helper compatible with the old otplib v12 API
const authenticator = {
  generateSecret: (): string => generateSecret(),
  keyuri: (accountName: string, issuer: string, secret: string): string =>
    generateURI({ issuer, label: accountName, secret, strategy: 'totp' }),
  verify: ({ token, secret }: { token: string; secret: string }): boolean => {
    try {
      const result = verifySync({ token, secret, strategy: 'totp' });
      return result.valid;
    } catch {
      return false;
    }
  },
};

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private messagingService: MessagingService,
  ) {}

  /**
   * Generate a TOTP secret and QR code for the user.
   * Stores the secret temporarily until verified with enableTwoFactor().
   */
  async generateSecretForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw new BadRequestException('User not found');
    if (user.twoFactorEnabled) throw new BadRequestException('2FA is already enabled');

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(user.email, 'Our Money', secret);

    // Store secret temporarily (not enabled yet until verified)
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    return { secret, qrCode: qrCodeDataUrl };
  }

  /**
   * Verify a TOTP token and enable 2FA for the user.
   */
  async enableTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user) throw new BadRequestException('User not found');
    if (user.twoFactorEnabled) throw new BadRequestException('2FA is already enabled');
    if (!user.twoFactorSecret) throw new BadRequestException('Generate a secret first');

    const isValid = authenticator.verify({ token, secret: user.twoFactorSecret });
    if (!isValid) throw new BadRequestException('Invalid verification code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorMethod: 'totp' },
    });

    return { enabled: true };
  }

  /**
   * Disable 2FA for the user after verifying the provided token.
   */
  async disableTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorMethod: true },
    });
    if (!user) throw new BadRequestException('User not found');
    if (!user.twoFactorEnabled) throw new BadRequestException('2FA is not enabled');

    // For TOTP, verify the token against the secret
    if (user.twoFactorMethod === 'totp') {
      if (!user.twoFactorSecret) throw new BadRequestException('No 2FA secret found');
      const isValid = authenticator.verify({ token, secret: user.twoFactorSecret });
      if (!isValid) throw new BadRequestException('Invalid verification code');
    } else {
      // For email/sms codes, verify against stored code
      if (!this.verifyStoredCode(user.twoFactorSecret, token)) {
        throw new BadRequestException('Invalid verification code');
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorMethod: null },
    });

    return { enabled: false };
  }

  /**
   * Generate a 6-digit code and send it via email.
   */
  async generateEmailCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true, twoFactorMethod: true, countryCode: true },
    });
    if (!user) throw new BadRequestException('User not found');

    const code = this.generateSixDigitCode();
    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    const storedValue = `EMAIL:${code}:${expiry}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: storedValue },
    });

    const locale = user.countryCode === 'IL' ? 'he' : 'en';
    await this.emailService.sendTwoFactorCode(user.email, code, locale);

    return code;
  }

  /**
   * Generate a 6-digit code and send it via SMS/WhatsApp.
   */
  async generateSmsCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, twoFactorEnabled: true, twoFactorMethod: true, countryCode: true },
    });
    if (!user) throw new BadRequestException('User not found');
    if (!user.phone) throw new BadRequestException('No phone number configured');

    const code = this.generateSixDigitCode();
    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    const storedValue = `SMS:${code}:${expiry}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: storedValue },
    });

    const locale = user.countryCode === 'IL' ? 'he' : 'en';
    const result = await this.messagingService.sendVerificationCode(user.phone, code, locale);
    if (!result.success) {
      this.logger.warn(`Failed to send SMS/WhatsApp to ${user.phone} - code logged for debugging: ${code}`);
    }

    return code;
  }

  /**
   * Get the current 2FA method for a user.
   */
  async getTwoFactorMethod(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorMethod: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorEnabled) return null;
    return user.twoFactorMethod;
  }

  /**
   * Set the 2FA method for a user (totp, email, or sms).
   */
  async setTwoFactorMethod(userId: string, method: 'totp' | 'email' | 'sms') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, phone: true },
    });
    if (!user) throw new BadRequestException('User not found');
    if (!user.twoFactorEnabled) throw new BadRequestException('2FA must be enabled first');
    if (method === 'sms' && !user.phone) {
      throw new BadRequestException('Phone number required for SMS 2FA');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorMethod: method },
    });

    return { method };
  }

  /**
   * Verify a 2FA token for a user during login.
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorMethod: true },
    });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) return true;

    const method = user.twoFactorMethod || 'totp';

    if (method === 'totp') {
      return authenticator.verify({ token, secret: user.twoFactorSecret });
    }

    // For email/sms, verify the stored code
    return this.verifyStoredCode(user.twoFactorSecret, token);
  }

  /**
   * Check if 2FA is enabled for a user.
   */
  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    return user?.twoFactorEnabled ?? false;
  }

  /**
   * Send a verification code for login based on the user's configured method.
   */
  async sendCodeForLogin(userId: string): Promise<{ sent: boolean; method: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorMethod: true },
    });
    if (!user?.twoFactorEnabled) throw new BadRequestException('2FA is not enabled');

    const method = user.twoFactorMethod || 'totp';

    if (method === 'email') {
      await this.generateEmailCode(userId);
      return { sent: true, method: 'email' };
    } else if (method === 'sms') {
      await this.generateSmsCode(userId);
      return { sent: true, method: 'sms' };
    }

    // TOTP doesn't need to send a code - the user has the authenticator app
    return { sent: false, method: 'totp' };
  }

  // ─── Private helpers ───

  private generateSixDigitCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private verifyStoredCode(storedSecret: string | null, token: string): boolean {
    if (!storedSecret) return false;

    // Expected format: "EMAIL:123456:1234567890" or "SMS:123456:1234567890"
    const parts = storedSecret.split(':');
    if (parts.length !== 3) return false;

    const [, storedCode, expiryStr] = parts;
    const expiry = parseInt(expiryStr, 10);

    if (Date.now() > expiry) return false;
    return storedCode === token;
  }
}
