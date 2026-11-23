import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { paginated, skipTake } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ListTransactionsDto } from './dto/wallet.dto';

const walletSelect = { id: true, balance: true, heldBalance: true } as const;

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async get(userId: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: walletSelect,
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  /** No payment gateway in this version: the amount is simply added. */
  deposit(userId: number, amount: number) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
        select: walletSelect,
      });
      await tx.transaction.create({
        data: { walletId: wallet.id, type: TransactionType.DEPOSIT, amount },
      });
      return wallet;
    });
  }

  /**
   * Only from the AVAILABLE balance (never from held money). The balance check
   * is inside the UPDATE (WHERE balance >= amount): two withdrawals sent at the
   * same instant can never take the balance below zero — one of them gets 402.
   */
  withdraw(userId: number, amount: number) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.wallet.updateMany({
        where: { userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (count === 0) {
        throw new HttpException(
          'Insufficient available balance',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId },
        select: walletSelect,
      });
      await tx.transaction.create({
        data: { walletId: wallet.id, type: TransactionType.WITHDRAWAL, amount },
      });
      return wallet;
    });
  }

  async transactions(userId: number, q: ListTransactionsDto) {
    if (q.from && q.to && q.from > q.to) {
      throw new BadRequestException('"from" must be before "to"');
    }
    const where: Prisma.TransactionWhereInput = {
      wallet: { userId },
      ...(q.type && { type: q.type }),
      ...((q.from || q.to) && { createdAt: { gte: q.from, lte: q.to } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { id: 'desc' },
        ...skipTake(q),
        select: {
          id: true,
          type: true,
          amount: true,
          contractId: true,
          milestoneId: true,
          note: true,
          createdAt: true,
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return paginated(data, total, q);
  }
}
