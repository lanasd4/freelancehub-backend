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
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSkillDto, UpdateSkillDto } from './dto/skill.dto';
import { SkillsService } from './skills.service';

@Controller('skills')
export class SkillsController {
  constructor(private skills: SkillsService) {}

  @Public()
  @Get()
  findAll() {
    return this.skills.findAll();
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateSkillDto) {
    return this.skills.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSkillDto) {
    return this.skills.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.skills.remove(id);
  }
}
