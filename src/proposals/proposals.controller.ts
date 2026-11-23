import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateProposalDto,
  ListMyProposalsDto,
  ListProjectProposalsDto,
  UpdateProposalDto,
} from './dto/proposal.dto';
import { ProposalsService } from './proposals.service';

@Controller()
export class ProposalsController {
  constructor(private proposals: ProposalsService) {}

  @Roles(Role.FREELANCER)
  @Post('projects/:projectId/proposals')
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProposalDto,
  ) {
    return this.proposals.create(projectId, user, dto);
  }

  @Roles(Role.CLIENT)
  @Get('projects/:projectId/proposals')
  listForProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: AuthUser,
    @Query() query: ListProjectProposalsDto,
  ) {
    return this.proposals.listForProject(projectId, user, query);
  }

  @Roles(Role.FREELANCER)
  @Get('proposals/mine')
  mine(@CurrentUser() user: AuthUser, @Query() query: ListMyProposalsDto) {
    return this.proposals.mine(user, query);
  }

  @Roles(Role.FREELANCER)
  @Patch('proposals/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProposalDto,
  ) {
    return this.proposals.update(id, user, dto);
  }

  @Roles(Role.FREELANCER)
  @HttpCode(200)
  @Post('proposals/:id/withdraw')
  withdraw(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.proposals.withdraw(id, user);
  }

  @Roles(Role.CLIENT)
  @HttpCode(200)
  @Post('proposals/:id/accept')
  accept(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.proposals.accept(id, user);
  }
}
