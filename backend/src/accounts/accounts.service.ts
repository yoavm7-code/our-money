import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountType } from '@prisma/client';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

const BALANCE_ACCOUNT_TYPES: AccountType[] = ['BANK', 'CREDIT_CARD', 'INVESTMENT', 'PENSION', 'INSURANCE', 'CASH'];

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async create(householdId: string, dto: CreateAccountDto) {
    const balance = dto.balance != null ? Number(dto.balance) : 0;
    return this.prisma.account.create({
      data: {
        householdId,
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

  async findAll(householdId: string, type?: AccountType) {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, isActive: true, ...(type && { type }) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { transactions: true } } },
    });
    return this.withCalculatedBalances(accounts);
  }

  private async withCalculatedBalances(
    accounts: Array<{ id: string; balance: unknown; type: string; [k: string]: unknown }>,
  ) {
    const ids = accounts.map((a) => a.id);
    const sums = await this.prisma.transaction.groupBy({
      by: ['accountId'],
      where: { accountId: { in: ids } },
      _sum: { amount: true },
    });
    const sumByAccount = new Map(sums.map((s) => [s.accountId, Number(s._sum.amount ?? 0)]));
    return accounts.map((a) => {
      const initial = Number(a.balance ?? 0);
      const txSum = sumByAccount.get(a.id) ?? 0;
      const calculated = initial + txSum;
      const showBalance = BALANCE_ACCOUNT_TYPES.includes(a.type as AccountType);
      return {
        ...a,
        balance: showBalance ? String(calculated) : null,
      };
    });
  }

  async findOne(householdId: string, id: string) {
    return this.prisma.account.findFirst({
      where: { id, householdId },
      include: { transactions: { take: 10, orderBy: { date: 'desc' } } },
    });
  }

  async update(householdId: string, id: string, dto: UpdateAccountDto) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.balanceDate !== undefined) {
      data.balanceDate = dto.balanceDate ? new Date(dto.balanceDate) : null;
    }
    return this.prisma.account.updateMany({
      where: { id, householdId },
      data,
    });
  }

  async remove(householdId: string, id: string) {
    return this.prisma.account.updateMany({
      where: { id, householdId },
      data: { isActive: false },
    });
  }
}
