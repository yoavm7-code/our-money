import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { CaptchaService } from '../captcha/captcha.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private captchaService: CaptchaService,
    private twoFactorService: TwoFactorService,
    private emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const captchaOk = await this.captchaService.verify(dto.captchaToken);
    if (!captchaOk) throw new BadRequestException('Captcha verification failed. Please try again.');

    // Generate email verification token
    const emailVerifyToken = crypto.randomUUID();
    const user = await this.usersService.create(dto, emailVerifyToken);

    // Send verification email (non-blocking)
    this.emailService
      .sendVerificationEmail(dto.email, emailVerifyToken, dto.countryCode === 'IL' ? 'he' : 'en')
      .catch(() => {});

    const response = await this.loginResponse(user);
    return { ...response, emailVerified: false };
  }

  async login(dto: LoginDto) {
    const captchaOk = await this.captchaService.verify(dto.captchaToken);
    if (!captchaOk) throw new BadRequestException('Captcha verification failed. Please try again.');
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    // Check if 2FA is enabled
    const has2FA = await this.twoFactorService.isTwoFactorEnabled(user.id);
    if (has2FA) {
      if (!dto.twoFactorToken) {
        // Return a signal that 2FA is required (no token yet)
        return { requiresTwoFactor: true, accessToken: null, user: null };
      }
      const tokenValid = await this.twoFactorService.verifyToken(user.id, dto.twoFactorToken);
      if (!tokenValid) throw new UnauthorizedException('Invalid 2FA code');
    }

    const response = await this.loginResponse(user);
    return { ...response, emailVerified: user.emailVerified ?? false };
  }

  async verifyEmail(token: string) {
    const user = await this.usersService.findByVerifyToken(token);
    if (!user) throw new BadRequestException('Invalid or expired verification token');

    // Check expiry
    if (user.emailVerifyExp && new Date() > new Date(user.emailVerifyExp)) {
      throw new BadRequestException('Verification token has expired');
    }

    await this.usersService.update(user.id, {});
    // We need a direct prisma call to clear the token and set verified
    await this.usersService.markEmailVerified(user.id);

    return { verified: true };
  }

  async resendVerification(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');
    if (user.emailVerified) throw new BadRequestException('Email is already verified');

    const emailVerifyToken = crypto.randomUUID();
    await this.usersService.setVerifyToken(userId, emailVerifyToken);

    await this.emailService.sendVerificationEmail(
      user.email,
      emailVerifyToken,
      user.countryCode === 'IL' ? 'he' : 'en',
    );

    return { sent: true };
  }

  private async loginResponse(user: { id: string; email: string; name: string | null; householdId: string; countryCode?: string | null; isAdmin?: boolean }) {
    const payload = { sub: user.id, email: user.email, householdId: user.householdId };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        householdId: user.householdId,
        countryCode: user.countryCode ?? undefined,
        isAdmin: user.isAdmin ?? false,
      },
    };
  }

  async validateUser(userId: string) {
    return this.usersService.findById(userId);
  }
}
