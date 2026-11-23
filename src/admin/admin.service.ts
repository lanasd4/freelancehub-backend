import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Role, TransactionType } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { CacheKeys } from '../common/cache-keys';
import { D } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  /**
   * One page that tells the admin how the platform is doing. These are heavy
   * aggregations over all the data, so the result is cached for a few minutes
   * (the brief accepts slightly stale numbers) instead of being recomputed on
   * every visit. `generatedAt` tells the admin how fresh the numbers are.
   */
  async dashboard() {
    const ttl = Number(process.env.DASHBOARD_CACHE_SECONDS ?? 300) * 1000;
    if (ttl > 0) {
      const cached = await this.cache.get(CacheKeys.dashboard);
      if (cached) return cached;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      byRole,
      newThisMonth,
      byStatus,
      totalCommission,
      monthly,
      topFreelancers,
      topCategories,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.project.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: TransactionType.COMMISSION },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<{ month: Date; total: Prisma.Decimal }[]>`
          SELECT date_trunc('month', "createdAt") AS month, SUM(amount) AS total
          FROM "Transaction"
          WHERE type = 'COMMISSION' AND "createdAt" >= ${sixMonthsStart}
          GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<
        { id: number; name: string; earnings: Prisma.Decimal }[]
      >`
          SELECT u.id, u.name, SUM(t.amount) AS earnings
          FROM "Transaction" t
          JOIN "Wallet" w ON w.id = t."walletId"
          JOIN "User" u ON u.id = w."userId"
          WHERE t.type = 'PAYMENT'
          GROUP BY u.id, u.name
          ORDER BY earnings DESC
          LIMIT 5`,
      this.prisma.project.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null },
        _count: { _all: true },
        orderBy: { _count: { categoryId: 'desc' } },
        take: 5,
      }),
    ]);

    const categoryNames = await this.prisma.category.findMany({
      where: { id: { in: topCategories.map((c) => c.categoryId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(categoryNames.map((c) => [c.id, c.name]));

    // last 6 months, including months with zero earnings
    const monthlyMap = new Map(
      monthly.map((m) => [
        new Date(m.month).toISOString().slice(0, 7),
        D(m.total),
      ]),
    );
    const monthlyEarnings = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { month: key, earnings: (monthlyMap.get(key) ?? D(0)).toFixed(2) };
    });

    const users = Object.fromEntries(
      Object.values(Role).map((r) => [r, 0]),
    ) as Record<Role, number>;
    byRole.forEach((r) => (users[r.role] = r._count._all));
    const projects: Record<string, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    byStatus.forEach((s) => (projects[s.status] = s._count._all));

    const result = {
      generatedAt: now.toISOString(),
      users: {
        byRole: users,
        total: Object.values(users).reduce((a, b) => a + b, 0),
        newThisMonth,
      },
      projects,
      earnings: {
        totalCommission: (totalCommission._sum.amount ?? D(0)).toFixed(2),
        lastSixMonths: monthlyEarnings,
      },
      topFreelancers: topFreelancers.map((f) => ({
        id: f.id,
        name: f.name,
        earnings: D(f.earnings).toFixed(2),
      })),
      topCategories: topCategories.map((c) => ({
        id: c.categoryId,
        name: nameOf.get(c.categoryId),
        projects: c._count._all,
      })),
    };
    if (ttl > 0) await this.cache.set(CacheKeys.dashboard, result, ttl);
    return result;
  }
}
