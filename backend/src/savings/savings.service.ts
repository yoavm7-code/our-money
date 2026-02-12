import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSavingDto } from './dto/create-saving.dto';
import { UpdateSavingDto } from './dto/update-saving.dto';

@Injectable()
export class SavingsService {
  constructor(private prisma: PrismaService) {}

  async create(householdId: string, dto: CreateSavingDto) {
    return this.prisma.saving.create({
      data: {
        householdId,
        name: dto.name,
        targetAmount: dto.targetAmount ?? null,
        currentAmount: dto.currentAmount ?? 0,
        interestRate: dto.interestRate ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        currency: dto.currency ?? 'ILS',
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(householdId: string) {
    return this.prisma.saving.findMany({
      where: { householdId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(householdId: string, id: string) {
    return this.prisma.saving.findFirst({
      where: { id, householdId },
    });
  }

  async update(householdId: string, id: string, dto: UpdateSavingDto) {
    return this.prisma.saving.updateMany({
      where: { id, householdId },
      data: dto as Record<string, unknown>,
    });
  }

  async remove(householdId: string, id: string) {
    return this.prisma.saving.updateMany({
      where: { id, householdId },
      data: { isActive: false },
    });
  }
}
