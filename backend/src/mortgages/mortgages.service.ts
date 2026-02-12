import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMortgageDto } from './dto/create-mortgage.dto';
import { UpdateMortgageDto } from './dto/update-mortgage.dto';
import { CreateMortgageTrackDto } from './dto/create-mortgage-track.dto';

@Injectable()
export class MortgagesService {
  constructor(private prisma: PrismaService) {}

  async create(businessId: string, dto: CreateMortgageDto) {
    const { tracks, ...mortgageData } = dto;

    return this.prisma.mortgage.create({
      data: {
        businessId,
        name: mortgageData.name,
        bank: mortgageData.bank ?? null,
        propertyValue: mortgageData.propertyValue ?? null,
        totalAmount: mortgageData.totalAmount,
        remainingAmount: mortgageData.remainingAmount ?? null,
        totalMonthly: mortgageData.totalMonthly ?? null,
        startDate: mortgageData.startDate ? new Date(mortgageData.startDate) : null,
        endDate: mortgageData.endDate ? new Date(mortgageData.endDate) : null,
        currency: mortgageData.currency ?? 'ILS',
        notes: mortgageData.notes ?? null,
        tracks: tracks?.length
          ? {
              create: tracks.map((track) => ({
                name: track.name ?? null,
                trackType: track.trackType,
                indexType: track.indexType ?? null,
                amount: track.amount,
                interestRate: track.interestRate,
                monthlyPayment: track.monthlyPayment ?? null,
                totalPayments: track.totalPayments ?? null,
                remainingPayments: track.remainingPayments ?? null,
                startDate: track.startDate ? new Date(track.startDate) : null,
                endDate: track.endDate ? new Date(track.endDate) : null,
                notes: track.notes ?? null,
              })),
            }
          : undefined,
      },
      include: { tracks: true },
    });
  }

  async findAll(businessId: string) {
    return this.prisma.mortgage.findMany({
      where: { businessId, isActive: true },
      include: { tracks: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(businessId: string, id: string) {
    return this.prisma.mortgage.findFirst({
      where: { id, businessId },
      include: { tracks: true },
    });
  }

  async update(businessId: string, id: string, dto: UpdateMortgageDto) {
    return this.prisma.mortgage.updateMany({
      where: { id, businessId },
      data: dto as Record<string, unknown>,
    });
  }

  async remove(businessId: string, id: string) {
    return this.prisma.mortgage.updateMany({
      where: { id, businessId },
      data: { isActive: false },
    });
  }

  async addTrack(businessId: string, mortgageId: string, dto: CreateMortgageTrackDto) {
    // Verify the mortgage belongs to this household
    const mortgage = await this.prisma.mortgage.findFirst({
      where: { id: mortgageId, businessId },
    });
    if (!mortgage) {
      return null;
    }

    return this.prisma.mortgageTrack.create({
      data: {
        mortgageId,
        name: dto.name ?? null,
        trackType: dto.trackType,
        indexType: dto.indexType ?? null,
        amount: dto.amount,
        interestRate: dto.interestRate,
        monthlyPayment: dto.monthlyPayment ?? null,
        totalPayments: dto.totalPayments ?? null,
        remainingPayments: dto.remainingPayments ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        notes: dto.notes ?? null,
      },
    });
  }

  async updateTrack(
    businessId: string,
    mortgageId: string,
    trackId: string,
    dto: CreateMortgageTrackDto,
  ) {
    // Verify the mortgage belongs to this household
    const mortgage = await this.prisma.mortgage.findFirst({
      where: { id: mortgageId, businessId },
    });
    if (!mortgage) {
      return null;
    }

    return this.prisma.mortgageTrack.update({
      where: { id: trackId },
      data: {
        name: dto.name ?? null,
        trackType: dto.trackType,
        indexType: dto.indexType ?? null,
        amount: dto.amount,
        interestRate: dto.interestRate,
        monthlyPayment: dto.monthlyPayment ?? null,
        totalPayments: dto.totalPayments ?? null,
        remainingPayments: dto.remainingPayments ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        notes: dto.notes ?? null,
      },
    });
  }

  async removeTrack(businessId: string, mortgageId: string, trackId: string) {
    // Verify the mortgage belongs to this household
    const mortgage = await this.prisma.mortgage.findFirst({
      where: { id: mortgageId, businessId },
    });
    if (!mortgage) {
      return null;
    }

    return this.prisma.mortgageTrack.delete({
      where: { id: trackId },
    });
  }
}
