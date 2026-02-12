import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { DocumentsService } from './documents.service';

@Controller('api/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  /**
   * POST /api/documents/upload
   * Upload a file (image/PDF/CSV/Excel/Word) linked to an accountId.
   * Triggers async processing: OCR -> AI extract -> create transactions.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @HouseholdId() businessId: string,
    @Body('accountId') accountId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!accountId) {
      throw new BadRequestException('accountId is required');
    }
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.documentsService.createFromFile(businessId, accountId, file);
  }

  /**
   * GET /api/documents
   * List all documents for this business.
   */
  @Get()
  findAll(@HouseholdId() businessId: string) {
    return this.documentsService.findAll(businessId);
  }

  /**
   * GET /api/documents/:id
   * Get a single document with its extracted transactions.
   */
  @Get(':id')
  findOne(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.documentsService.findOne(businessId, id);
  }

  /**
   * POST /api/documents/:id/confirm-import
   * Confirm importing extracted transactions from a document in PENDING_REVIEW status.
   * Actions: 'add_all' | 'skip_duplicates' | 'add_none'
   * Optionally provide selectedIndices to import only specific transactions.
   */
  @Post(':id/confirm-import')
  confirmImport(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body()
    body: {
      accountId: string;
      action: 'add_all' | 'skip_duplicates' | 'add_none';
      selectedIndices?: number[];
    },
  ) {
    if (!body?.accountId || !body?.action) {
      throw new BadRequestException('accountId and action are required');
    }
    return this.documentsService.confirmImport(businessId, id, body);
  }
}
