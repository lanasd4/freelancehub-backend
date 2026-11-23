import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { MAINTENANCE_QUEUE } from './jobs.constants';
import { JobsService } from './jobs.service';
import { MaintenanceProcessor } from './maintenance.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
    ProjectsModule,
  ],
  providers: [JobsService, MaintenanceProcessor],
  exports: [JobsService],
})
export class JobsModule {}
