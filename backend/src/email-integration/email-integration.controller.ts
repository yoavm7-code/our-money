import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmailIntegrationService } from './email-integration.service';

@Controller('api/email-integration')
@UseGuards(AuthGuard('jwt'))
export class EmailIntegrationController {
  constructor(private service: EmailIntegrationService) {}

  @Get()
  async list(@Req() req: any) {
    return this.service.list(req.user.householdId);
  }

  @Post('connect')
  async connect(@Req() req: any, @Body() body: { provider: 'gmail' | 'outlook' | 'imap'; email: string; accessToken?: string; refreshToken?: string; imapHost?: string; imapPort?: number }) {
    return this.service.connect(req.user.householdId, body);
  }

  @Delete(':id')
  async disconnect(@Req() req: any, @Param('id') id: string) {
    return this.service.disconnect(req.user.householdId, id);
  }

  @Post(':id/scan')
  async scan(@Req() req: any, @Param('id') id: string) {
    return this.service.scanEmails(req.user.householdId, id);
  }

  @Get('invoices')
  async listInvoices(@Req() req: any, @Query('status') status?: string) {
    return this.service.listInvoices(req.user.householdId, status);
  }

  @Post('invoices/:id/approve')
  async approveInvoice(@Req() req: any, @Param('id') id: string, @Body() body: { accountId: string; categoryId?: string }) {
    return this.service.approveInvoice(req.user.householdId, id, body.accountId, body.categoryId);
  }

  @Post('invoices/:id/dismiss')
  async dismissInvoice(@Req() req: any, @Param('id') id: string) {
    return this.service.dismissInvoice(req.user.householdId, id);
  }
}
