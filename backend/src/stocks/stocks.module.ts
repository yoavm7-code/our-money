import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StocksService } from './stocks.service';
import { StocksController } from './stocks.controller';
import { StockPriceService } from './stock-price.service';

@Module({
  imports: [PrismaModule],
  controllers: [StocksController],
  providers: [StocksService, StockPriceService],
  exports: [StocksService, StockPriceService],
})
export class StocksModule {}
