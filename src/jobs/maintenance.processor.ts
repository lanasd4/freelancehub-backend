import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProjectsService } from '../projects/projects.service';
import { EXPIRE_PROJECTS_JOB, MAINTENANCE_QUEUE } from './jobs.constants';

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private projects: ProjectsService) {
    super();
  }

  async process(job: Job) {
    if (job.name === EXPIRE_PROJECTS_JOB) {
      const result = await this.projects.expireOverdue();
      this.logger.log(`expire-projects: cancelled ${result.cancelled}`);
      return result;
    }
  }
}
