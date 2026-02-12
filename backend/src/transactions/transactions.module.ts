import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { VoiceParserService } from './voice-parser.service';
import { TransactionsController } from './transactions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoriesModule } from '../categories/categories.module';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [PrismaModule, CategoriesModule, RulesModule],
  providers: [TransactionsService, VoiceParserService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
