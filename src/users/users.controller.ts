import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListUsersDto } from './dto/list-users.dto';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('users/me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.userId);
  }

  // ---- admin ----

  @Roles(Role.ADMIN)
  @Get('admin/users')
  list(@Query() query: ListUsersDto) {
    return this.users.list(query);
  }

  @Roles(Role.ADMIN)
  @Post('admin/users/:id/ban')
  ban(@Param('id', ParseIntPipe) id: number) {
    return this.users.setBanned(id, true);
  }

  @Roles(Role.ADMIN)
  @Post('admin/users/:id/unban')
  unban(@Param('id', ParseIntPipe) id: number) {
    return this.users.setBanned(id, false);
  }
}
