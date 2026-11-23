import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Runs on every authenticated request. We check the user and the session
   * in the DB so that a ban or a logout takes effect immediately, not when
   * the 15-minute access token expires.
   */
  async validate(payload: {
    sub: number;
    role: Role;
    sid: string;
  }): Promise<AuthUser> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { user: { select: { id: true, role: true, isBanned: true } } },
    });
    if (!session || session.user.id !== payload.sub || session.user.isBanned) {
      throw new UnauthorizedException();
    }
    return {
      userId: session.user.id,
      role: session.user.role,
      sid: payload.sid,
    };
  }
}
