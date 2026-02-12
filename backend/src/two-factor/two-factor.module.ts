import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorController } from './two-factor.controller';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [TwoFactorService],
  controllers: [TwoFactorController],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
