import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(businessId: string) {
    const clients = await this.prisma.client.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { projects: true, invoices: true },
        },
      },
    });

    // Calculate total revenue per client from paid invoices
    const clientIds = clients.map((c) => c.id);
    const revenueByClient = await this.prisma.invoice.groupBy({
      by: ['clientId'],
      where: {
        clientId: { in: clientIds },
        businessId,
        status: 'PAID',
      },
      _sum: { total: true },
    });

    const revenueMap = new Map(
      revenueByClient.map((r) => [r.clientId, Number(r._sum.total ?? 0)]),
    );

    return clients.map((client) => ({
      ...client,
      projectCount: client._count.projects,
      invoiceCount: client._count.invoices,
      totalRevenue: revenueMap.get(client.id) ?? 0,
    }));
  }

  async findOne(businessId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, businessId },
      include: {
        projects: {
          where: { isActive: true },
          orderBy: { updatedAt: 'desc' },
        },
        invoices: {
          orderBy: { issueDate: 'desc' },
          take: 10,
          include: { items: true },
        },
        transactions: {
          orderBy: { date: 'desc' },
          take: 20,
          include: { account: true, category: true },
        },
        _count: {
          select: { projects: true, invoices: true, transactions: true },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Calculate total revenue from paid invoices
    const revenueResult = await this.prisma.invoice.aggregate({
      where: {
        clientId: id,
        businessId,
        status: 'PAID',
      },
      _sum: { total: true },
    });

    // Calculate total from all income transactions linked to this client
    const transactionRevenue = await this.prisma.transaction.aggregate({
      where: {
        clientId: id,
        businessId,
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    return {
      ...client,
      totalRevenue: Number(revenueResult._sum.total ?? 0),
      totalTransactionRevenue: Number(transactionRevenue._sum.amount ?? 0),
    };
  }

  async create(
    businessId: string,
    dto: {
      name: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      taxId?: string;
      notes?: string;
      hourlyRate?: number;
      currency?: string;
      color?: string;
    },
  ) {
    return this.prisma.client.create({
      data: {
        businessId,
        name: dto.name,
        contactName: dto.contactName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        taxId: dto.taxId ?? null,
        notes: dto.notes ?? null,
        hourlyRate: dto.hourlyRate ?? null,
        currency: dto.currency ?? 'ILS',
        color: dto.color ?? null,
      },
    });
  }

  async update(
    businessId: string,
    id: string,
    dto: {
      name?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      taxId?: string;
      notes?: string;
      hourlyRate?: number;
      currency?: string;
      color?: string;
    },
  ) {
    // Verify client belongs to business
    const existing = await this.prisma.client.findFirst({
      where: { id, businessId },
    });
    if (!existing) {
      throw new NotFoundException('Client not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.contactName !== undefined) data.contactName = dto.contactName || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.address !== undefined) data.address = dto.address || null;
    if (dto.taxId !== undefined) data.taxId = dto.taxId || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.hourlyRate !== undefined) data.hourlyRate = dto.hourlyRate ?? null;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.color !== undefined) data.color = dto.color || null;

    return this.prisma.client.update({
      where: { id },
      data,
    });
  }

  async remove(businessId: string, id: string) {
    const existing = await this.prisma.client.findFirst({
      where: { id, businessId },
    });
    if (!existing) {
      throw new NotFoundException('Client not found');
    }

    return this.prisma.client.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
