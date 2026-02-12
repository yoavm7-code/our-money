import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ─── Admin Setup ──────────────────────────────────────────────────

  async promoteToAdmin(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException(`User with email ${email} not found`);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true },
    });
    return { success: true, email, isAdmin: true };
  }

  // ─── User Management ────────────────────────────────────────────────

  async listUsers(search?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          business: {
            select: { name: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Enrich with business-level counts
    const businessIds = [...new Set(users.map((u) => u.businessId))];
    const [txCounts, accCounts] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['businessId'],
        where: { businessId: { in: businessIds } },
        _count: true,
      }),
      this.prisma.account.groupBy({
        by: ['businessId'],
        where: { businessId: { in: businessIds } },
        _count: true,
      }),
    ]);

    const txMap = new Map(txCounts.map((t) => [t.businessId, t._count]));
    const accMap = new Map(accCounts.map((a) => [a.businessId, a._count]));

    const items = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      countryCode: u.countryCode,
      phone: u.phone,
      avatarUrl: null as string | null,
      isAdmin: u.isAdmin,
      emailVerified: u.emailVerified,
      twoFactorMethod: u.twoFactorEnabled ? (u.twoFactorMethod || 'TOTP') : null,
      createdAt: u.createdAt,
      businessId: u.businessId,
      businessName: u.business.name,
      _count: {
        accounts: accMap.get(u.businessId) ?? 0,
        transactions: txMap.get(u.businessId) ?? 0,
      },
    }));

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        countryCode: true,
        phone: true,
        isAdmin: true,
        emailVerified: true,
        twoFactorEnabled: true,
        twoFactorMethod: true,
        onboardingCompleted: true,
        dashboardConfig: true,
        createdAt: true,
        updatedAt: true,
        businessId: true,
        business: {
          select: { id: true, name: true, createdAt: true },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const businessId = user.businessId;

    const [
      accountsCount,
      transactionsCount,
      categoriesCount,
      goalsCount,
      budgetsCount,
      loansCount,
      savingsCount,
      stockPortfoliosCount,
      invoicesCount,
      clientsCount,
      totalBalance,
    ] = await Promise.all([
      this.prisma.account.count({ where: { businessId } }),
      this.prisma.transaction.count({ where: { businessId } }),
      this.prisma.category.count({ where: { businessId } }),
      this.prisma.goal.count({ where: { businessId } }),
      this.prisma.budget.count({ where: { businessId } }),
      this.prisma.loan.count({ where: { businessId } }),
      this.prisma.saving.count({ where: { businessId } }),
      this.prisma.stockPortfolio.count({ where: { businessId } }),
      this.prisma.invoice.count({ where: { businessId } }),
      this.prisma.client.count({ where: { businessId } }),
      this.prisma.account.aggregate({
        where: { businessId },
        _sum: { balance: true },
      }),
    ]);

    return {
      ...user,
      businessSummary: {
        accountsCount,
        transactionsCount,
        totalBalance: totalBalance._sum.balance ?? 0,
        categoriesCount,
        goalsCount,
        budgetsCount,
        loansCount,
        savingsCount,
        stockPortfoliosCount,
        invoicesCount,
        clientsCount,
      },
    };
  }

  async updateUser(
    userId: string,
    dto: {
      name?: string;
      email?: string;
      countryCode?: string;
      phone?: string;
      isAdmin?: boolean;
      emailVerified?: boolean;
    },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('User not found');

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim() || null;
    }
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const dup = await this.prisma.user.findUnique({ where: { email } });
      if (dup && dup.id !== userId) {
        throw new ConflictException('Email already in use');
      }
      data.email = email;
    }
    if (dto.countryCode !== undefined) {
      data.countryCode = dto.countryCode
        ? dto.countryCode.toUpperCase().slice(0, 2)
        : null;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone ? dto.phone.trim() : null;
    }
    if (dto.isAdmin !== undefined) {
      data.isAdmin = dto.isAdmin;
    }
    if (dto.emailVerified !== undefined) {
      data.emailVerified = dto.emailVerified;
    }

    if (Object.keys(data).length === 0) {
      return this.getUser(userId);
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getUser(userId);
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, businessId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Delete the business (cascades to all related data) and the user
    await this.prisma.business.delete({ where: { id: user.businessId } });

    return { deleted: true };
  }

  async createUser(dto: {
    email: string;
    password: string;
    name?: string;
    countryCode?: string;
    isAdmin?: boolean;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const business = await this.prisma.business.create({
      data: { name: `${dto.name || 'User'}'s Business` },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        name: dto.name?.trim() || null,
        countryCode: dto.countryCode
          ? dto.countryCode.toUpperCase().slice(0, 2)
          : null,
        isAdmin: dto.isAdmin ?? false,
        businessId: business.id,
        emailVerified: true, // Admin-created users are pre-verified
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      countryCode: user.countryCode,
      isAdmin: user.isAdmin,
      businessId: user.businessId,
      createdAt: user.createdAt,
    };
  }

  async resetPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { reset: true };
  }

  // ─── Data Management ────────────────────────────────────────────────

  private readonly DATA_TYPE_TO_MODEL: Record<string, string> = {
    accounts: 'account',
    transactions: 'transaction',
    categories: 'category',
    goals: 'goal',
    budgets: 'budget',
    loans: 'loan',
    savings: 'saving',
    stockPortfolios: 'stockPortfolio',
    invoices: 'invoice',
    clients: 'client',
  };

  private getModel(modelName: string) {
    return (this.prisma as any)[modelName];
  }

  async getUserData(
    userId: string,
    dataType: string,
    page = 1,
    limit = 50,
  ) {
    const prismaModel = this.DATA_TYPE_TO_MODEL[dataType];
    if (!prismaModel) {
      throw new BadRequestException(
        `Invalid data type. Allowed: ${Object.keys(this.DATA_TYPE_TO_MODEL).join(', ')}`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const skip = (page - 1) * limit;
    const businessId = user.businessId;

    const model = this.getModel(prismaModel);
    const [items, total] = await Promise.all([
      model.findMany({
        where: { businessId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        ...(dataType === 'transactions'
          ? { include: { account: true, category: true } }
          : {}),
        ...(dataType === 'stockPortfolios'
          ? { include: { holdings: true } }
          : {}),
        ...(dataType === 'budgets'
          ? { include: { category: true } }
          : {}),
        ...(dataType === 'invoices'
          ? { include: { client: true } }
          : {}),
      }),
      model.count({ where: { businessId } }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private readonly ALLOWED_TABLES: Record<string, string> = {
    accounts: 'account',
    transactions: 'transaction',
    categories: 'category',
    goals: 'goal',
    budgets: 'budget',
    loans: 'loan',
    savings: 'saving',
    stockPortfolios: 'stockPortfolio',
    invoices: 'invoice',
    clients: 'client',
  };

  async deleteRecord(tableName: string, recordId: string) {
    const prismaModel = this.ALLOWED_TABLES[tableName];
    if (!prismaModel) {
      throw new BadRequestException(
        `Invalid table. Allowed: ${Object.keys(this.ALLOWED_TABLES).join(', ')}`,
      );
    }

    const model = this.getModel(prismaModel);

    const record = await model.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Record not found');

    await model.delete({ where: { id: recordId } });

    return { deleted: true, table: tableName, id: recordId };
  }

  async backupUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        countryCode: true,
        phone: true,
        isAdmin: true,
        emailVerified: true,
        twoFactorEnabled: true,
        twoFactorMethod: true,
        onboardingCompleted: true,
        createdAt: true,
        updatedAt: true,
        businessId: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const businessId = user.businessId;

    const [
      business,
      accounts,
      transactions,
      categories,
      goals,
      budgets,
      loans,
      savings,
      stockPortfolios,
      forexAccounts,
      forexTransfers,
      recurringPatterns,
      documents,
      invoices,
      clients,
    ] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: businessId } }),
      this.prisma.account.findMany({ where: { businessId } }),
      this.prisma.transaction.findMany({
        where: { businessId },
        include: { account: true, category: true },
      }),
      this.prisma.category.findMany({ where: { businessId } }),
      this.prisma.goal.findMany({ where: { businessId } }),
      this.prisma.budget.findMany({
        where: { businessId },
        include: { category: true },
      }),
      this.prisma.loan.findMany({ where: { businessId } }),
      this.prisma.saving.findMany({ where: { businessId } }),
      this.prisma.stockPortfolio.findMany({
        where: { businessId },
        include: { holdings: true },
      }),
      this.prisma.forexAccount.findMany({ where: { businessId } }),
      this.prisma.forexTransfer.findMany({ where: { businessId } }),
      this.prisma.recurringPattern.findMany({ where: { businessId } }),
      this.prisma.document.findMany({ where: { businessId } }),
      this.prisma.invoice.findMany({
        where: { businessId },
        include: { items: true, client: true },
      }),
      this.prisma.client.findMany({ where: { businessId } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user,
      business,
      accounts,
      transactions,
      categories,
      goals,
      budgets,
      loans,
      savings,
      stockPortfolios,
      forexAccounts,
      forexTransfers,
      recurringPatterns,
      documents,
      invoices,
      clients,
    };
  }

  // ─── System Stats ───────────────────────────────────────────────────

  async getSystemStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalBusinesses,
      totalTransactions,
      totalAccounts,
      totalInvoices,
      totalClients,
      usersCreatedToday,
      usersCreatedThisMonth,
      activeUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.business.count(),
      this.prisma.transaction.count(),
      this.prisma.account.count(),
      this.prisma.invoice.count(),
      this.prisma.client.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.user.count({
        where: { updatedAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    return {
      totalUsers,
      totalBusinesses,
      totalTransactions,
      totalAccounts,
      totalInvoices,
      totalClients,
      usersToday: usersCreatedToday,
      usersThisMonth: usersCreatedThisMonth,
      activeUsersLast30Days: activeUsers,
    };
  }
}
