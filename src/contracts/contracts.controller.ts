import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { multerOptions, UPLOAD_RULES } from '../common/files/files.service';
import { ContractsService } from './contracts.service';
import {
  CreateMilestoneDto,
  ListContractsDto,
  RequestRevisionDto,
  SubmitMilestoneDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';

@Controller()
export class ContractsController {
  constructor(private contracts: ContractsService) {}

  @Roles(Role.CLIENT, Role.FREELANCER)
  @Get('contracts')
  mine(@CurrentUser() user: AuthUser, @Query() query: ListContractsDto) {
    return this.contracts.mine(user, query);
  }

  /** parties + admin; includes milestones and the money still unallocated */
  @Get('contracts/:id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.findOne(id, user);
  }

  // ---- milestones: the client splits the work ----

  @Roles(Role.CLIENT)
  @Post('contracts/:id/milestones')
  addMilestone(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.contracts.addMilestone(id, user, dto);
  }

  @Roles(Role.CLIENT)
  @Patch('milestones/:id')
  updateMilestone(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.contracts.updateMilestone(id, user, dto);
  }

  @Roles(Role.CLIENT)
  @Delete('milestones/:id')
  @HttpCode(204)
  removeMilestone(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.removeMilestone(id, user);
  }

  // ---- delivery: the freelancer uploads files + a note ----

  /** multipart: "note" + up to 5 files in "files" (PDF/ZIP, 10MB each) */
  @Roles(Role.FREELANCER)
  @Post('milestones/:id/submissions')
  @UseInterceptors(
    FilesInterceptor(
      'files',
      UPLOAD_RULES.submission.maxFiles,
      multerOptions('submission'),
    ),
  )
  submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitMilestoneDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.contracts.submit(id, user, dto, files);
  }

  @Get('milestones/:id/submissions')
  submissions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.submissions(id, user);
  }

  @Get('submission-files/:id/download')
  download(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.downloadFile(id, user);
  }

  // ---- review: approve (pays) or send back ----

  @Roles(Role.CLIENT)
  @HttpCode(200)
  @Post('milestones/:id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.approve(id, user);
  }

  @Roles(Role.CLIENT)
  @HttpCode(200)
  @Post('milestones/:id/request-revision')
  requestRevision(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.contracts.requestRevision(id, user, dto);
  }
}
