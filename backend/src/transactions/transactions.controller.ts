import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdId } from '../common/decorators/household.decorator';
import { TransactionsService } from './transactions.service';
import { VoiceParserService, ParsedVoiceInput } from './voice-parser.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsQueryDto } from './dto/transactions-query.dto';

@Controller('api/transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private voiceParserService: VoiceParserService,
  ) {}

  /** POST /api/transactions - create manual transaction */
  @Post()
  create(
    @HouseholdId() businessId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(businessId, dto);
  }

  /** POST /api/transactions/parse-voice - parse Hebrew/English voice text into transaction data */
  @Post('parse-voice')
  async parseVoice(
    @HouseholdId() businessId: string,
    @Body() body: { text: string },
  ): Promise<ParsedVoiceInput | { error: string }> {
    const result = await this.voiceParserService.parseVoiceText(businessId, body.text ?? '');
    return result ?? { error: 'Could not parse voice input' };
  }

  /** POST /api/transactions/suggest-category - AI-based category suggestion */
  @Post('suggest-category')
  async suggestCategory(
    @HouseholdId() businessId: string,
    @Body() body: { description: string },
  ) {
    const categoryId = await this.transactionsService.suggestCategory(
      businessId,
      body.description ?? '',
    );
    return { categoryId };
  }

  /** POST /api/transactions/bulk-delete - bulk delete by IDs */
  @Post('bulk-delete')
  bulkDelete(
    @HouseholdId() businessId: string,
    @Body() body: { ids: string[] },
  ) {
    return this.transactionsService.removeMany(businessId, body.ids ?? []);
  }

  /** POST /api/transactions/bulk-update - bulk update category/account/date/description */
  @Post('bulk-update')
  bulkUpdate(
    @HouseholdId() businessId: string,
    @Body()
    body: {
      ids: string[];
      updates: {
        categoryId?: string | null;
        accountId?: string;
        date?: string;
        description?: string;
      };
    },
  ) {
    return this.transactionsService.bulkUpdate(
      businessId,
      body.ids ?? [],
      body.updates ?? {},
    );
  }

  /** POST /api/transactions/bulk-flip-sign - flip income/expense signs */
  @Post('bulk-flip-sign')
  bulkFlipSign(
    @HouseholdId() businessId: string,
    @Body() body: { ids: string[] },
  ) {
    return this.transactionsService.bulkFlipSign(businessId, body.ids ?? []);
  }

  /** GET /api/transactions - list with pagination, date range, account/category/client/project filters */
  @Get()
  findAll(
    @HouseholdId() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('clientId') clientId?: string,
    @Query('projectId') projectId?: string,
    @Query('search') search?: string,
    @Query('type') type?: 'income' | 'expense',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const query: TransactionsQueryDto = {
      from,
      to,
      accountId,
      categoryId,
      clientId,
      projectId,
      search,
      type,
      page: page ?? 1,
      limit: limit ?? 20,
    };
    return this.transactionsService.findAll(businessId, query);
  }

  /** GET /api/transactions/:id */
  @Get(':id')
  findOne(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.transactionsService.findOne(businessId, id);
  }

  /** PUT /api/transactions/:id - update transaction */
  @Put(':id')
  update(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(businessId, id, dto);
  }

  /** PATCH /api/transactions/:id/category - update category and learn rule from correction */
  @Patch(':id/category')
  updateCategory(
    @HouseholdId() businessId: string,
    @Param('id') id: string,
    @Body() body: { categoryId: string | null },
  ) {
    return this.transactionsService.updateCategory(
      businessId,
      id,
      body.categoryId ?? null,
    );
  }

  /** DELETE /api/transactions/:id */
  @Delete(':id')
  remove(@HouseholdId() businessId: string, @Param('id') id: string) {
    return this.transactionsService.remove(businessId, id);
  }
}
