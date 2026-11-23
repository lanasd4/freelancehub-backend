import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { MailJob } from './mail.constants';

/**
 * Talks to the SMTP server. Without SMTP_HOST (local development) the message
 * is only written to the server log, so the app runs with zero setup.
 */
@Injectable()
export class MailSender {
  private readonly logger = new Logger(MailSender.name);
  private readonly transport?: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from =
      config.get<string>('MAIL_FROM') ??
      'FreelanceHub <no-reply@freelancehub.local>';
    const host = config.get<string>('SMTP_HOST');
    if (host) {
      this.transport = createTransport({
        host,
        port: config.get<number>('SMTP_PORT') ?? 587,
        secure: config.get<number>('SMTP_PORT') === 465,
        auth: config.get<string>('SMTP_USER')
          ? {
              user: config.get<string>('SMTP_USER'),
              pass: config.get<string>('SMTP_PASS'),
            }
          : undefined,
      });
    }
  }

  async send(mail: MailJob) {
    if (!this.transport) {
      this.logger.log(`[dev mail] to=${mail.to} subject="${mail.subject}"`);
      return;
    }
    // a thrown error here makes BullMQ retry the job with backoff
    await this.transport.sendMail({ from: this.from, ...mail });
  }
}
