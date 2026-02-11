import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from '../auth/dto/register.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: RegisterDto, emailVerifyToken?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const household = await this.prisma.household.create({
      data: { name: `${dto.name || 'User'}'s Household` },
    });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name ?? null,
        countryCode: dto.countryCode ? dto.countryCode.toUpperCase().slice(0, 2) : null,
        phone: dto.phone?.trim() || null,
        householdId: household.id,
        emailVerifyToken: emailVerifyToken ?? null,
        emailVerifyExp: emailVerifyToken ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
      },
    });
    return { ...user, passwordHash: undefined };
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        householdId: true,
        countryCode: true,
        emailVerified: true,
      },
    });
  }

  async findById(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        householdId: true,
        countryCode: true,
        avatarData: true,
        avatarMime: true,
        emailVerified: true,
        phone: true,
        onboardingCompleted: true,
        twoFactorMethod: true,
      },
    });
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      householdId: u.householdId,
      countryCode: u.countryCode,
      avatarUrl: u.avatarData ? `data:${u.avatarMime || 'image/png'};base64,${u.avatarData}` : null,
      emailVerified: u.emailVerified,
      phone: u.phone,
      onboardingCompleted: u.onboardingCompleted,
      twoFactorMethod: u.twoFactorMethod,
    };
  }

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

  async setVerifyToken(id: string, token: string) {
    await this.prisma.user.update({
      where: { id },
      data: {
        emailVerifyToken: token,
        emailVerifyExp: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  async getDashboardConfig(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { dashboardConfig: true },
    });
    return (u?.dashboardConfig as Record<string, unknown>) ?? null;
  }

  async saveDashboardConfig(id: string, config: unknown) {
    await this.prisma.user.update({
      where: { id },
      data: { dashboardConfig: config as any },
    });
    return { ok: true };
  }

  async update(id: string, dto: { name?: string; email?: string; password?: string; countryCode?: string | null; phone?: string | null }) {
    const data: { name?: string | null; email?: string; passwordHash?: string; countryCode?: string | null; phone?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim() || null;
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email) {
        const existing = await this.prisma.user.findUnique({ where: { email } });
        if (existing && existing.id !== id) throw new ConflictException('Email already in use');
        data.email = email;
      }
    }
    if (dto.password != null && dto.password.length >= 6) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.countryCode !== undefined) {
      data.countryCode = dto.countryCode ? dto.countryCode.toUpperCase().slice(0, 2) : null;
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
        householdId: true,
        countryCode: true,
        avatarData: true,
        avatarMime: true,
        emailVerified: true,
        phone: true,
        onboardingCompleted: true,
        twoFactorMethod: true,
      },
    });
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      householdId: u.householdId,
      countryCode: u.countryCode,
      avatarUrl: u.avatarData ? `data:${u.avatarMime || 'image/png'};base64,${u.avatarData}` : null,
      emailVerified: u.emailVerified,
      phone: u.phone,
      onboardingCompleted: u.onboardingCompleted,
      twoFactorMethod: u.twoFactorMethod,
    };
  }

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
      largeTransactionThreshold: u.largeTransactionThreshold ? Number(u.largeTransactionThreshold) : null,
    };
  }

  async updateNotificationSettings(
    id: string,
    settings: {
      notifyLogin?: boolean;
      notifyLargeTransaction?: boolean;
      notifyBudgetExceeded?: boolean;
      notifyGoalDeadline?: boolean;
      notifyWeeklyReport?: boolean;
      notifyMonthlyReport?: boolean;
      largeTransactionThreshold?: number | null;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (settings.notifyLogin !== undefined) data.notifyLogin = settings.notifyLogin;
    if (settings.notifyLargeTransaction !== undefined) data.notifyLargeTransaction = settings.notifyLargeTransaction;
    if (settings.notifyBudgetExceeded !== undefined) data.notifyBudgetExceeded = settings.notifyBudgetExceeded;
    if (settings.notifyGoalDeadline !== undefined) data.notifyGoalDeadline = settings.notifyGoalDeadline;
    if (settings.notifyWeeklyReport !== undefined) data.notifyWeeklyReport = settings.notifyWeeklyReport;
    if (settings.notifyMonthlyReport !== undefined) data.notifyMonthlyReport = settings.notifyMonthlyReport;
    if (settings.largeTransactionThreshold !== undefined) {
      data.largeTransactionThreshold = settings.largeTransactionThreshold;
    }

    if (Object.keys(data).length === 0) return this.getNotificationSettings(id);

    await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.getNotificationSettings(id);
  }

  async completeOnboarding(id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { onboardingCompleted: true },
    });
    return { onboardingCompleted: true };
  }

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

  async deleteAvatar(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarData: null, avatarMime: null },
    });
    return { avatarUrl: null };
  }

  async getAvatarData(userId: string): Promise<{ data: Buffer; mime: string } | null> {
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
