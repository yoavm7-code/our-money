import { Injectable } from '@nestjs/common';
import { createWorker, Worker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OCR Service – supports Tesseract (local) and can be extended for
 * Google Vision / AWS Textract via OCR_PROVIDER env.
 */
@Injectable()
export class OcrService {
  private worker: Worker | null = null;

  async getTextFromImage(imagePath: string): Promise<string> {
    const provider = process.env.OCR_PROVIDER || 'tesseract';
    if (provider === 'tesseract') {
      return this.tesseractExtract(imagePath);
    }
    // Placeholder for Google Vision / AWS Textract:
    // if (provider === 'google') return this.googleVisionExtract(imagePath);
    // if (provider === 'aws') return this.awsTextractExtract(imagePath);
    return this.tesseractExtract(imagePath);
  }

  private async tesseractExtract(imagePath: string): Promise<string> {
    if (!fs.existsSync(imagePath)) return '';
    // Use Hebrew + English for Israeli statements (תאריך, בית עסק, סכום חיוב, etc.)
    const lang = process.env.OCR_LANG || 'heb+eng';
    if (!this.worker) {
      this.worker = await createWorker(lang, 1, { logger: () => {} });
    }
    const {
      data: { text },
    } = await this.worker.recognize(imagePath);
    return text || '';
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
