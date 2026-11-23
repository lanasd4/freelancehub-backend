import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CacheKeys } from '../common/cache-keys';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

const CACHE_KEY = CacheKeys.categories;
const TTL = 10 * 60_000; // long TTL is safe: every write below invalidates

type CategoryRow = { id: number; name: string };

/**
 * Categories are read on almost every page but rarely change, so we use
 * Cache-Aside (guide ch.16) and delete the key on every write so the whole
 * platform sees an admin's edit immediately.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async findAll(): Promise<CategoryRow[]> {
    const cached = await this.cache.get<CategoryRow[]>(CACHE_KEY);
    if (cached) return cached;
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    await this.cache.set(CACHE_KEY, categories, TTL);
    return categories;
  }

  async create(dto: CreateCategoryDto) {
    const category = await this.prisma.category.create({ data: dto });
    await this.cache.del(CACHE_KEY);
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.update({
      where: { id },
      data: dto,
    });
    await this.cache.del(CACHE_KEY);
    return category;
  }

  /** Refuses (409) while projects still use the category. */
  async remove(id: number) {
    const inUse = await this.prisma.project.count({
      where: { categoryId: id },
    });
    if (inUse > 0) {
      throw new ConflictException('Category is used by existing projects');
    }
    await this.prisma.category.delete({ where: { id } });
    await this.cache.del(CACHE_KEY);
  }
}
