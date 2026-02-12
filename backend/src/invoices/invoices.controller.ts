import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { InvoicesService } from './invoices.service';

@Controller('api/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  /** GET /api/invoices/next-number - must be before :id routes */
  @Get('next-number')
  getNextNumber(@HouseholdId() businessId: string) {
    return this.invoicesService.getNextInvoiceNumber(businessId);
  }

  /** GET /api/invoices/summary - totals by status */
  @Get('summary')
  getSummary(@HouseholdId() businessId: string) {
    return this.invoicesService.getSummary(businessId);
  }

  @Get()
  findAll(
    @HouseholdId() businessId: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
  ) {
    return this.invoicesService.findAll(businessId, {
      status,
      clientId,
      from,
      to,
      type,
    });
  }

  @Get(':id')
  findOne(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(businessId, id);
  }

  @Post()
  create(
    @HouseholdId() businessId: string,
    @Body()
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
    return this.invoicesService.create(businessId, dto);
  }

  @Put(':id')
  update(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body()
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
    return this.invoicesService.update(businessId, id, dto);
  }

  @Post(':id/send')
  markAsSent(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.invoicesService.markAsSent(businessId, id);
  }

  @Post(':id/mark-paid')
  markAsPaid(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body() dto: { paidDate?: string; paidAmount?: number },
  ) {
    return this.invoicesService.markAsPaid(businessId, id, dto);
  }

  @Post(':id/cancel')
  cancel(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.invoicesService.cancel(businessId, id);
  }

  @Post(':id/duplicate')
  duplicate(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.invoicesService.duplicate(businessId, id);
  }

  @Delete(':id')
  remove(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.invoicesService.remove(businessId, id);
  }
}
