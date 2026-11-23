import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MAIL_QUEUE, MailJob } from './mail.constants';
import { MailSender } from './mail.sender';

/** The Worker: takes jobs from the "mail" queue in the background (guide ch.21). */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private sender: MailSender) {
    super();
  }

  async process(job: Job<MailJob>) {
    await this.sender.send(job.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MailJob>, err: Error) {
    this.logger.warn(
      `Mail job ${job.id} to ${job.data.to} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
    );
  }
}
