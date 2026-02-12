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

  @Post()
  create(@HouseholdId() householdId: string, @Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(householdId, dto);
  }

  @Post('parse-voice')
  async parseVoice(
    @HouseholdId() householdId: string,
    @Body() body: { text: string },
  ): Promise<ParsedVoiceInput | { error: string }> {
    const result = await this.voiceParserService.parseVoiceText(householdId, body.text ?? '');
    return result ?? { error: 'Could not parse voice input' };
  }

  @Post('suggest-category')
  async suggestCategory(
    @HouseholdId() householdId: string,
    @Body() body: { description: string },
  ) {
    const categoryId = await this.transactionsService.suggestCategory(householdId, body.description ?? '');
    return { categoryId };
  }

  @Post('bulk-delete')
  bulkDelete(
    @HouseholdId() householdId: string,
    @Body() body: { ids: string[] },
  ) {
    return this.transactionsService.removeMany(householdId, body.ids ?? []);
  }

  @Post('bulk-update')
  bulkUpdate(
    @HouseholdId() householdId: string,
    @Body() body: { ids: string[]; updates: { categoryId?: string | null; date?: string; description?: string } },
  ) {
    return this.transactionsService.bulkUpdate(householdId, body.ids ?? [], body.updates ?? {});
  }

  @Post('bulk-flip-sign')
  bulkFlipSign(
    @HouseholdId() householdId: string,
    @Body() body: { ids: string[] },
  ) {
    return this.transactionsService.bulkFlipSign(householdId, body.ids ?? []);
  }

  @Get()
  findAll(
    @HouseholdId() householdId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
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
      search,
      type,
      page: page ?? 1,
      limit: limit ?? 20,
    };
    return this.transactionsService.findAll(householdId, query);
  }

  @Get(':id')
  findOne(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.transactionsService.findOne(householdId, id);
  }

  @Put(':id')
  update(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(householdId, id, dto);
  }

  @Patch(':id/category')
  updateCategory(
    @HouseholdId() householdId: string,
    @Param('id') id: string,
    @Body() body: { categoryId: string | null },
  ) {
    return this.transactionsService.updateCategory(
      householdId,
      id,
      body.categoryId ?? null,
    );
  }

  @Delete(':id')
  remove(@HouseholdId() householdId: string, @Param('id') id: string) {
    return this.transactionsService.remove(householdId, id);
  }
}
