import { Injectable, Logger } from '@nestjs/common';
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

/** Multer may decode UTF-8 filenames as Latin-1, producing mojibake for Hebrew/non-ASCII.
 *  Re-interpret the bytes as UTF-8 when possible. */
function fixFilename(raw: string): string {
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    // If decoding produced replacement characters, the original was already valid UTF-8
    if (decoded.includes('\uFFFD')) return raw;
    return decoded;
  } catch {
    return raw;
  }
}

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
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private rulesService: RulesService,
    private ocrService: OcrService,
    private aiExtractService: AiExtractService,
    private documentParser: DocumentParserService,
  ) {}

  // ──────────────────────────────────────────────
  //  Upload & Create Document Record
  // ──────────────────────────────────────────────

  async createFromFile(
    businessId: string,
    accountId: string,
    file: Express.Multer.File,
  ) {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new Error(
        'Invalid file type. Allowed: JPEG, PNG, WebP, PDF, CSV, Excel (.xlsx, .xls), Word (.docx, .doc)',
      );
    }

    const fileName = fixFilename(file.originalname);
    const storagePath = path.join(UPLOAD_DIR, businessId, `${Date.now()}-${fileName}`);
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storagePath, file.buffer);

    const doc = await this.prisma.document.create({
      data: {
        businessId,
        fileName,
        mimeType: file.mimetype,
        storagePath,
        fileSize: file.size,
        status: 'PENDING',
      },
    });

    // Trigger async processing (fire-and-forget)
    this.processDocument(businessId, accountId, doc.id).catch((err) => {
      this.logger.error('Document processing error:', err);
    });

    return doc;
  }

  // ──────────────────────────────────────────────
  //  Document Processing Pipeline
  // ──────────────────────────────────────────────

  async processDocument(businessId: string, accountId: string, documentId: string) {
    await this.prisma.document.updateMany({
      where: { id: documentId, businessId },
      data: { status: 'PROCESSING' },
    });

    try {
      const doc = await this.prisma.document.findFirst({
        where: { id: documentId, businessId },
      });
      if (!doc || !fs.existsSync(doc.storagePath)) {
        throw new Error('Document or file not found');
      }

      let ocrText = '';
      let extracted: Awaited<ReturnType<typeof this.aiExtractService.extractTransactions>> = [];
      const userContext = await this.buildUserContext(businessId);

      // Route processing based on mime type
      if (doc.mimeType.startsWith('image/')) {
        // Use Vision API for images (much more accurate than OCR + text extraction)
        this.logger.log(`Using Vision API for image: ${doc.fileName}`);
        try {
          extracted = await this.aiExtractService.extractWithVision(doc.storagePath, userContext);
          ocrText = '[Vision API - no OCR text]';

          // If Vision returns nothing, fall back to OCR
          if (extracted.length === 0) {
            this.logger.warn(`Vision API returned 0 transactions, falling back to OCR for: ${doc.fileName}`);
            ocrText = await this.ocrService.getTextFromImage(doc.storagePath);
            if (ocrText && ocrText.trim().length >= 10) {
              extracted = await this.aiExtractService.extractTransactions(ocrText, userContext);
            }
          }
        } catch (visionErr) {
          this.logger.error('Vision API failed, falling back to OCR:', visionErr);
          ocrText = await this.ocrService.getTextFromImage(doc.storagePath);
          if (ocrText && ocrText.trim().length >= 10) {
            extracted = await this.aiExtractService.extractTransactions(ocrText, userContext);
          }
        }
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
            this.logger.log(`Using Vision API for PDF: ${doc.fileName} (${pdfImages.length} pages)`);
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
          this.logger.warn('PDF conversion failed, trying text extraction:', pdfErr);
          // Fall back to text extraction from PDF
          ocrText = await this.documentParser.getTextFromFile(doc.storagePath, doc.mimeType);
          if (ocrText && ocrText.trim().length >= 10) {
            extracted = await this.aiExtractService.extractTransactions(ocrText, userContext);
          } else {
            await this.prisma.document.updateMany({
              where: { id: documentId, businessId },
              data: { status: 'FAILED', errorMessage: 'Could not extract text from PDF. Try converting to image first.' },
            });
            return;
          }
        }
      }

      // Store OCR text (truncated)
      await this.prisma.document.updateMany({
        where: { id: documentId, businessId },
        data: { ocrText: ocrText.slice(0, 50000) },
      });

      if (extracted.length === 0) {
        this.logger.warn(`Document ${documentId}: No transactions extracted. Check image quality or try a different format.`);
      }

      // ── Duplicate Detection ──
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
            businessId,
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

      // If duplicates found, set PENDING_REVIEW for user confirmation
      if (hasAnyDuplicate) {
        await this.prisma.document.updateMany({
          where: { id: documentId, businessId },
          data: {
            status: 'PENDING_REVIEW',
            extractedJson: enriched as unknown as object,
            processedAt: new Date(),
          },
        });
        return;
      }

      // No duplicates - create all transactions
      await this.transactionsService.createMany(
        businessId,
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
        where: { id: documentId, businessId },
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
        where: { id: documentId, businessId },
        data: { status: 'FAILED', errorMessage: message },
      });
    }
  }

  // ──────────────────────────────────────────────
  //  PDF -> Image Conversion
  // ──────────────────────────────────────────────

  /**
   * Convert PDF to images for Vision API processing.
   * Returns array of temporary image file paths.
   */
  private async convertPdfToImages(pdfPath: string): Promise<string[]> {
    const tempDir = path.join(path.dirname(pdfPath), 'temp_pdf_images');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
      const { execSync } = require('child_process');
      const baseName = path.basename(pdfPath, '.pdf');
      const outputPattern = path.join(tempDir, `${baseName}-page`);

      // Try pdftoppm (Linux/Mac with poppler) or pdftocairo
      try {
        execSync(`pdftoppm -png -r 200 "${pdfPath}" "${outputPattern}"`, {
          timeout: 60000,
          stdio: 'pipe',
        });
      } catch {
        // Try pdftocairo as fallback
        execSync(`pdftocairo -png -r 200 "${pdfPath}" "${outputPattern}"`, {
          timeout: 60000,
          stdio: 'pipe',
        });
      }

      // Find generated images
      const files = fs.readdirSync(tempDir);
      const images = files
        .filter((f) => f.startsWith(baseName) && (f.endsWith('.png') || f.endsWith('.jpg')))
        .sort()
        .map((f) => path.join(tempDir, f));

      return images;
    } catch (err) {
      this.logger.warn('PDF to image conversion failed:', err);
      try {
        fs.rmSync(tempDir, { recursive: true });
      } catch { /* ignore */ }
      return [];
    }
  }

  // ──────────────────────────────────────────────
  //  User Context (for AI extraction)
  // ──────────────────────────────────────────────

  /** Build context from user's rules and recent transactions so the AI can learn their preferences. */
  private async buildUserContext(businessId: string): Promise<string> {
    const parts: string[] = [];
    try {
      const rules = await this.rulesService.findAll(businessId);
      if (rules.length > 0) {
        const ruleLines = rules
          .slice(0, 30)
          .map(
            (r) =>
              'when description contains "' +
              ((r.pattern || '').slice(0, 40)) +
              '" use category ' +
              ((r.category as { slug?: string })?.slug ?? 'other'),
          );
        parts.push('Rules (learned from user corrections): ' + ruleLines.join('; '));
      }

      const recent = await this.prisma.transaction.findMany({
        where: { businessId },
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

  // ──────────────────────────────────────────────
  //  Find All / Find One
  // ──────────────────────────────────────────────

  async findAll(businessId: string) {
    const docs = await this.prisma.document.findMany({
      where: { businessId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        uploadedAt: true,
        processedAt: true,
        extractedJson: true,
        _count: { select: { transactions: true } },
      },
    });
    // Return extractedCount (from extractedJson) so UI shows how many were
    // originally extracted, even if transactions were later deleted.
    return docs.map(({ extractedJson, ...rest }) => ({
      ...rest,
      extractedCount: Array.isArray(extractedJson) ? extractedJson.length : 0,
    }));
  }

  async findOne(businessId: string, id: string) {
    return this.prisma.document.findFirst({
      where: { id, businessId },
      include: { transactions: true, _count: { select: { transactions: true } } },
    });
  }

  // ──────────────────────────────────────────────
  //  Confirm Import (from PENDING_REVIEW)
  // ──────────────────────────────────────────────

  /** Confirm import after PENDING_REVIEW: create selected transactions and set COMPLETED. */
  async confirmImport(
    businessId: string,
    documentId: string,
    body: {
      accountId: string;
      action: 'add_all' | 'skip_duplicates' | 'add_none';
      selectedIndices?: number[];
    },
  ) {
    const accountId = body.accountId;
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, businessId },
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
        where: { id: documentId, businessId },
        data: { status: 'COMPLETED', processedAt: new Date() },
      });
      return this.findOne(businessId, documentId);
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
        businessId,
        accountId,
        items,
        TransactionSource.UPLOAD,
        documentId,
      );
    }

    await this.prisma.document.updateMany({
      where: { id: documentId, businessId },
      data: { status: 'COMPLETED', processedAt: new Date() },
    });

    return this.findOne(businessId, documentId);
  }
}
