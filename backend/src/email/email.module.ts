import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MessagingService } from './messaging.service';

@Global()
@Module({
  providers: [EmailService, MessagingService],
  exports: [EmailService, MessagingService],
})
export class EmailModule {}
