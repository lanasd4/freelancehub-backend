import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { CacheKeys } from '../common/cache-keys';
import { FilesService, UploadKind } from '../common/files/files.service';
import { ratingAverage } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const TTL = 10 * 60_000;
const LATEST_REVIEWS = 5;

@Injectable()
export class ProfilesService {
  constructor(
    private prisma: PrismaService,
    private files: FilesService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  /**
   * The "shop window" of a freelancer, opened very often (every client opens the
   * profile of everyone who bid). Fast because:
   *  - average rating and completed-project count are stored columns updated
   *    when a review / completion happens, never recomputed here;
   *  - the whole response is cached and deleted whenever anything in it changes.
   */
  async publicProfile(userId: number) {
    const key = CacheKeys.profile(userId);
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: Role.FREELANCER, isBanned: false },
      select: {
        id: true,
        name: true,
        createdAt: true,
        ratingSum: true,
        ratingCount: true,
        profile: {
          select: {
            title: true,
            bio: true,
            hourlyRate: true,
            avatarUrl: true,
            cvUrl: true,
            completedProjects: true,
            skills: {
              select: { skill: true },
              orderBy: { skill: { name: 'asc' } },
            },
          },
        },
        reviewsReceived: {
          orderBy: { createdAt: 'desc' },
          take: LATEST_REVIEWS,
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            reviewer: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user || !user.profile)
      throw new NotFoundException('Freelancer not found');

    const { profile } = user;
    const result = {
      id: user.id,
      name: user.name,
      memberSince: user.createdAt,
      title: profile.title,
      bio: profile.bio,
      hourlyRate: profile.hourlyRate,
      avatarUrl: profile.avatarUrl,
      cvUrl: profile.cvUrl,
      skills: profile.skills.map((s) => s.skill),
      rating: {
        average: ratingAverage(user.ratingSum, user.ratingCount),
        count: user.ratingCount,
      },
      completedProjects: profile.completedProjects,
      latestReviews: user.reviewsReceived,
    };
    await this.cache.set(key, result, TTL);
    return result;
  }

  async update(userId: number, dto: UpdateProfileDto) {
    const { skillIds, ...fields } = dto;
    if (skillIds?.length) {
      const found = await this.prisma.skill.count({
        where: { id: { in: skillIds } },
      });
      if (found !== skillIds.length) {
        throw new BadRequestException('One or more skills do not exist');
      }
    }
    const profile = await this.prisma.freelancerProfile.findUniqueOrThrow({
      where: { userId },
      select: { id: true },
    });
    // fields + the whole skill set are replaced together or not at all
    await this.prisma.$transaction([
      this.prisma.freelancerProfile.update({ where: { userId }, data: fields }),
      ...(skillIds
        ? [
            this.prisma.freelancerSkill.deleteMany({
              where: { profileId: profile.id },
            }),
            this.prisma.freelancerSkill.createMany({
              data: skillIds.map((skillId) => ({
                profileId: profile.id,
                skillId,
              })),
            }),
          ]
        : []),
    ]);
    await this.cache.del(CacheKeys.profile(userId));
    return this.publicProfile(userId);
  }

  setAvatar(userId: number, file?: Express.Multer.File) {
    return this.replaceFile(userId, file, 'avatar', 'avatarUrl');
  }

  setCv(userId: number, file?: Express.Multer.File) {
    return this.replaceFile(userId, file, 'cv', 'cvUrl');
  }

  private async replaceFile(
    userId: number,
    file: Express.Multer.File | undefined,
    kind: UploadKind,
    column: 'avatarUrl' | 'cvUrl',
  ) {
    if (!file) throw new BadRequestException('"file" is required');
    const saved = await this.files.save(file, kind);
    const previous = await this.prisma.freelancerProfile.findUniqueOrThrow({
      where: { userId },
      select: { [column]: true } as { avatarUrl: true } | { cvUrl: true },
    });
    try {
      await this.prisma.freelancerProfile.update({
        where: { userId },
        data: { [column]: saved.url },
      });
    } catch (err) {
      await this.files.remove(kind, saved.storedName);
      throw err;
    }
    await this.files.remove(
      kind,
      (previous as Record<string, string | null>)[column],
    );
    await this.cache.del(CacheKeys.profile(userId));
    return { [column]: saved.url };
  }
}
