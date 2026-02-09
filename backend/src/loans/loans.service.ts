import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  async create(householdId: string, dto: CreateLoanDto) {
    return this.prisma.loan.create({
      data: {
        householdId,
        name: dto.name,
        lender: dto.lender ?? null,
        originalAmount: dto.originalAmount,
        remainingAmount: dto.remainingAmount,
        interestRate: dto.interestRate ?? null,
        monthlyPayment: dto.monthlyPayment ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        currency: dto.currency ?? 'ILS',
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(householdId: string) {
    return this.prisma.loan.findMany({
      where: { householdId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(householdId: string, id: string) {
    return this.prisma.loan.findFirst({
      where: { id, householdId },
    });
  }

  async update(householdId: string, id: string, dto: UpdateLoanDto) {
    return this.prisma.loan.updateMany({
      where: { id, householdId },
      data: dto as Record<string, unknown>,
    });
  }

  async remove(householdId: string, id: string) {
    return this.prisma.loan.updateMany({
      where: { id, householdId },
      data: { isActive: false },
    });
  }
}
