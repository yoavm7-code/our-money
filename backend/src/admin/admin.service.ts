import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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
          household: {
            select: { name: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Enrich with household-level counts
    const householdIds = [...new Set(users.map((u) => u.householdId))];
    const [txCounts, accCounts] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['householdId'],
        where: { householdId: { in: householdIds } },
        _count: true,
      }),
      this.prisma.account.groupBy({
        by: ['householdId'],
        where: { householdId: { in: householdIds } },
        _count: true,
      }),
    ]);

    const txMap = new Map(txCounts.map((t) => [t.householdId, t._count]));
    const accMap = new Map(accCounts.map((a) => [a.householdId, a._count]));

    const items = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      countryCode: u.countryCode,
      phone: u.phone,
      isAdmin: u.isAdmin,
      emailVerified: u.emailVerified,
      twoFactorEnabled: u.twoFactorEnabled,
      createdAt: u.createdAt,
      householdId: u.householdId,
      householdName: u.household.name,
      transactionsCount: txMap.get(u.householdId) ?? 0,
      accountsCount: accMap.get(u.householdId) ?? 0,
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
        householdId: true,
        household: {
          select: { id: true, name: true, createdAt: true },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const householdId = user.householdId;

    const [
      accountsCount,
      transactionsCount,
      categoriesCount,
      goalsCount,
      budgetsCount,
      loansCount,
      savingsCount,
      mortgagesCount,
      stockPortfoliosCount,
      totalBalance,
    ] = await Promise.all([
      this.prisma.account.count({ where: { householdId } }),
      this.prisma.transaction.count({ where: { householdId } }),
      this.prisma.category.count({ where: { householdId } }),
      this.prisma.goal.count({ where: { householdId } }),
      this.prisma.budget.count({ where: { householdId } }),
      this.prisma.loan.count({ where: { householdId } }),
      this.prisma.saving.count({ where: { householdId } }),
      this.prisma.mortgage.count({ where: { householdId } }),
      this.prisma.stockPortfolio.count({ where: { householdId } }),
      this.prisma.account.aggregate({
        where: { householdId },
        _sum: { balance: true },
      }),
    ]);

    return {
      ...user,
      householdSummary: {
        accountsCount,
        transactionsCount,
        totalBalance: totalBalance._sum.balance ?? 0,
        categoriesCount,
        goalsCount,
        budgetsCount,
        loansCount,
        savingsCount,
        mortgagesCount,
        stockPortfoliosCount,
      },
    };
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
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
      select: { id: true, householdId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Delete the household (cascades to all related data) and the user
    await this.prisma.household.delete({ where: { id: user.householdId } });

    return { deleted: true };
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const household = await this.prisma.household.create({
      data: { name: `${dto.name || 'User'}'s Household` },
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
        householdId: household.id,
        emailVerified: true, // Admin-created users are pre-verified
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      countryCode: user.countryCode,
      isAdmin: user.isAdmin,
      householdId: user.householdId,
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
    mortgages: 'mortgage',
    stockPortfolios: 'stockPortfolio',
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
      select: { householdId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const skip = (page - 1) * limit;
    const householdId = user.householdId;

    const model = this.getModel(prismaModel);
    const [items, total] = await Promise.all([
      model.findMany({
        where: { householdId },
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
      }),
      model.count({ where: { householdId } }),
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
    mortgages: 'mortgage',
    stockPortfolios: 'stockPortfolio',
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
        householdId: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const householdId = user.householdId;

    const [
      household,
      accounts,
      transactions,
      categories,
      goals,
      budgets,
      loans,
      savings,
      mortgages,
      stockPortfolios,
      forexAccounts,
      forexTransfers,
      recurringPatterns,
      documents,
    ] = await Promise.all([
      this.prisma.household.findUnique({ where: { id: householdId } }),
      this.prisma.account.findMany({ where: { householdId } }),
      this.prisma.transaction.findMany({
        where: { householdId },
        include: { account: true, category: true },
      }),
      this.prisma.category.findMany({ where: { householdId } }),
      this.prisma.goal.findMany({ where: { householdId } }),
      this.prisma.budget.findMany({
        where: { householdId },
        include: { category: true },
      }),
      this.prisma.loan.findMany({ where: { householdId } }),
      this.prisma.saving.findMany({ where: { householdId } }),
      this.prisma.mortgage.findMany({
        where: { householdId },
        include: { tracks: true },
      }),
      this.prisma.stockPortfolio.findMany({
        where: { householdId },
        include: { holdings: true },
      }),
      this.prisma.forexAccount.findMany({ where: { householdId } }),
      this.prisma.forexTransfer.findMany({ where: { householdId } }),
      this.prisma.recurringPattern.findMany({ where: { householdId } }),
      this.prisma.document.findMany({ where: { householdId } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user,
      household,
      accounts,
      transactions,
      categories,
      goals,
      budgets,
      loans,
      savings,
      mortgages,
      stockPortfolios,
      forexAccounts,
      forexTransfers,
      recurringPatterns,
      documents,
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
      totalHouseholds,
      totalTransactions,
      totalAccounts,
      usersCreatedToday,
      usersCreatedThisMonth,
      activeUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.household.count(),
      this.prisma.transaction.count(),
      this.prisma.account.count(),
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
      totalHouseholds,
      totalTransactions,
      totalAccounts,
      usersCreatedToday,
      usersCreatedThisMonth,
      activeUsers,
    };
  }
}
