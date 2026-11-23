import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { describeDevice } from './user-agent';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // "stay logged in about a week"
const ACCESS_TTL = '15m'; // "the login key lives only minutes"
// Compared against when the email is unknown, so login timing stays equal.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export interface ClientMeta {
  ip?: string;
  ua?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto, meta: ClientMeta) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('Email already used');

    const password = await bcrypt.hash(dto.password, 10);
    // user + wallet (+ empty freelancer profile) are created together or not at all
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password,
        role: dto.role,
        wallet: { create: {} },
        ...(dto.role === Role.FREELANCER && { profile: { create: {} } }),
      },
      select: { id: true, name: true, email: true, role: true },
    });
    const tokens = await this.startSession(user.id, user.role, meta);
    return { user, ...tokens };
  }

  async login(dto: LoginDto, meta: ClientMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const ok = await bcrypt.compare(dto.password, user?.password ?? DUMMY_HASH);
    // one message for both cases: don't reveal which emails exist
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');
    if (user.isBanned) throw new ForbiddenException('This account is banned');

    const tokens = await this.startSession(user.id, user.role, meta);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      ...tokens,
    };
  }

  /**
   * A session is a device. Its refresh token changes on every refresh
   * (rotation) but the session id stays, so "my devices" is stable.
   *
   * Reuse detection (the brief's security case): if someone presents an OLD
   * refresh token of a session that is still alive, the token was copied —
   * we end EVERY session of that user, on every device.
   */
  async refresh(refreshToken: string, meta: ClientMeta) {
    let payload: { sub: number; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { id: true, role: true, isBanned: true } } },
    });
    // logged out / revoked session: just refuse
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session has ended');
    }
    if (session.expiresAt < new Date() || session.user.isBanned) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException('Session has ended');
    }

    const next = await this.signRefresh(session.userId, session.id);
    // Compare-and-swap: the update only matches if the presented token is the
    // CURRENT one. Two requests with the same token: only one can win.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, refreshHash: this.hash(refreshToken) },
      data: {
        refreshHash: this.hash(next),
        lastUsedAt: new Date(),
        ip: meta.ip,
        userAgent: meta.ua?.slice(0, 255),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    if (count === 0) {
      await this.prisma.session.deleteMany({
        where: { userId: session.userId },
      });
      throw new UnauthorizedException(
        'Refresh token reuse detected: all sessions were ended, please log in again',
      );
    }

    return {
      accessToken: await this.signAccess(
        session.userId,
        session.user.role,
        session.id,
      ),
      refreshToken: next,
    };
  }

  async sessions(userId: number, currentSid: string) {
    const rows = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
    return rows.map((s) => ({
      id: s.id,
      device: describeDevice(s.userAgent),
      userAgent: s.userAgent,
      ip: s.ip,
      loggedInAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      current: s.id === currentSid,
    }));
  }

  /** Log out one specific device (e.g. the internet-café one). */
  async revokeSession(userId: number, sessionId: string) {
    // userId in the WHERE: you can only end your own sessions
    const { count } = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    if (count === 0) throw new NotFoundException('Session not found');
  }

  logout(sessionId: string) {
    return this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  logoutAll(userId: number) {
    return this.prisma.session.deleteMany({ where: { userId } });
  }

  /**
   * Refresh tokens are stored as SHA-256, not bcrypt like the guide's example:
   * the token is already a long random signed string, and bcrypt only reads the
   * first 72 bytes, which are nearly identical across JWTs.
   */
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private signAccess(userId: number, role: Role, sid: string) {
    return this.jwt.signAsync(
      { sub: userId, role, sid },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TTL,
      },
    );
  }

  /** jti makes every refresh token unique, even two issued in the same second. */
  private signRefresh(userId: number, sid: string) {
    return this.jwt.signAsync(
      { sub: userId, sid, jti: randomUUID() },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );
  }

  private async startSession(userId: number, role: Role, meta: ClientMeta) {
    const id = randomUUID();
    const refreshToken = await this.signRefresh(userId, id);
    await this.prisma.session.create({
      data: {
        id,
        userId,
        refreshHash: this.hash(refreshToken),
        ip: meta.ip,
        userAgent: meta.ua?.slice(0, 255),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return {
      accessToken: await this.signAccess(userId, role, id),
      refreshToken,
    };
  }
}
