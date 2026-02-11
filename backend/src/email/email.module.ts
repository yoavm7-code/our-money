import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MessagingService } from './messaging.service';

@Module({
  providers: [EmailService, MessagingService],
  exports: [EmailService, MessagingService],
})
export class EmailModule {}
