import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MAIL_QUEUE } from './mail.constants';
import { MailProcessor } from './mail.processor';
import { MailSender } from './mail.sender';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailSender, MailProcessor],
  exports: [BullModule], // lets other modules @InjectQueue('mail')
})
export class MailModule {}
