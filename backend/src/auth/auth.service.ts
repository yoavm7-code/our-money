import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly twoFactorService: TwoFactorService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Register a new freelancer account.
   * Creates a Business entity and the first User in a single transaction.
   * Sends a verification email.
   */
  async register(dto: RegisterDto) {
    // Check for existing user
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const emailVerifyToken = crypto.randomUUID();
    const emailVerifyExp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create Business + User in a transaction
    const { business, user } = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: dto.businessName?.trim() || `${dto.name || 'My'}'s Business`,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          name: dto.name?.trim() || null,
          countryCode: dto.countryCode
            ? dto.countryCode.toUpperCase().slice(0, 2)
            : null,
          phone: dto.phone?.trim() || null,
          businessId: business.id,
          emailVerifyToken,
          emailVerifyExp,
        },
      });

      return { business, user };
    });

    // Send verification email (non-blocking)
    const locale = dto.countryCode === 'IL' ? 'he' : 'en';
    this.emailService
      .sendVerificationEmail(dto.email, emailVerifyToken, locale)
      .catch((err) => {
        this.logger.error(`Failed to send verification email: ${err.message}`);
      });

    // Return JWT token immediately so the user can start setting up
    const payload = {
      sub: user.id,
      email: user.email,
      businessId: business.id,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessId: business.id,
        businessName: business.name,
        countryCode: user.countryCode,
        isAdmin: user.isAdmin,
      },
      emailVerified: false,
    };
  }

  /**
   * Authenticate a user with email + password.
   * Handles 2FA if enabled. Returns JWT token on success.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        businessId: true,
        countryCode: true,
        emailVerified: true,
        isAdmin: true,
        twoFactorEnabled: true,
        business: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in. Check your inbox for the verification link.',
      );
    }

    // Handle 2FA
    if (user.twoFactorEnabled) {
      if (!dto.twoFactorToken) {
        // Signal that 2FA code is required
        return {
          requiresTwoFactor: true,
          accessToken: null,
          user: null,
        };
      }

      const isTokenValid = await this.twoFactorService.verifyToken(
        user.id,
        dto.twoFactorToken,
      );
      if (!isTokenValid) {
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
    }

    // Generate JWT
    const payload = {
      sub: user.id,
      email: user.email,
      businessId: user.businessId,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessId: user.businessId,
        businessName: user.business.name,
        countryCode: user.countryCode,
        emailVerified: user.emailVerified,
        isAdmin: user.isAdmin,
      },
    };
  }

  /**
   * Verify a user's email address using the token sent via email.
   */
  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { emailVerifyToken: token },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        emailVerifyExp: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (user.emailVerified) {
      return { verified: true, message: 'Email is already verified' };
    }

    // Check token expiry
    if (user.emailVerifyExp && new Date() > new Date(user.emailVerifyExp)) {
      throw new BadRequestException(
        'Verification token has expired. Please request a new one.',
      );
    }

    // Mark email as verified and clear the token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExp: null,
      },
    });

    return { verified: true };
  }

  /**
   * Resend the email verification link.
   * Generates a new token and sends a fresh email.
   */
  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        countryCode: true,
      },
    });

    if (!user) {
      // Don't reveal whether the email exists -- return success either way
      return { sent: true };
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const emailVerifyToken = crypto.randomUUID();
    const emailVerifyExp = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifyToken,
        emailVerifyExp,
      },
    });

    const locale = user.countryCode === 'IL' ? 'he' : 'en';
    await this.emailService.sendVerificationEmail(
      user.email,
      emailVerifyToken,
      locale,
    );

    return { sent: true };
  }

  /**
   * Validate that a user exists (used by JWT strategy).
   * Returns userId and businessId for request context.
   */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        businessId: true,
        isAdmin: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      businessId: user.businessId,
      isAdmin: user.isAdmin,
    };
  }
}
