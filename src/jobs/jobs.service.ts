import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EXPIRE_PROJECTS_JOB, MAINTENANCE_QUEUE } from './jobs.constants';

/**
 * Registers the daily midnight job. A BullMQ "job scheduler" lives in Redis,
 * so even with several server instances the job runs ONCE per night, and it is
 * not lost when the app restarts.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);

  constructor(@InjectQueue(MAINTENANCE_QUEUE) private queue: Queue) {}

  async onApplicationBootstrap() {
    const tz = process.env.CRON_TZ ?? 'Asia/Damascus';
    await this.queue.upsertJobScheduler(
      EXPIRE_PROJECTS_JOB,
      { pattern: '0 0 * * *', tz }, // every day at 00:00
      {
        name: EXPIRE_PROJECTS_JOB,
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      },
    );
    this.logger.log(
      `Scheduled "${EXPIRE_PROJECTS_JOB}" daily at 00:00 (${tz})`,
    );
  }

  /** Run it now (admin button / demos) — goes through the same queue and worker. */
  async runNow() {
    const job = await this.queue.add(EXPIRE_PROJECTS_JOB, {});
    return { jobId: job.id, queued: true };
  }
}
