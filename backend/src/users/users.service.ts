import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from '../auth/dto/register.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a new user with a new business entity. */
  async create(dto: RegisterDto, emailVerifyToken?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const business = await this.prisma.business.create({
      data: { name: `${dto.name || 'User'}'s Business` },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name ?? null,
        countryCode: dto.countryCode
          ? dto.countryCode.toUpperCase().slice(0, 2)
          : null,
        phone: dto.phone?.trim() || null,
        businessId: business.id,
        emailVerifyToken: emailVerifyToken ?? null,
        emailVerifyExp: emailVerifyToken
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : null,
      },
    });

    return { ...user, passwordHash: undefined };
  }

  /** Find user by email (for login). */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        businessId: true,
        countryCode: true,
        emailVerified: true,
        isAdmin: true,
      },
    });
  }

  /** Find user by ID with business info. */
  async findById(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        businessId: true,
        countryCode: true,
        avatarData: true,
        avatarMime: true,
        emailVerified: true,
        phone: true,
        onboardingCompleted: true,
        twoFactorMethod: true,
        isAdmin: true,
        business: {
          select: {
            id: true,
            name: true,
            businessNumber: true,
            vatId: true,
            address: true,
            phone: true,
            email: true,
            defaultCurrency: true,
            vatRate: true,
          },
        },
      },
    });
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      businessId: u.businessId,
      countryCode: u.countryCode,
      avatarUrl: u.avatarData
        ? `data:${u.avatarMime || 'image/png'};base64,${u.avatarData}`
        : null,
      emailVerified: u.emailVerified,
      phone: u.phone,
      onboardingCompleted: u.onboardingCompleted,
      twoFactorMethod: u.twoFactorMethod,
      isAdmin: u.isAdmin,
      business: u.business
        ? {
            id: u.business.id,
            name: u.business.name,
            businessNumber: u.business.businessNumber,
            vatId: u.business.vatId,
            address: u.business.address,
            phone: u.business.phone,
            email: u.business.email,
            defaultCurrency: u.business.defaultCurrency,
            vatRate: u.business.vatRate ? Number(u.business.vatRate) : null,
          }
        : null,
    };
  }

  /** Find user by email-verification token. */
  async findByVerifyToken(token: string) {
    return this.prisma.user.findFirst({
      where: { emailVerifyToken: token },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        emailVerifyExp: true,
      },
    });
  }

  /** Mark a user's email as verified and clear the token. */
  async markEmailVerified(id: string) {
    await this.prisma.user.update({
      where: { id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExp: null,
      },
    });
  }

  /** Set a new email-verification token. */
  async setVerifyToken(id: string, token: string) {
    await this.prisma.user.update({
      where: { id },
      data: {
        emailVerifyToken: token,
        emailVerifyExp: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  /** Get dashboard widget configuration. */
  async getDashboardConfig(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { dashboardConfig: true },
    });
    return (u?.dashboardConfig as Record<string, unknown>) ?? null;
  }

  /** Save dashboard widget configuration. */
  async saveDashboardConfig(id: string, config: unknown) {
    await this.prisma.user.update({
      where: { id },
      data: { dashboardConfig: config as any },
    });
    return { ok: true };
  }

  /** Update user profile fields. */
  async update(
    id: string,
    dto: {
      name?: string;
      email?: string;
      password?: string;
      countryCode?: string | null;
      phone?: string | null;
    },
  ) {
    const data: {
      name?: string | null;
      email?: string;
      passwordHash?: string;
      countryCode?: string | null;
      phone?: string | null;
    } = {};

    if (dto.name !== undefined) data.name = dto.name.trim() || null;

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email) {
        const existing = await this.prisma.user.findUnique({
          where: { email },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException('Email already in use');
        }
        data.email = email;
      }
    }

    if (dto.password != null && dto.password.length >= 6) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.countryCode !== undefined) {
      data.countryCode = dto.countryCode
        ? dto.countryCode.toUpperCase().slice(0, 2)
        : null;
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone ? dto.phone.trim() : null;
    }

    if (Object.keys(data).length === 0) return this.findById(id);

    const u = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        businessId: true,
        countryCode: true,
        avatarData: true,
        avatarMime: true,
        emailVerified: true,
        phone: true,
        onboardingCompleted: true,
        twoFactorMethod: true,
        isAdmin: true,
      },
    });

    return {
      id: u.id,
      email: u.email,
      name: u.name,
      businessId: u.businessId,
      countryCode: u.countryCode,
      avatarUrl: u.avatarData
        ? `data:${u.avatarMime || 'image/png'};base64,${u.avatarData}`
        : null,
      emailVerified: u.emailVerified,
      phone: u.phone,
      onboardingCompleted: u.onboardingCompleted,
      twoFactorMethod: u.twoFactorMethod,
      isAdmin: u.isAdmin,
    };
  }

  /** Get notification settings for a user. */
  async getNotificationSettings(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        notifyLogin: true,
        notifyLargeTransaction: true,
        notifyBudgetExceeded: true,
        notifyGoalDeadline: true,
        notifyWeeklyReport: true,
        notifyMonthlyReport: true,
        notifyInvoiceOverdue: true,
        largeTransactionThreshold: true,
      },
    });
    if (!u) return null;
    return {
      notifyLogin: u.notifyLogin,
      notifyLargeTransaction: u.notifyLargeTransaction,
      notifyBudgetExceeded: u.notifyBudgetExceeded,
      notifyGoalDeadline: u.notifyGoalDeadline,
      notifyWeeklyReport: u.notifyWeeklyReport,
      notifyMonthlyReport: u.notifyMonthlyReport,
      notifyInvoiceOverdue: u.notifyInvoiceOverdue,
      largeTransactionThreshold: u.largeTransactionThreshold
        ? Number(u.largeTransactionThreshold)
        : null,
    };
  }

  /** Update notification settings for a user. */
  async updateNotificationSettings(
    id: string,
    settings: {
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
    const data: Record<string, unknown> = {};
    if (settings.notifyLogin !== undefined)
      data.notifyLogin = settings.notifyLogin;
    if (settings.notifyLargeTransaction !== undefined)
      data.notifyLargeTransaction = settings.notifyLargeTransaction;
    if (settings.notifyBudgetExceeded !== undefined)
      data.notifyBudgetExceeded = settings.notifyBudgetExceeded;
    if (settings.notifyGoalDeadline !== undefined)
      data.notifyGoalDeadline = settings.notifyGoalDeadline;
    if (settings.notifyWeeklyReport !== undefined)
      data.notifyWeeklyReport = settings.notifyWeeklyReport;
    if (settings.notifyMonthlyReport !== undefined)
      data.notifyMonthlyReport = settings.notifyMonthlyReport;
    if (settings.notifyInvoiceOverdue !== undefined)
      data.notifyInvoiceOverdue = settings.notifyInvoiceOverdue;
    if (settings.largeTransactionThreshold !== undefined) {
      data.largeTransactionThreshold = settings.largeTransactionThreshold;
    }

    if (Object.keys(data).length === 0)
      return this.getNotificationSettings(id);

    await this.prisma.user.update({ where: { id }, data });
    return this.getNotificationSettings(id);
  }

  /** Mark user onboarding as completed. */
  async completeOnboarding(id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { onboardingCompleted: true },
    });
    return { onboardingCompleted: true };
  }

  /** Upload avatar as base64 stored in the database. */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const base64 = file.buffer.toString('base64');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarData: base64,
        avatarMime: file.mimetype,
      },
    });
    return { avatarUrl: `data:${file.mimetype};base64,${base64}` };
  }

  /** Remove the user's avatar. */
  async deleteAvatar(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarData: null, avatarMime: null },
    });
    return { avatarUrl: null };
  }

  /** Retrieve raw avatar data (buffer + MIME type). */
  async getAvatarData(
    userId: string,
  ): Promise<{ data: Buffer; mime: string } | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarData: true, avatarMime: true },
    });
    if (!u?.avatarData) return null;
    return {
      data: Buffer.from(u.avatarData, 'base64'),
      mime: u.avatarMime || 'image/png',
    };
  }
}
