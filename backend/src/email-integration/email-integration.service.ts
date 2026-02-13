import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface ConnectEmailDto {
  provider: 'gmail' | 'outlook' | 'imap';
  email: string;
  accessToken?: string;
  refreshToken?: string;
  imapHost?: string;
  imapPort?: number;
  imapPassword?: string;
}

interface InvoiceCandidate {
  emailSubject: string;
  emailFrom: string;
  emailDate: Date;
  extractedAmount: number | null;
  extractedDesc: string | null;
  extractedType: 'income' | 'expense' | null;
  rawContent: string | null;
}

// Keywords that indicate invoices/receipts in Hebrew and English
const INVOICE_KEYWORDS_HE = [
  'חשבונית', 'קבלה', 'תשלום', 'חיוב', 'העברה', 'הוראת קבע',
  'חשבון חשמל', 'חשבון מים', 'ארנונה', 'ביטוח', 'משכנתא',
  'כרטיס אשראי', 'דוח חיוב', 'אישור עסקה', 'הזמנה',
];

const INVOICE_KEYWORDS_EN = [
  'invoice', 'receipt', 'payment', 'billing', 'statement',
  'order confirmation', 'transaction', 'subscription', 'charge',
  'wire transfer', 'bank statement', 'credit card', 'utility bill',
];

// Amount extraction patterns
const AMOUNT_PATTERNS = [
  /₪\s?([\d,]+(?:\.\d{2})?)/,
  /([\d,]+(?:\.\d{2})?)\s?₪/,
  /ILS\s?([\d,]+(?:\.\d{2})?)/,
  /NIS\s?([\d,]+(?:\.\d{2})?)/,
  /\$\s?([\d,]+(?:\.\d{2})?)/,
  /USD\s?([\d,]+(?:\.\d{2})?)/,
  /€\s?([\d,]+(?:\.\d{2})?)/,
  /סה"כ[:\s]+([\d,]+(?:\.\d{2})?)/,
  /total[:\s]+([\d,]+(?:\.\d{2})?)/i,
  /amount[:\s]+([\d,]+(?:\.\d{2})?)/i,
  /סכום[:\s]+([\d,]+(?:\.\d{2})?)/,
];

