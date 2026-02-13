import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailIntegrationService } from './email-integration.service';
import { EmailIntegrationController } from './email-integration.controller';

@Module({
  imports: [PrismaModule],
  providers: [EmailIntegrationService],
  controllers: [EmailIntegrationController],
  exports: [EmailIntegrationService],
})
export class EmailIntegrationModule {}
