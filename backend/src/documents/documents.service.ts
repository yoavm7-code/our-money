import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionSource } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { TransactionsService } from '../transactions/transactions.service';
import { RulesService } from '../rules/rules.service';
import { OcrService } from './ocr.service';
import { AiExtractService } from './ai-extract.service';
import { DocumentParserService, STRUCTURED_MIMES } from './document-parser.service';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
];

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private rulesService: RulesService,
    private ocrService: OcrService,
    private aiExtractService: AiExtractService,
    private documentParser: DocumentParserService,
  ) {}

  async createFromFile(
    householdId: string,
    accountId: string,
    file: Express.Multer.File,
  ) {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new Error(
        'Invalid file type. Allowed: JPEG, PNG, WebP, PDF, CSV, Excel (.xlsx, .xls), Word (.docx, .doc)',
      );
    }
    const storagePath = path.join(UPLOAD_DIR, householdId, `${Date.now()}-${file.originalname}`);
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storagePath, file.buffer);

    const doc = await this.prisma.document.create({
      data: {
        householdId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        storagePath,
        fileSize: file.size,
        status: 'PENDING',
      },
    });

    this.processDocument(householdId, accountId, doc.id).catch((err) => {
      console.error('Document processing error:', err);
    });

    return doc;
  }

  async processDocument(householdId: string, accountId: string, documentId: string) {
    await this.prisma.document.updateMany({
      where: { id: documentId, householdId },
      data: { status: 'PROCESSING' },
    });

    try {
      const doc = await this.prisma.document.findFirst({
        where: { id: documentId, householdId },
      });
      if (!doc || !fs.existsSync(doc.storagePath)) {
        throw new Error('Document or file not found');
      }

      let ocrText = '';
      let extracted: Awaited<ReturnType<typeof this.aiExtractService.extractTransactions>> = [];
      const userContext = await this.buildUserContext(householdId);

      // Use Vision API for images (much more accurate than OCR + text extraction)
      if (doc.mimeType.startsWith('image/')) {
        console.log('[Documents] Using Vision API for image:', doc.fileName);
        extracted = await this.aiExtractService.extractWithVision(doc.storagePath, userContext);
        ocrText = '[Vision API - no OCR text]';
      } else if (STRUCTURED_MIMES.includes(doc.mimeType)) {
        // CSV, Excel, Word - parse text and use text-based extraction
        ocrText = await this.documentParser.getTextFromFile(doc.storagePath, doc.mimeType);
        if (ocrText && ocrText.trim().length >= 10) {
          extracted = await this.aiExtractService.extractTransactions(ocrText, userContext);
        }
      } else if (doc.mimeType === 'application/pdf') {
        // PDF - try to convert to image and use Vision, or fall back to text extraction
        try {
          const pdfImages = await this.convertPdfToImages(doc.storagePath);
          if (pdfImages.length > 0) {
            console.log('[Documents] Using Vision API for PDF:', doc.fileName, '(' + pdfImages.length + ' pages)');
            for (const imagePath of pdfImages) {
              const pageExtracted = await this.aiExtractService.extractWithVision(imagePath, userContext);
              extracted.push(...pageExtracted);
              // Clean up temp image
              try { fs.unlinkSync(imagePath); } catch { /* ignore */ }
            }
            ocrText = '[Vision API from PDF - no OCR text]';
          } else {
            throw new Error('Could not convert PDF to images');
          }
        } catch (pdfErr) {
          console.warn('[Documents] PDF conversion failed, trying text extraction:', pdfErr);
          // Fall back to text extraction from PDF
          ocrText = await this.documentParser.getTextFromFile(doc.storagePath, doc.mimeType);
          if (ocrText && ocrText.trim().length >= 10) {
            extracted = await this.aiExtractService.extractTransactions(ocrText, userContext);
          } else {
            await this.prisma.document.updateMany({
              where: { id: documentId, householdId },
              data: { status: 'FAILED', errorMessage: 'Could not extract text from PDF. Try converting to image first.' },
            });
            return;
          }
        }
      }

      await this.prisma.document.updateMany({
        where: { id: documentId, householdId },
        data: { ocrText: ocrText.slice(0, 50000) },
      });

      if (extracted.length === 0) {
        console.warn('[Documents] Document ' + documentId + ': No transactions extracted. Check image quality or try a different format.');
      }

      // Check for duplicates: same account, date, amount, description
      type EnrichedItem = (typeof extracted)[0] & {
        isDuplicate?: boolean;
        existingTransaction?: { id: string; date: string; amount: number; description: string };
      };
      const enriched: EnrichedItem[] = [];
      let hasAnyDuplicate = false;
      for (const e of extracted) {
        const dateStr = String(e.date || '').trim().slice(0, 10);
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          enriched.push({ ...e });
          continue;
        }
        const existing = await this.prisma.transaction.findFirst({
          where: {
            householdId,
            accountId,
            date: new Date(dateStr + 'T00:00:00.000Z'),
            amount: e.amount,
            description: e.description,
          },
          select: { id: true, date: true, amount: true, description: true },
        });
        if (existing) {
          hasAnyDuplicate = true;
          enriched.push({
            ...e,
            isDuplicate: true,
            existingTransaction: {
              id: existing.id,
              date: existing.date instanceof Date ? existing.date.toISOString().slice(0, 10) : String(existing.date),
              amount: Number(existing.amount),
              description: String(existing.description || ''),
            },
          });
        } else {
          enriched.push({ ...e });
        }
      }

      if (hasAnyDuplicate) {
        await this.prisma.document.updateMany({
          where: { id: documentId, householdId },
          data: {
            status: 'PENDING_REVIEW',
            extractedJson: enriched as unknown as object,
            processedAt: new Date(),
          },
        });
        return;
      }

      // No duplicates – create all
      await this.transactionsService.createMany(
        householdId,
        accountId,
        extracted.map((e) => ({
          date: e.date,
          description: e.description,
          amount: e.amount,
          categorySlug: e.categorySlug,
          totalAmount: e.totalAmount,
          installmentCurrent: e.installmentCurrent,
          installmentTotal: e.installmentTotal,
        })),
        TransactionSource.UPLOAD,
        documentId,
      );

      await this.prisma.document.updateMany({
        where: { id: documentId, householdId },
        data: {
          status: 'COMPLETED',
          extractedJson: extracted as unknown as object,
          processedAt: new Date(),
          ...(extracted.length === 0 && {
            errorMessage: 'No transactions extracted. Try better image quality or expand date range on Transactions page.',
          }),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.document.updateMany({
        where: { id: documentId, householdId },
        data: { status: 'FAILED', errorMessage: message },
      });
    }
  }

  /**
   * Convert PDF to images for Vision API processing.
   * Returns array of temporary image file paths.
   */
  private async convertPdfToImages(pdfPath: string): Promise<string[]> {
    const tempDir = path.join(path.dirname(pdfPath), 'temp_pdf_images');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Try using pdf-poppler (requires poppler-utils installed on system)
      const { execSync } = require('child_process');
      const baseName = path.basename(pdfPath, '.pdf');
      const outputPattern = path.join(tempDir, `${baseName}-page`);
      
      // Try pdftoppm (Linux/Mac with poppler) or pdftocairo
      try {
        execSync(`pdftoppm -png -r 200 "${pdfPath}" "${outputPattern}"`, { 
          timeout: 60000,
          stdio: 'pipe' 
        });
      } catch {
        // Try pdftocairo as fallback
        execSync(`pdftocairo -png -r 200 "${pdfPath}" "${outputPattern}"`, { 
          timeout: 60000,
          stdio: 'pipe' 
        });
      }

      // Find generated images
      const files = fs.readdirSync(tempDir);
      const images = files
        .filter(f => f.startsWith(baseName) && (f.endsWith('.png') || f.endsWith('.jpg')))
        .sort()
        .map(f => path.join(tempDir, f));

      return images;
    } catch (err) {
      console.warn('[Documents] PDF to image conversion failed:', err);
      // Clean up temp directory
      try {
        fs.rmSync(tempDir, { recursive: true });
      } catch { /* ignore */ }
      return [];
    }
  }

  /** Build context from user's rules and recent transactions so the AI can learn their preferences. */
  private async buildUserContext(householdId: string): Promise<string> {
    const parts: string[] = [];
    try {
      const rules = await this.rulesService.findAll(householdId);
      if (rules.length > 0) {
        const ruleLines = rules
          .slice(0, 30)
          .map((r) => 'when description contains "' + ((r.pattern || '').slice(0, 40)) + '" use category ' + ((r.category as { slug?: string })?.slug ?? 'other'));
        parts.push('Rules (learned from user corrections): ' + ruleLines.join('; '));
      }
      const recent = await this.prisma.transaction.findMany({
        where: { householdId },
        orderBy: { date: 'desc' },
        take: 50,
        select: { description: true, category: { select: { slug: true } } },
      });
      const seen = new Set<string>();
      const recentLines: string[] = [];
      for (const t of recent) {
        const desc = (t.description || '').trim().slice(0, 50);
        const slug = (t.category as { slug?: string } | null)?.slug ?? 'other';
        if (desc && !seen.has(desc)) {
          seen.add(desc);
          recentLines.push('"' + desc + '" -> ' + slug);
        }
      }
      if (recentLines.length > 0) {
        parts.push('Recent categorizations (prefer when description matches): ' + recentLines.slice(0, 25).join('; '));
      }
    } catch {
      // ignore - context is optional
    }
    return parts.join('\n');
  }

  async findAll(householdId: string) {
    return this.prisma.document.findMany({
      where: { householdId },
      orderBy: { uploadedAt: 'desc' },
      include: { _count: { select: { transactions: true } } },
    });
  }

  async findOne(householdId: string, id: string) {
    return this.prisma.document.findFirst({
      where: { id, householdId },
      include: { transactions: true, _count: { select: { transactions: true } } },
    });
  }

  /** Confirm import after PENDING_REVIEW: create selected transactions and set COMPLETED. */
  async confirmImport(
    householdId: string,
    documentId: string,
    body: { accountId: string; action: 'add_all' | 'skip_duplicates' | 'add_none'; selectedIndices?: number[] },
  ) {
    const accountId = body.accountId;
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, householdId },
    });
    if (!doc || doc.status !== 'PENDING_REVIEW') {
      throw new Error('Document not found or not pending review');
    }
    const raw = doc.extractedJson as Array<{
      date: string;
      description: string;
      amount: number;
      categorySlug?: string;
      totalAmount?: number;
      installmentCurrent?: number;
      installmentTotal?: number;
      isDuplicate?: boolean;
    }> | null;
    if (!Array.isArray(raw) || raw.length === 0 || body.action === 'add_none') {
      await this.prisma.document.updateMany({
        where: { id: documentId, householdId },
        data: { status: 'COMPLETED', processedAt: new Date() },
      });
      return this.findOne(householdId, documentId);
    }
    let toCreate = raw;
    if (body.action === 'skip_duplicates') {
      toCreate = raw.filter((t) => !t.isDuplicate);
    } else if (Array.isArray(body.selectedIndices) && body.selectedIndices.length > 0) {
      toCreate = body.selectedIndices
        .filter((i) => i >= 0 && i < raw.length)
        .map((i) => raw[i]);
    }
    const items = toCreate.map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      categorySlug: t.categorySlug,
      totalAmount: t.totalAmount,
      installmentCurrent: t.installmentCurrent,
      installmentTotal: t.installmentTotal,
    }));
    if (items.length > 0) {
      await this.transactionsService.createMany(
        householdId,
        accountId,
        items,
        TransactionSource.UPLOAD,
        documentId,
      );
    }
    await this.prisma.document.updateMany({
      where: { id: documentId, householdId },
      data: { status: 'COMPLETED', processedAt: new Date() },
    });
    return this.findOne(householdId, documentId);
  }
}
