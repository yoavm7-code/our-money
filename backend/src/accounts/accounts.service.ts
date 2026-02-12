import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountType } from '@prisma/client';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

const BALANCE_ACCOUNT_TYPES: AccountType[] = [
  'BANK',
  'CREDIT_CARD',
  'INVESTMENT',
  'PENSION',
  'INSURANCE',
  'CASH',
];

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a new account for a business. */
  async create(businessId: string, dto: CreateAccountDto) {
    const balance = dto.balance != null ? Number(dto.balance) : 0;
    return this.prisma.account.create({
      data: {
        businessId,
        name: dto.name,
        type: dto.type as AccountType,
        provider: dto.provider ?? null,
        balance,
        balanceDate: dto.balanceDate ? new Date(dto.balanceDate) : null,
        currency: dto.currency ?? 'ILS',
        linkedBankAccountId: dto.linkedBankAccountId ?? null,
      },
    });
  }

  /** List all active accounts for a business with calculated balances. */
  async findAll(businessId: string, type?: AccountType) {
    const accounts = await this.prisma.account.findMany({
      where: { businessId, isActive: true, ...(type && { type }) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { transactions: true } } },
    });
    return this.withCalculatedBalances(accounts);
  }

  /**
   * Calculate balances by summing the initial balance
   * with the sum of all transaction amounts for each account.
   */
  private async withCalculatedBalances(
    accounts: Array<{
      id: string;
      balance: unknown;
      type: string;
      [k: string]: unknown;
    }>,
  ) {
    if (accounts.length === 0) return accounts;

    const ids = accounts.map((a) => a.id);
    const sums = await this.prisma.transaction.groupBy({
      by: ['accountId'],
      where: { accountId: { in: ids } },
      _sum: { amount: true },
    });
    const sumByAccount = new Map(
      sums.map((s) => [s.accountId, Number(s._sum.amount ?? 0)]),
    );

    return accounts.map((a) => {
      const initial = Number(a.balance ?? 0);
      const txSum = sumByAccount.get(a.id) ?? 0;
      const calculated = initial + txSum;
      const showBalance = BALANCE_ACCOUNT_TYPES.includes(
        a.type as AccountType,
      );
      return {
        ...a,
        balance: showBalance ? String(calculated) : null,
      };
    });
  }

  /** Find a single account by ID, scoped by businessId. */
  async findOne(businessId: string, id: string) {
    return this.prisma.account.findFirst({
      where: { id, businessId },
      include: { transactions: { take: 10, orderBy: { date: 'desc' } } },
    });
  }

  /** Update an account. */
  async update(businessId: string, id: string, dto: UpdateAccountDto) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.balanceDate !== undefined) {
      data.balanceDate = dto.balanceDate ? new Date(dto.balanceDate) : null;
    }
    return this.prisma.account.updateMany({
      where: { id, businessId },
      data,
    });
  }

  /** Soft-delete an account by setting isActive=false. */
  async remove(businessId: string, id: string) {
    return this.prisma.account.updateMany({
      where: { id, businessId },
      data: { isActive: false },
    });
  }
}
