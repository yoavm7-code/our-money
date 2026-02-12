import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    businessId: string,
    filters?: { clientId?: string; status?: string },
  ) {
    const where: Record<string, unknown> = {
      businessId,
      isActive: true,
    };
    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }
    if (filters?.status) {
      where.status = filters.status as ProjectStatus;
    }

    const projects = await this.prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: {
          select: { id: true, name: true, color: true },
        },
        _count: {
          select: { transactions: true, invoices: true },
        },
      },
    });

    // Calculate revenue and expenses per project from transactions
    const projectIds = projects.map((p) => p.id);

    const [incomeByProject, expenseByProject, invoiceRevenueByProject] =
      await Promise.all([
        // Income transactions (positive amounts)
        this.prisma.transaction.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: projectIds },
            businessId,
            amount: { gt: 0 },
          },
          _sum: { amount: true },
        }),
        // Expense transactions (negative amounts)
        this.prisma.transaction.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: projectIds },
            businessId,
            amount: { lt: 0 },
          },
          _sum: { amount: true },
        }),
        // Revenue from paid invoices
        this.prisma.invoice.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: projectIds },
            businessId,
            status: 'PAID',
          },
          _sum: { total: true },
        }),
      ]);

    const incomeMap = new Map(
      incomeByProject.map((r) => [r.projectId, Number(r._sum.amount ?? 0)]),
    );
    const expenseMap = new Map(
      expenseByProject.map((r) => [
        r.projectId,
        Math.abs(Number(r._sum.amount ?? 0)),
      ]),
    );
    const invoiceRevenueMap = new Map(
      invoiceRevenueByProject.map((r) => [
        r.projectId,
        Number(r._sum.total ?? 0),
      ]),
    );

    return projects.map((project) => {
      const transactionIncome = incomeMap.get(project.id) ?? 0;
      const transactionExpenses = expenseMap.get(project.id) ?? 0;
      const invoiceRevenue = invoiceRevenueMap.get(project.id) ?? 0;
      const budgetAmount = project.budgetAmount
        ? Number(project.budgetAmount)
        : null;
      const budgetUsed = transactionExpenses;
      const budgetRemaining =
        budgetAmount != null ? budgetAmount - budgetUsed : null;

      return {
        ...project,
        transactionIncome,
        transactionExpenses,
        invoiceRevenue,
        totalRevenue: invoiceRevenue || transactionIncome,
        budgetUsed,
        budgetRemaining,
        transactionCount: project._count.transactions,
        invoiceCount: project._count.invoices,
      };
    });
  }

  async findOne(businessId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, businessId },
      include: {
        client: true,
        transactions: {
          orderBy: { date: 'desc' },
          take: 50,
          include: { account: true, category: true },
        },
        invoices: {
          orderBy: { issueDate: 'desc' },
          include: { items: true },
        },
        _count: {
          select: { transactions: true, invoices: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Compute budget tracking
    const [incomeAgg, expenseAgg, invoiceAgg] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { projectId: id, businessId, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { projectId: id, businessId, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { projectId: id, businessId, status: 'PAID' },
        _sum: { total: true },
      }),
    ]);

    const transactionIncome = Number(incomeAgg._sum.amount ?? 0);
    const transactionExpenses = Math.abs(Number(expenseAgg._sum.amount ?? 0));
    const invoiceRevenue = Number(invoiceAgg._sum.total ?? 0);
    const budgetAmount = project.budgetAmount
      ? Number(project.budgetAmount)
      : null;
    const budgetUsed = transactionExpenses;
    const budgetRemaining =
      budgetAmount != null ? budgetAmount - budgetUsed : null;
    const budgetPercentUsed =
      budgetAmount != null && budgetAmount > 0
        ? Math.round((budgetUsed / budgetAmount) * 100)
        : null;

    return {
      ...project,
      transactionIncome,
      transactionExpenses,
      invoiceRevenue,
      totalRevenue: invoiceRevenue || transactionIncome,
      budgetUsed,
      budgetRemaining,
      budgetPercentUsed,
    };
  }

  async create(
    businessId: string,
    dto: {
      name: string;
      clientId?: string;
      description?: string;
      status?: string;
      budgetAmount?: number;
      hourlyRate?: number;
      currency?: string;
      startDate?: string;
      endDate?: string;
      color?: string;
      notes?: string;
    },
  ) {
    // Validate client belongs to business if provided
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, businessId },
      });
      if (!client) {
        throw new NotFoundException('Client not found');
      }
    }

    return this.prisma.project.create({
      data: {
        businessId,
        clientId: dto.clientId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        status: (dto.status as ProjectStatus) ?? 'ACTIVE',
        budgetAmount: dto.budgetAmount ?? null,
        hourlyRate: dto.hourlyRate ?? null,
        currency: dto.currency ?? 'ILS',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        color: dto.color ?? null,
        notes: dto.notes ?? null,
      },
      include: {
        client: {
          select: { id: true, name: true, color: true },
        },
      },
    });
  }

  async update(
    businessId: string,
    id: string,
    dto: {
      name?: string;
      clientId?: string;
      description?: string;
      status?: string;
      budgetAmount?: number;
      hourlyRate?: number;
      currency?: string;
      startDate?: string;
      endDate?: string;
      color?: string;
      notes?: string;
    },
  ) {
    const existing = await this.prisma.project.findFirst({
      where: { id, businessId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    // Validate client belongs to business if changing
    if (dto.clientId !== undefined && dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, businessId },
      });
      if (!client) {
        throw new NotFoundException('Client not found');
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.clientId !== undefined) data.clientId = dto.clientId || null;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.status !== undefined) data.status = dto.status as ProjectStatus;
    if (dto.budgetAmount !== undefined) data.budgetAmount = dto.budgetAmount ?? null;
    if (dto.hourlyRate !== undefined) data.hourlyRate = dto.hourlyRate ?? null;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined)
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.color !== undefined) data.color = dto.color || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;

    return this.prisma.project.update({
      where: { id },
      data,
      include: {
        client: {
          select: { id: true, name: true, color: true },
        },
      },
    });
  }

  async remove(businessId: string, id: string) {
    const existing = await this.prisma.project.findFirst({
      where: { id, businessId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
