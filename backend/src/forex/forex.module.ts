import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ForexController } from './forex.controller';
import { ForexService } from './forex.service';

@Module({
  imports: [PrismaModule],
  controllers: [ForexController],
  providers: [ForexService],
  exports: [ForexService],
})
export class ForexModule {}
