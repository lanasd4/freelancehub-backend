import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { limits } from '../common/limits';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

const meta = (req: Request) => ({ ip: req.ip, ua: req.headers['user-agent'] });
const HOUR = 60 * 60_000;

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // The brief: no more than 3 new accounts per hour from the same source.
  @Public()
  @Throttle({ default: { limit: () => limits().registerPerHour, ttl: HOUR } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, meta(req));
  }

  // The brief: five login attempts per minute are enough for a human.
  @Public()
  @Throttle({ default: { limit: () => limits().loginPerMinute, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, meta(req));
  }

  /** "My devices": every place I'm logged in, with device, IP and time. */
  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.sessions(user.userId, user.sid);
  }

  /** Log out one specific device. */
  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.auth.revokeSession(user.userId, id);
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.sid);
  }

  /** "Log out from all devices". */
  @HttpCode(204)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthUser) {
    await this.auth.logoutAll(user.userId);
  }
}