@Injectable()
export class EmailIntegrationService {
  private readonly logger = new Logger(EmailIntegrationService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** List all email integrations for a household */
  async list(householdId: string) {
    return this.prisma.emailIntegration.findMany({
      where: { householdId },
      select: {
        id: true,
        provider: true,
        email: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
        _count: { select: { invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Connect a new email account */
  async connect(householdId: string, dto: ConnectEmailDto) {
    // Validate provider-specific fields
    if (dto.provider === 'imap' && !dto.imapHost) {
      throw new BadRequestException('IMAP host is required for IMAP connections');
    }

    // Check if already connected
    const existing = await this.prisma.emailIntegration.findFirst({
      where: { householdId, email: dto.email, isActive: true },
    });
    if (existing) {
      throw new BadRequestException('This email is already connected');
    }

    return this.prisma.emailIntegration.create({
      data: {
        householdId,
        provider: dto.provider,
        email: dto.email,
        accessToken: dto.accessToken || null,
        refreshToken: dto.refreshToken || null,
        imapHost: dto.imapHost || null,
        imapPort: dto.imapPort || null,
        isActive: true,
      },
    });
  }

  /** Disconnect an email integration */
  async disconnect(householdId: string, integrationId: string) {
    const integration = await this.prisma.emailIntegration.findFirst({
      where: { id: integrationId, householdId },
    });
    if (!integration) throw new NotFoundException('Integration not found');

    await this.prisma.emailIntegration.update({
      where: { id: integrationId },
      data: { isActive: false, accessToken: null, refreshToken: null },
    });

    return { success: true };
  }

  /** Scan emails for invoices (simulated - real implementation needs IMAP/Gmail API) */
  async scanEmails(householdId: string, integrationId: string) {
    const integration = await this.prisma.emailIntegration.findFirst({
      where: { id: integrationId, householdId, isActive: true },
    });
    if (!integration) throw new NotFoundException('Integration not found');

    let candidates: InvoiceCandidate[] = [];

    try {
      switch (integration.provider) {
        case 'gmail':
          candidates = await this.scanGmail(integration);
          break;
        case 'outlook':
          candidates = await this.scanOutlook(integration);
          break;
        case 'imap':
          candidates = await this.scanImap(integration);
          break;
      }
    } catch (err) {
      this.logger.error(`Failed to scan emails for integration ${integrationId}`, err);
      throw new BadRequestException('Failed to scan emails. Please check your connection settings.');
    }

    // Save found invoices
    const created = [];
    for (const candidate of candidates) {
      // Skip duplicates
      const exists = await this.prisma.emailInvoice.findFirst({
        where: {
          integrationId,
          emailSubject: candidate.emailSubject,
          emailDate: candidate.emailDate,
        },
      });
      if (exists) continue;

      const invoice = await this.prisma.emailInvoice.create({
        data: {
          integrationId,
          emailSubject: candidate.emailSubject,
          emailFrom: candidate.emailFrom,
          emailDate: candidate.emailDate,
          extractedAmount: candidate.extractedAmount,
          extractedDesc: candidate.extractedDesc,
          extractedType: candidate.extractedType,
          rawContent: candidate.rawContent,
          status: 'pending',
        },
      });
      created.push(invoice);
    }

    // Update last sync time
    await this.prisma.emailIntegration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    return { found: candidates.length, created: created.length, invoices: created };
  }

  /** List invoices found by email scan */
  async listInvoices(householdId: string, status?: string) {
    const integrations = await this.prisma.emailIntegration.findMany({
      where: { householdId },
      select: { id: true },
    });
    const integrationIds = integrations.map((i) => i.id);

    return this.prisma.emailInvoice.findMany({
      where: {
        integrationId: { in: integrationIds },
        ...(status && { status }),
      },
      include: {
        integration: { select: { email: true, provider: true } },
      },
      orderBy: { emailDate: 'desc' },
      take: 100,
    });
  }

  /** Approve an invoice - create a transaction from it */
  async approveInvoice(householdId: string, invoiceId: string, accountId: string, categoryId?: string) {
    const invoice = await this.prisma.emailInvoice.findFirst({
      where: { id: invoiceId, status: 'pending' },
      include: { integration: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.integration.householdId !== householdId) {
      throw new BadRequestException('Not authorized');
    }

    // Create transaction
    const amount = invoice.extractedAmount
      ? (invoice.extractedType === 'income' ? Number(invoice.extractedAmount) : -Math.abs(Number(invoice.extractedAmount)))
      : 0;

    const transaction = await this.prisma.transaction.create({
      data: {
        householdId,
        accountId,
        categoryId: categoryId || null,
        date: invoice.emailDate,
        description: invoice.extractedDesc || invoice.emailSubject,
        amount,
        currency: 'ILS',
        source: 'API',
      },
    });

    // Mark invoice as approved
    await this.prisma.emailInvoice.update({
      where: { id: invoiceId },
      data: { status: 'approved', transactionId: transaction.id },
    });

    return { success: true, transactionId: transaction.id };
  }

  /** Dismiss an invoice */
  async dismissInvoice(householdId: string, invoiceId: string) {
    const invoice = await this.prisma.emailInvoice.findFirst({
      where: { id: invoiceId, status: 'pending' },
      include: { integration: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.integration.householdId !== householdId) {
      throw new BadRequestException('Not authorized');
    }

    await this.prisma.emailInvoice.update({
      where: { id: invoiceId },
      data: { status: 'dismissed' },
    });

    return { success: true };
  }

  // --- Provider-specific scanning ---

  private async scanGmail(integration: any): Promise<InvoiceCandidate[]> {
    // In production: use Google Gmail API with OAuth2 token
    // For now: return empty (requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET env vars)
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId || !integration.accessToken) {
      this.logger.warn('Gmail scanning requires GOOGLE_CLIENT_ID and valid access token');
      return [];
    }

    // Production implementation would:
    // 1. Use googleapis npm package
    // 2. Search for emails with invoice keywords
    // 3. Parse email bodies for amounts
    // 4. Return candidates
    return [];
  }

  private async scanOutlook(integration: any): Promise<InvoiceCandidate[]> {
    // In production: use Microsoft Graph API
    this.logger.warn('Outlook scanning not yet implemented');
    return [];
  }

  private async scanImap(integration: any): Promise<InvoiceCandidate[]> {
    // In production: use imapflow or node-imap npm package
    // For now: return empty
    if (!integration.imapHost) {
      this.logger.warn('IMAP scanning requires host configuration');
      return [];
    }

    // Production implementation would:
    // 1. Connect to IMAP server
    // 2. Search INBOX for recent emails matching invoice keywords
    // 3. Parse email bodies
    // 4. Extract amounts using AMOUNT_PATTERNS
    // 5. Return candidates
    return [];
  }

  /** Extract invoice data from email content */
  extractInvoiceData(subject: string, body: string): Partial<InvoiceCandidate> {
    const allText = `${subject} ${body}`;
    const isHebrew = /[\u0590-\u05FF]/.test(allText);
    const keywords = isHebrew ? INVOICE_KEYWORDS_HE : INVOICE_KEYWORDS_EN;

    // Check if email looks like an invoice
    const isInvoice = keywords.some((kw) => allText.toLowerCase().includes(kw.toLowerCase()));
    if (!isInvoice) return {};

    // Try to extract amount
    let amount: number | null = null;
    for (const pattern of AMOUNT_PATTERNS) {
      const match = allText.match(pattern);
      if (match) {
        amount = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }

    // Determine if income or expense
    const incomeKeywords = ['העברה לחשבון', 'זיכוי', 'משכורת', 'שכר', 'credit', 'deposit', 'refund', 'salary'];
    const isIncome = incomeKeywords.some((kw) => allText.toLowerCase().includes(kw.toLowerCase()));

    return {
      extractedAmount: amount,
      extractedDesc: subject.slice(0, 200),
      extractedType: isIncome ? 'income' : 'expense',
    };
  }
}
