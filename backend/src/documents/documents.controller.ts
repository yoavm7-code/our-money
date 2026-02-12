import {
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

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @HouseholdId() householdId: string,
    @Body('accountId') accountId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!accountId || !file) throw new Error('accountId and file are required');
    return this.documentsService.createFromFile(householdId, accountId, file);
  }

  @Get()
  findAll(@HouseholdId() householdId: string) {
    return this.documentsService.findAll(householdId);
  }

  @Get(':id')
  findOne(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.documentsService.findOne(householdId, id);
  }

  @Post(':id/confirm-import')
  confirmImport(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() body: { accountId: string; action: 'add_all' | 'skip_duplicates' | 'add_none'; selectedIndices?: number[] },
  ) {
    if (!body?.accountId || !body?.action) {
      throw new Error('accountId and action are required');
    }
    return this.documentsService.confirmImport(householdId, id, body);
  }
}
