import { Module } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { StocksController } from './stocks.controller';
import { StockPriceService } from './stock-price.service';

@Module({
  providers: [StocksService, StockPriceService],
  controllers: [StocksController],
  exports: [StocksService],
})
export class StocksModule {}
