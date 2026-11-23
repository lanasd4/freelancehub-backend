import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { CacheKeys } from '../common/cache-keys';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  paginated,
  PaginationDto,
  skipTake,
} from '../common/dto/pagination.dto';
import { ratingAverage } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  /**
   * After a contract is COMPLETED each party rates the other, once.
   * The review and the reviewee's running totals (ratingSum / ratingCount) are
   * written in the same transaction, so the average shown on profiles is always
   * consistent and never needs recomputing.
   */
  async create(contractId: number, user: AuthUser, dto: CreateReviewDto) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const isClient = contract.clientId === user.userId;
    if (!isClient && contract.freelancerId !== user.userId) {
      throw new ForbiddenException(
        'You can only review a contract you are a party of',
      );
    }
    if (contract.status !== ContractStatus.COMPLETED) {
      throw new ConflictException(
        'A contract can be reviewed only after it is completed',
      );
    }
    const revieweeId = isClient ? contract.freelancerId : contract.clientId;

    let review;
    try {
      review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: { contractId, reviewerId: user.userId, revieweeId, ...dto },
        });
        await tx.user.update({
          where: { id: revieweeId },
          data: {
            ratingSum: { increment: dto.rating },
            ratingCount: { increment: 1 },
          },
        });
        return created;
      });
    } catch (err) {
      // UNIQUE (contractId, reviewerId): one review per party, even on a double click
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('You already reviewed this contract');
      }
      throw err;
    }
    await this.cache.del(CacheKeys.profile(revieweeId)); // the new rating shows at once
    return review;
  }

  /** Public: reviews a user received, newest first, with their average. */
  async forUser(userId: number, q: PaginationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ratingSum: true, ratingCount: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const where = { revieweeId: userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { id: 'desc' },
        ...skipTake(q),
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          contractId: true,
          reviewer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      ...paginated(rows, total, q),
      rating: {
        average: ratingAverage(user.ratingSum, user.ratingCount),
        count: user.ratingCount,
      },
    };
  }
}
