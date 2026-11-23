import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { CacheKeys } from '../common/cache-keys';
import { paginated, skipTake } from '../common/dto/pagination.dto';
import { ratingAverage } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersDto } from './dto/list-users.dto';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isBanned: true,
  ratingSum: true,
  ratingCount: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const present = ({ ratingSum, ratingCount, ...u }: UserRow) => ({
  ...u,
  rating: {
    average: ratingAverage(ratingSum, ratingCount),
    count: ratingCount,
  },
});

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!user) throw new NotFoundException();
    return present(user);
  }

  // ---- admin ----

  async list(q: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      ...(q.role && { role: q.role }),
      ...(q.banned !== undefined && { isBanned: q.banned }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { id: 'desc' },
        ...skipTake(q),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(data.map(present), total, q);
  }

  async setBanned(id: number, isBanned: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Admins cannot be banned');
    }
    // Banning also ends every session: refresh tokens stop working too, and
    // JwtStrategy refuses the still-valid access token on the very next request.
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isBanned },
        select: userSelect,
      }),
      ...(isBanned
        ? [this.prisma.session.deleteMany({ where: { userId: id } })]
        : []),
    ]);
    await this.cache.del(CacheKeys.profile(id)); // banned profiles are hidden
    return present(updated);
  }
}
