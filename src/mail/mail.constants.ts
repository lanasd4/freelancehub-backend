export const MAIL_QUEUE = 'mail';

export interface MailJob {
  to: string;
  subject: string;
  text: string;
}

/**
 * Email delivery may fail (the provider is sometimes down). A failed job is
 * retried automatically, waiting longer each time: 5s, 10s, 20s, 40s, 80s.
 */
export const MAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 1000, // keep the last 1000 for inspection
  removeOnFail: false, // keep failures for investigation
} as const;
