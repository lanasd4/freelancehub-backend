import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CacheKeys } from '../common/cache-keys';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSkillDto, UpdateSkillDto } from './dto/skill.dto';

type SkillRow = { id: number; name: string };
const TTL = 60 * 60_000; // safe to keep long: every write below invalidates

/** The platform's skill list (freelancers pick from it). Same Cache-Aside as categories. */
@Injectable()
export class SkillsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async findAll(): Promise<SkillRow[]> {
    const cached = await this.cache.get<SkillRow[]>(CacheKeys.skills);
    if (cached) return cached;
    const skills = await this.prisma.skill.findMany({
      orderBy: { name: 'asc' },
    });
    await this.cache.set(CacheKeys.skills, skills, TTL);
    return skills;
  }

  async create(dto: CreateSkillDto) {
    const skill = await this.prisma.skill.create({ data: dto });
    await this.cache.del(CacheKeys.skills);
    return skill;
  }

  async update(id: number, dto: UpdateSkillDto) {
    const holders = await this.holders(id);
    const skill = await this.prisma.skill.update({ where: { id }, data: dto });
    await this.invalidate(holders);
    return skill;
  }

  /** Removing a skill also removes it from freelancers' profiles (cascade). */
  async remove(id: number) {
    const holders = await this.holders(id);
    await this.prisma.skill.delete({ where: { id } });
    await this.invalidate(holders);
  }

  /** Users whose cached profile shows this skill. */
  private async holders(skillId: number) {
    const rows = await this.prisma.freelancerSkill.findMany({
      where: { skillId },
      select: { profile: { select: { userId: true } } },
    });
    return rows.map((r) => r.profile.userId);
  }

  private async invalidate(userIds: number[]) {
    await this.cache.mdel([
      CacheKeys.skills,
      ...userIds.map((id) => CacheKeys.profile(id)),
    ]);
  }
}
