import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JobsService } from '../jobs/jobs.service';
import { AdminService } from './admin.service';

@Roles(Role.ADMIN) // every route of this controller is admin-only
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private jobs: JobsService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  /** Runs the midnight "expire overdue projects" job right now. */
  @HttpCode(202)
  @Post('jobs/expire-projects')
  expireNow() {
    return this.jobs.runNow();
  }
}
