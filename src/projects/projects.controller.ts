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
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { multerOptions, UPLOAD_RULES } from '../common/files/files.service';
import {
  CreateProjectDto,
  ListProjectsDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

const MAX = UPLOAD_RULES.attachment.maxFiles;

@Controller('projects')
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Public()
  @Get()
  list(@Query() query: ListProjectsDto) {
    return this.projects.list(query);
  }

  // declared before ':id' so "mine" is not parsed as an id
  @Roles(Role.CLIENT, Role.FREELANCER)
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.projects.mine(user, query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projects.findOne(id);
  }

  /** multipart/form-data: fields + up to 5 files in "attachments" */
  @Roles(Role.CLIENT)
  @Post()
  @UseInterceptors(
    FilesInterceptor('attachments', MAX, multerOptions('attachment')),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProjectDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.projects.create(user, dto, files);
  }

  @Roles(Role.CLIENT)
  @Patch(':id')
  @UseInterceptors(
    FilesInterceptor('attachments', MAX, multerOptions('attachment')),
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProjectDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.projects.update(id, user, dto, files);
  }

  @Roles(Role.CLIENT)
  @Delete(':id/attachments/:attachmentId')
  @HttpCode(204)
  removeAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.removeAttachment(id, attachmentId, user);
  }

  @Roles(Role.CLIENT)
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.projects.cancel(id, user);
  }

  /** Soft delete (kept in the database). */
  @Roles(Role.CLIENT)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.projects.remove(id, user);
  }
}
