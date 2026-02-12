import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { RulesModule } from '../rules/rules.module';
import { OcrService } from './ocr.service';
import { AiExtractService } from './ai-extract.service';
import { DocumentParserService } from './document-parser.service';

@Module({
  imports: [
    TransactionsModule,
    RulesModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  ],
  providers: [DocumentsService, OcrService, AiExtractService, DocumentParserService],
  controllers: [DocumentsController],
  exports: [DocumentsService],
})
export class DocumentsModule {}
