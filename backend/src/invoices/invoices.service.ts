import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, InvoiceType } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Sequential invoice number generation
  // ---------------------------------------------------------------------------

  async getNextInvoiceNumber(businessId: string): Promise<{ nextNumber: string }> {
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { businessId },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let nextSeq = 1;
    if (lastInvoice?.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
      if (match?.[1]) {
        nextSeq = parseInt(match[1], 10) + 1;
      }
    }

    return { nextNumber: `INV-${String(nextSeq).padStart(4, '0')}` };
  }

  private async generateInvoiceNumber(businessId: string): Promise<string> {
    const { nextNumber } = await this.getNextInvoiceNumber(businessId);
    return nextNumber;
  }

  // ---------------------------------------------------------------------------
  // List invoices (with filters)
  // ---------------------------------------------------------------------------

  async findAll(
    businessId: string,
    filters?: {
      status?: string;
      clientId?: string;
      from?: string;
      to?: string;
      type?: string;
    },
  ) {
    const where: Record<string, unknown> = { businessId };

    if (filters?.status) {
      where.status = filters.status as InvoiceStatus;
    }
    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }
    if (filters?.type) {
      where.type = filters.type as InvoiceType;
    }
    if (filters?.from || filters?.to) {
      const issueDate: Record<string, Date> = {};
      if (filters.from) issueDate.gte = new Date(filters.from);
      if (filters.to) issueDate.lte = new Date(filters.to);
      where.issueDate = issueDate;
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: {
        client: {
          select: { id: true, name: true, color: true },
        },
        project: {
          select: { id: true, name: true },
        },
        items: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    // Mark overdue invoices on the fly
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return invoices.map((invoice) => {
      const isOverdue =
        invoice.dueDate &&
        new Date(invoice.dueDate) < now &&
        invoice.status === 'SENT';

      return {
        ...invoice,
        isOverdue: !!isOverdue,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Get single invoice
  // ---------------------------------------------------------------------------

  async findOne(businessId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, businessId },
      include: {
        client: true,
        project: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const isOverdue =
      invoice.dueDate &&
      new Date(invoice.dueDate) < now &&
      invoice.status === 'SENT';

    return {
      ...invoice,
      isOverdue: !!isOverdue,
    };
  }

  // ---------------------------------------------------------------------------
  // Create invoice
  // ---------------------------------------------------------------------------

  async create(
    businessId: string,
    dto: {
      clientId?: string;
      projectId?: string;
      type?: string;
      issueDate: string;
      dueDate?: string;
      currency?: string;
      notes?: string;
      paymentTerms?: string;
      language?: string;
      vatRate?: number;
      items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        sortOrder?: number;
      }>;
    },
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Invoice must have at least one item');
    }

    // Validate client belongs to business if provided
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, businessId },
      });
      if (!client) {
        throw new NotFoundException('Client not found');
      }
    }

    // Validate project belongs to business if provided
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, businessId },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    // Get VAT rate: from dto, or from business settings
    let vatRate = dto.vatRate;
    if (vatRate === undefined || vatRate === null) {
      const business = await this.prisma.business.findUnique({
        where: { id: businessId },
        select: { vatRate: true },
      });
      vatRate = business ? Number(business.vatRate) : 17;
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(businessId);

    // Calculate totals
    const subtotal = dto.items.reduce((sum, item) => {
      return sum + item.quantity * item.unitPrice;
    }, 0);

    const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;

    // Create invoice with items in a transaction
    const invoice = await this.prisma.invoice.create({
      data: {
        businessId,
        clientId: dto.clientId ?? null,
        projectId: dto.projectId ?? null,
        invoiceNumber,
        type: (dto.type as InvoiceType) ?? 'TAX_INVOICE',
        status: 'DRAFT',
        issueDate: new Date(dto.issueDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        subtotal,
        vatRate,
        vatAmount,
        total,
        currency: dto.currency ?? 'ILS',
        notes: dto.notes ?? null,
        paymentTerms: dto.paymentTerms ?? null,
        language: dto.language ?? 'he',
        items: {
          create: dto.items.map((item, index) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount:
              Math.round(item.quantity * item.unitPrice * 100) / 100,
            sortOrder: item.sortOrder ?? index,
          })),
        },
      },
      include: {
        client: true,
        project: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return invoice;
  }

  // ---------------------------------------------------------------------------
  // Update invoice (only DRAFT)
  // ---------------------------------------------------------------------------

  async update(
    businessId: string,
    id: string,
    dto: {
      clientId?: string;
      projectId?: string;
      type?: string;
      issueDate?: string;
      dueDate?: string;
      currency?: string;
      notes?: string;
      paymentTerms?: string;
      language?: string;
      vatRate?: number;
      items?: Array<{
        id?: string;
        description: string;
        quantity: number;
        unitPrice: number;
        sortOrder?: number;
      }>;
    },
  ) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, businessId },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Invoice not found');
    }

    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only DRAFT invoices can be edited',
      );
    }

    // Build update data
    const data: Record<string, unknown> = {};
    if (dto.clientId !== undefined) data.clientId = dto.clientId || null;
    if (dto.projectId !== undefined) data.projectId = dto.projectId || null;
    if (dto.type !== undefined) data.type = dto.type as InvoiceType;
    if (dto.issueDate !== undefined) data.issueDate = new Date(dto.issueDate);
    if (dto.dueDate !== undefined)
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.paymentTerms !== undefined)
      data.paymentTerms = dto.paymentTerms || null;
    if (dto.language !== undefined) data.language = dto.language;

    // Determine effective VAT rate
    let vatRate = dto.vatRate !== undefined ? dto.vatRate : Number(existing.vatRate);
    if (dto.vatRate !== undefined) {
      data.vatRate = dto.vatRate;
    }

    // If items are provided, replace them entirely
    if (dto.items && dto.items.length > 0) {
      const subtotal = dto.items.reduce((sum, item) => {
        return sum + item.quantity * item.unitPrice;
      }, 0);

      const vatAmount =
        Math.round(subtotal * (vatRate / 100) * 100) / 100;
      const total = Math.round((subtotal + vatAmount) * 100) / 100;

      data.subtotal = subtotal;
      data.vatAmount = vatAmount;
      data.total = total;

      // Delete existing items and create new ones in a transaction
      await this.prisma.$transaction([
        this.prisma.invoiceItem.deleteMany({
          where: { invoiceId: id },
        }),
        this.prisma.invoice.update({
          where: { id },
          data: {
            ...data,
            items: {
              create: dto.items.map((item, index) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount:
                  Math.round(item.quantity * item.unitPrice * 100) / 100,
                sortOrder: item.sortOrder ?? index,
              })),
            },
          },
        }),
      ]);
    } else if (Object.keys(data).length > 0) {
      // If only vatRate changed, recalculate totals
      if (dto.vatRate !== undefined) {
        const subtotal = Number(existing.subtotal);
        const vatAmount =
          Math.round(subtotal * (vatRate / 100) * 100) / 100;
        const total = Math.round((subtotal + vatAmount) * 100) / 100;
        data.subtotal = subtotal;
        data.vatAmount = vatAmount;
        data.total = total;
      }

      await this.prisma.invoice.update({
        where: { id },
        data,
      });
    }

    return this.findOne(businessId, id);
  }

  // ---------------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------------

  async markAsSent(businessId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, businessId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only DRAFT invoices can be marked as SENT',
      );
    }

    await this.prisma.invoice.update({
      where: { id },
      data: { status: 'SENT' },
    });

    return this.findOne(businessId, id);
  }

  async markAsPaid(
    businessId: string,
    id: string,
    dto: { paidDate?: string; paidAmount?: number },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, businessId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Cannot mark a cancelled invoice as paid');
    }

    if (invoice.status === 'DRAFT') {
      throw new BadRequestException(
        'Invoice must be sent before marking as paid',
      );
    }

    const paidDate = dto.paidDate ? new Date(dto.paidDate) : new Date();
    const paidAmount = dto.paidAmount ?? Number(invoice.total);

    // Determine if fully or partially paid
    const invoiceTotal = Number(invoice.total);
    const alreadyPaid = Number(invoice.paidAmount ?? 0);
    const totalPaid = alreadyPaid + paidAmount;
    const status: InvoiceStatus =
      totalPaid >= invoiceTotal ? 'PAID' : 'PARTIALLY_PAID';

    await this.prisma.invoice.update({
      where: { id },
      data: {
        status,
        paidDate,
        paidAmount: totalPaid,
      },
    });

    return this.findOne(businessId, id);
  }

  async cancel(businessId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, businessId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException(
        'Cannot cancel a paid invoice. Issue a credit note instead.',
      );
    }

    await this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return this.findOne(businessId, id);
  }

  // ---------------------------------------------------------------------------
  // Duplicate invoice
  // ---------------------------------------------------------------------------

  async duplicate(businessId: string, id: string) {
    const original = await this.prisma.invoice.findFirst({
      where: { id, businessId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!original) {
      throw new NotFoundException('Invoice not found');
    }

    const invoiceNumber = await this.generateInvoiceNumber(businessId);

    const duplicated = await this.prisma.invoice.create({
      data: {
        businessId,
        clientId: original.clientId,
        projectId: original.projectId,
        invoiceNumber,
        type: original.type,
        status: 'DRAFT',
        issueDate: new Date(),
        dueDate: original.dueDate
          ? new Date(
              Date.now() +
                (new Date(original.dueDate).getTime() -
                  new Date(original.issueDate).getTime()),
            )
          : null,
        subtotal: original.subtotal,
        vatRate: original.vatRate,
        vatAmount: original.vatAmount,
        total: original.total,
        currency: original.currency,
        notes: original.notes,
        paymentTerms: original.paymentTerms,
        language: original.language,
        items: {
          create: original.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: {
        client: true,
        project: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return duplicated;
  }

  // ---------------------------------------------------------------------------
  // Delete invoice (only DRAFT)
  // ---------------------------------------------------------------------------

  async remove(businessId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, businessId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT invoices can be deleted');
    }

    // Delete items first, then invoice
    await this.prisma.$transaction([
      this.prisma.invoiceItem.deleteMany({
        where: { invoiceId: id },
      }),
      this.prisma.invoice.delete({
        where: { id },
      }),
    ]);

    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Summary - totals by status
  // ---------------------------------------------------------------------------

  async getSummary(businessId: string) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Get all non-cancelled invoices for this business
    const invoices = await this.prisma.invoice.findMany({
      where: { businessId },
      select: {
        status: true,
        total: true,
        paidAmount: true,
        dueDate: true,
      },
    });

    let draftTotal = 0;
    let draftCount = 0;
    let sentTotal = 0;
    let sentCount = 0;
    let paidTotal = 0;
    let paidCount = 0;
    let overdueTotal = 0;
    let overdueCount = 0;
    let cancelledTotal = 0;
    let cancelledCount = 0;
    let partiallyPaidTotal = 0;
    let partiallyPaidCount = 0;

    for (const inv of invoices) {
      const total = Number(inv.total);

      switch (inv.status) {
        case 'DRAFT':
          draftTotal += total;
          draftCount++;
          break;
        case 'SENT': {
          const isOverdue = inv.dueDate && new Date(inv.dueDate) < now;
          if (isOverdue) {
            overdueTotal += total;
            overdueCount++;
          } else {
            sentTotal += total;
            sentCount++;
          }
          break;
        }
        case 'PAID':
          paidTotal += Number(inv.paidAmount ?? total);
          paidCount++;
          break;
        case 'PARTIALLY_PAID':
          partiallyPaidTotal += Number(inv.paidAmount ?? 0);
          partiallyPaidCount++;
          break;
        case 'CANCELLED':
          cancelledTotal += total;
          cancelledCount++;
          break;
        default:
          break;
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      draft: { count: draftCount, total: round2(draftTotal) },
      sent: { count: sentCount, total: round2(sentTotal) },
      paid: { count: paidCount, total: round2(paidTotal) },
      overdue: { count: overdueCount, total: round2(overdueTotal) },
      partiallyPaid: {
        count: partiallyPaidCount,
        total: round2(partiallyPaidTotal),
      },
      cancelled: { count: cancelledCount, total: round2(cancelledTotal) },
      totalOutstanding: round2(sentTotal + overdueTotal + partiallyPaidTotal),
    };
  }
}
