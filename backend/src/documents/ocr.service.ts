import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createWorker, Worker } from 'tesseract.js';
import * as fs from 'fs';

/**
 * OCR Service - extracts text from images using Tesseract.js with
 * Hebrew + English language support (for Israeli financial documents).
 *
 * Supports fallback providers (Google Vision, AWS Textract) via OCR_PROVIDER env.
 * Currently only Tesseract is fully implemented; others are stubs.
 */
@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private worker: Worker | null = null;

  /**
   * Extract text from an image file.
   * Routes to the configured provider (tesseract by default).
   */
  async getTextFromImage(imagePath: string): Promise<string> {
    const provider = (process.env.OCR_PROVIDER || 'tesseract').toLowerCase();

    switch (provider) {
      case 'google':
      case 'google_vision':
        return this.googleVisionExtract(imagePath);
      case 'aws':
      case 'textract':
        return this.awsTextractExtract(imagePath);
      case 'tesseract':
      default:
        return this.tesseractExtract(imagePath);
    }
  }

  // ──────────────────────────────────────────────
  //  Tesseract.js (default, local OCR)
  // ──────────────────────────────────────────────

  private async tesseractExtract(imagePath: string): Promise<string> {
    if (!fs.existsSync(imagePath)) {
      this.logger.warn(`OCR file not found: ${imagePath}`);
      return '';
    }

    // Use Hebrew + English for Israeli statements
    // (e.g. dates, merchant names in Latin, amounts, Hebrew descriptions)
    const lang = process.env.OCR_LANG || 'heb+eng';

    try {
      if (!this.worker) {
        this.logger.log(`Initializing Tesseract worker with language: ${lang}`);
        this.worker = await createWorker(lang, 1, {
          logger: () => {},
        });
      }

      const {
        data: { text },
      } = await this.worker.recognize(imagePath);

      this.logger.log(`Tesseract extracted ${(text || '').length} chars from ${imagePath}`);
      return text || '';
    } catch (err) {
      this.logger.error('Tesseract OCR failed:', err instanceof Error ? err.message : err);
      // If worker is broken, reset it for next attempt
      await this.terminate();
      return '';
    }
  }

  // ──────────────────────────────────────────────
  //  Google Vision API (stub)
  // ──────────────────────────────────────────────

  /**
   * Google Cloud Vision API text detection.
   * Requires GOOGLE_APPLICATION_CREDENTIALS env or GOOGLE_VISION_API_KEY.
   *
   * Stub implementation - returns empty string with a warning.
   * To implement: npm install @google-cloud/vision, then use ImageAnnotatorClient.
   */
  private async googleVisionExtract(imagePath: string): Promise<string> {
    this.logger.warn(
      'Google Vision OCR is not yet implemented. Set OCR_PROVIDER=tesseract or provide a full implementation.',
    );

    // Future implementation:
    // const vision = require('@google-cloud/vision');
    // const client = new vision.ImageAnnotatorClient();
    // const [result] = await client.textDetection(imagePath);
    // const detections = result.textAnnotations;
    // return detections?.[0]?.description || '';

    // Fall back to Tesseract
    return this.tesseractExtract(imagePath);
  }

  // ──────────────────────────────────────────────
  //  AWS Textract (stub)
  // ──────────────────────────────────────────────

  /**
   * AWS Textract text detection.
   * Requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION env vars.
   *
   * Stub implementation - returns empty string with a warning.
   * To implement: npm install @aws-sdk/client-textract, then use DetectDocumentTextCommand.
   */
  private async awsTextractExtract(imagePath: string): Promise<string> {
    this.logger.warn(
      'AWS Textract OCR is not yet implemented. Set OCR_PROVIDER=tesseract or provide a full implementation.',
    );

    // Future implementation:
    // const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');
    // const client = new TextractClient({ region: process.env.AWS_REGION });
    // const fileBuffer = fs.readFileSync(imagePath);
    // const command = new DetectDocumentTextCommand({
    //   Document: { Bytes: fileBuffer },
    // });
    // const response = await client.send(command);
    // const blocks = response.Blocks?.filter(b => b.BlockType === 'LINE') || [];
    // return blocks.map(b => b.Text || '').join('\n');

    // Fall back to Tesseract
    return this.tesseractExtract(imagePath);
  }

  // ──────────────────────────────────────────────
  //  Cleanup
  // ──────────────────────────────────────────────

  async terminate() {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // ignore termination errors
      }
      this.worker = null;
    }
  }

  async onModuleDestroy() {
    await this.terminate();
  }
}
