import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { multerOptions } from '../common/files/files.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller('freelancers')
export class ProfilesController {
  constructor(private profiles: ProfilesService) {}

  // "me" routes are declared before ":id" so "me" is never parsed as an id
  @Roles(Role.FREELANCER)
  @Get('me/profile')
  myProfile(@CurrentUser() user: AuthUser) {
    return this.profiles.publicProfile(user.userId);
  }

  @Roles(Role.FREELANCER)
  @Patch('me/profile')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(user.userId, dto);
  }

  @Roles(Role.FREELANCER)
  @Put('me/avatar')
  @UseInterceptors(FileInterceptor('file', multerOptions('avatar')))
  avatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.profiles.setAvatar(user.userId, file);
  }

  @Roles(Role.FREELANCER)
  @Put('me/cv')
  @UseInterceptors(FileInterceptor('file', multerOptions('cv')))
  cv(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.profiles.setCv(user.userId, file);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.profiles.publicProfile(id);
  }
}
