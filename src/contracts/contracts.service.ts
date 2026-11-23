import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  Contract,
  ContractStatus,
  MilestoneStatus,
  NotificationType,
  Prisma,
  ProjectStatus,
  Role,
  TransactionType,
} from '@prisma/client';
import type { Cache } from 'cache-manager';
import { createReadStream, existsSync } from 'fs';
import { CacheKeys } from '../common/cache-keys';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { paginated, skipTake } from '../common/dto/pagination.dto';
import { FilesService } from '../common/files/files.service';
import { D, splitPayment } from '../common/money';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { platformWallet } from '../wallet/platform-wallet';
import {
  CreateMilestoneDto,
  ListContractsDto,
  RequestRevisionDto,
  SubmitMilestoneDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';

@Injectable()
export class ContractsService {
  constructor(
    private prisma: PrismaService,
    private files: FilesService,
    private notifications: NotificationsService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  // ─────────────── reading ───────────────

  /** My contracts, as client or as freelancer. */
  async mine(user: AuthUser, q: ListContractsDto) {
    const where: Prisma.ContractWhereInput = {
      OR: [{ clientId: user.userId }, { freelancerId: user.userId }],
      ...(q.status && { status: q.status }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        orderBy: { id: 'desc' },
        ...skipTake(q),
        include: {
          project: { select: { id: true, title: true, status: true } },
          client: { select: { id: true, name: true } },
          freelancer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);
    return paginated(data, total, q);
  }

  async findOne(id: number, user: AuthUser) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, title: true, status: true } },
        client: { select: { id: true, name: true } },
        freelancer: { select: { id: true, name: true } },
        milestones: { orderBy: { position: 'asc' } },
        reviews: {
          select: {
            id: true,
            reviewerId: true,
            rating: true,
            comment: true,
            createdAt: true,
          },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    this.assertParty(contract, user, true);
    const allocated = contract.milestones.reduce(
      (s, m) => s.add(m.amount),
      D(0),
    );
    return {
      ...contract,
      allocated,
      unallocated: contract.amount.sub(allocated),
    };
  }

  // ─────────────── milestones (client) ───────────────

  /**
   * The client splits the contract into milestones. The sum may never exceed
   * the contract amount — checked while holding a row lock on the contract
   * (SELECT ... FOR UPDATE), so two simultaneous additions cannot both pass.
   */
  async addMilestone(
    contractId: number,
    user: AuthUser,
    dto: CreateMilestoneDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await this.lockContract(tx, contractId);
      this.assertClient(contract, user);
      this.assertActive(contract);
      const agg = await tx.milestone.aggregate({
        where: { contractId },
        _sum: { amount: true },
        _max: { position: true },
      });
      const allocated = agg._sum.amount ?? D(0);
      if (allocated.add(dto.amount).gt(contract.amount)) {
        throw new BadRequestException(
          `Milestones would total ${allocated.add(dto.amount).toString()} but the contract is ${contract.amount.toString()}`,
        );
      }
      return tx.milestone.create({
        data: { ...dto, contractId, position: (agg._max.position ?? 0) + 1 },
      });
    });
  }

  /** Only a milestone nobody has delivered yet (PENDING, no submissions) can change. */
  async updateMilestone(id: number, user: AuthUser, dto: UpdateMilestoneDto) {
    return this.prisma.$transaction(async (tx) => {
      const milestone = await this.editableMilestone(tx, id, user);
      if (dto.amount !== undefined) {
        const others = await tx.milestone.aggregate({
          where: { contractId: milestone.contractId, id: { not: id } },
          _sum: { amount: true },
        });
        const total = (others._sum.amount ?? D(0)).add(dto.amount);
        if (total.gt(milestone.contract.amount)) {
          throw new BadRequestException(
            'Milestones would exceed the contract amount',
          );
        }
      }
      return tx.milestone.update({ where: { id }, data: dto });
    });
  }

  async removeMilestone(id: number, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.editableMilestone(tx, id, user);
      await tx.milestone.delete({ where: { id } });
    });
  }

  // ─────────────── delivery (freelancer) ───────────────

  async submit(
    milestoneId: number,
    user: AuthUser,
    dto: SubmitMilestoneDto,
    files: Express.Multer.File[] = [],
  ) {
    if (files.length === 0)
      throw new BadRequestException('At least one file is required');
    const milestone = await this.milestoneWithContract(milestoneId);
    if (milestone.contract.freelancerId !== user.userId) {
      throw new ForbiddenException(
        'You are not the freelancer of this contract',
      );
    }
    this.assertActive(milestone.contract);

    const saved = await this.files.saveMany(files, 'submission');
    let submission;
    try {
      submission = await this.prisma.$transaction(async (tx) => {
        // waiting for work or sent back for changes -> delivered
        const { count } = await tx.milestone.updateMany({
          where: {
            id: milestoneId,
            status: {
              in: [MilestoneStatus.PENDING, MilestoneStatus.REVISION_REQUESTED],
            },
          },
          data: { status: MilestoneStatus.SUBMITTED },
        });
        if (count === 0) {
          throw new ConflictException(
            'This milestone is already delivered or approved',
          );
        }
        return tx.submission.create({
          data: {
            milestoneId,
            note: dto.note,
            files: {
              create: saved.map((f) => ({
                storedName: f.storedName,
                originalName: f.originalName,
                mimeType: f.mimeType,
                size: f.size,
              })),
            },
          },
          include: {
            files: { select: { id: true, originalName: true, size: true } },
          },
        });
      });
    } catch (err) {
      await this.files.removeMany('submission', saved);
      throw err;
    }

    await this.notifications.notify([
      {
        userId: milestone.contract.clientId,
        type: NotificationType.MILESTONE_SUBMITTED,
        title: 'تسليم بانتظار مراجعتك',
        body: `سلّم المستقل المرحلة "${milestone.title}" وهي بانتظار موافقتك أو طلب تعديل.`,
        data: { contractId: milestone.contractId, milestoneId },
        email: true,
      },
    ]);
    return submission;
  }

  async submissions(milestoneId: number, user: AuthUser) {
    const milestone = await this.milestoneWithContract(milestoneId);
    this.assertParty(milestone.contract, user, true);
    return this.prisma.submission.findMany({
      where: { milestoneId },
      orderBy: { id: 'desc' },
      include: {
        files: {
          select: { id: true, originalName: true, mimeType: true, size: true },
        },
      },
    });
  }

  /** Delivery files are private: the two parties of the contract and the admin only. */
  async downloadFile(fileId: number, user: AuthUser) {
    const file = await this.prisma.submissionFile.findUnique({
      where: { id: fileId },
      include: {
        submission: { include: { milestone: { include: { contract: true } } } },
      },
    });
    if (!file) throw new NotFoundException('File not found');
    this.assertParty(file.submission.milestone.contract, user, true);
    const path = this.files.path('submission', file.storedName);
    if (!existsSync(path)) throw new NotFoundException('File is missing');
    return new StreamableFile(createReadStream(path), {
      type: file.mimeType,
      disposition: `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }

  // ─────────────── review (client) ───────────────

  async requestRevision(
    milestoneId: number,
    user: AuthUser,
    dto: RequestRevisionDto,
  ) {
    const milestone = await this.milestoneWithContract(milestoneId);
    this.assertClient(milestone.contract, user);
    this.assertActive(milestone.contract);
    const { count } = await this.prisma.milestone.updateMany({
      where: { id: milestoneId, status: MilestoneStatus.SUBMITTED },
      data: {
        status: MilestoneStatus.REVISION_REQUESTED,
        revisionNote: dto.note,
      },
    });
    if (count === 0)
      throw new ConflictException(
        'Only a delivered milestone can be sent back',
      );

    await this.notifications.notify([
      {
        userId: milestone.contract.freelancerId,
        type: NotificationType.MILESTONE_REVISION_REQUESTED,
        title: 'طلب تعديل على مرحلة',
        body: `طلب العميل تعديلاً على المرحلة "${milestone.title}": ${dto.note}`,
        data: { contractId: milestone.contractId, milestoneId },
        email: true,
      },
    ]);
    return { id: milestoneId, status: MilestoneStatus.REVISION_REQUESTED };
  }

  /**
   * Approving a milestone releases its money from escrow — ALL of this in one
   * transaction (money never leaves escrow without reaching the freelancer):
   *   1. milestone SUBMITTED -> APPROVED   (conditional: a double click pays once)
   *   2. contract escrow -= amount, client held -= amount   (ESCROW_RELEASE)
   *   3. freelancer +90% (PAYMENT), platform +10% (COMMISSION)
   *   4. if no milestone is left unapproved: contract + project COMPLETED,
   *      leftover escrow back to the client (REFUND), freelancer's
   *      completed-projects counter + 1
   */
  async approve(milestoneId: number, user: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.findUnique({
        where: { id: milestoneId },
        include: { contract: true },
      });
      if (!milestone) throw new NotFoundException('Milestone not found');
      const { contract } = milestone;
      this.assertClient(contract, user);

      const approved = await tx.milestone.updateMany({
        where: {
          id: milestoneId,
          status: MilestoneStatus.SUBMITTED,
          contract: { status: ContractStatus.ACTIVE },
        },
        data: {
          status: MilestoneStatus.APPROVED,
          approvedAt: new Date(),
          revisionNote: null,
        },
      });
      if (approved.count === 0) {
        throw new ConflictException(
          'Only a delivered milestone of an active contract can be approved',
        );
      }

      const amount = milestone.amount;
      const released = await tx.contract.updateMany({
        where: { id: contract.id, escrowBalance: { gte: amount } },
        data: { escrowBalance: { decrement: amount } },
      });
      if (released.count === 0)
        throw new ConflictException('Not enough money held for this milestone');

      const clientWallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: contract.clientId },
      });
      const freelancerWallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: contract.freelancerId },
      });
      const platform = await platformWallet(tx);
      const { payout, commission } = splitPayment(amount);

      const heldOk = await tx.wallet.updateMany({
        where: { id: clientWallet.id, heldBalance: { gte: amount } },
        data: { heldBalance: { decrement: amount } },
      });
      if (heldOk.count === 0)
        throw new ConflictException('Held balance is inconsistent');
      await tx.wallet.update({
        where: { id: freelancerWallet.id },
        data: { balance: { increment: payout } },
      });
      await tx.wallet.update({
        where: { id: platform.id },
        data: { balance: { increment: commission } },
      });

      const ref = { contractId: contract.id, milestoneId };
      await tx.transaction.createMany({
        data: [
          {
            walletId: clientWallet.id,
            type: TransactionType.ESCROW_RELEASE,
            amount,
            ...ref,
          },
          {
            walletId: freelancerWallet.id,
            type: TransactionType.PAYMENT,
            amount: payout,
            ...ref,
          },
          {
            walletId: platform.id,
            type: TransactionType.COMMISSION,
            amount: commission,
            ...ref,
          },
        ],
      });

      // was this the last milestone?
      const remaining = await tx.milestone.count({
        where: {
          contractId: contract.id,
          status: { not: MilestoneStatus.APPROVED },
        },
      });
      let refund = D(0);
      if (remaining === 0) {
        const fresh = await tx.contract.findUniqueOrThrow({
          where: { id: contract.id },
        });
        refund = fresh.escrowBalance;
        await tx.contract.update({
          where: { id: contract.id },
          data: {
            status: ContractStatus.COMPLETED,
            completedAt: new Date(),
            escrowBalance: 0,
          },
        });
        await tx.project.update({
          where: { id: contract.projectId },
          data: { status: ProjectStatus.COMPLETED },
        });
        if (refund.gt(0)) {
          await tx.wallet.update({
            where: { id: clientWallet.id },
            data: {
              heldBalance: { decrement: refund },
              balance: { increment: refund },
            },
          });
          await tx.transaction.create({
            data: {
              walletId: clientWallet.id,
              type: TransactionType.REFUND,
              amount: refund,
              contractId: contract.id,
              note: 'Unallocated escrow returned at contract completion',
            },
          });
        }
        await tx.freelancerProfile.update({
          where: { userId: contract.freelancerId },
          data: { completedProjects: { increment: 1 } },
        });
      }

      return {
        contract,
        milestone,
        payout,
        commission,
        completed: remaining === 0,
        refund,
      };
    });

    const { contract, milestone, payout, completed } = result;
    if (completed)
      await this.cache.del(CacheKeys.profile(contract.freelancerId));
    await this.notifications.notify([
      {
        userId: contract.freelancerId,
        type: NotificationType.MILESTONE_APPROVED,
        title: 'تمت الموافقة على مرحلة',
        body: `وافق العميل على المرحلة "${milestone.title}".${completed ? ' اكتمل العقد بنجاح!' : ''}`,
        data: { contractId: contract.id, milestoneId },
        email: true,
      },
      {
        userId: contract.freelancerId,
        type: NotificationType.PAYMENT_RECEIVED,
        title: 'وصلت دفعة إلى محفظتك',
        body: `تمت إضافة ${payout.toString()}$ إلى رصيدك (بعد عمولة المنصة 10%).`,
        data: {
          contractId: contract.id,
          milestoneId,
          amount: payout.toString(),
        },
        email: true,
      },
    ]);

    return {
      milestoneId,
      status: MilestoneStatus.APPROVED,
      payout: result.payout,
      commission: result.commission,
      contractStatus: completed
        ? ContractStatus.COMPLETED
        : ContractStatus.ACTIVE,
      refunded: result.refund,
    };
  }

  // ─────────────── helpers ───────────────

  /** Row lock: concurrent transactions on the same contract wait for each other. */
  private async lockContract(tx: Prisma.TransactionClient, id: number) {
    await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${id} FOR UPDATE`;
    const contract = await tx.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  private async editableMilestone(
    tx: Prisma.TransactionClient,
    id: number,
    user: AuthUser,
  ) {
    const m = await tx.milestone.findUnique({
      where: { id },
      select: { contractId: true },
    });
    if (!m) throw new NotFoundException('Milestone not found');
    const contract = await this.lockContract(tx, m.contractId);
    this.assertClient(contract, user);
    this.assertActive(contract);
    const milestone = await tx.milestone.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { submissions: true } } },
    });
    if (
      milestone.status !== MilestoneStatus.PENDING ||
      milestone._count.submissions > 0
    ) {
      throw new ConflictException(
        'Only a milestone that was never delivered can be changed',
      );
    }
    return { ...milestone, contract };
  }

  private async milestoneWithContract(id: number) {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id },
      include: { contract: true },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    return milestone;
  }

  private assertParty(
    contract: Contract,
    user: AuthUser,
    adminAllowed = false,
  ) {
    const ok =
      contract.clientId === user.userId ||
      contract.freelancerId === user.userId ||
      (adminAllowed && user.role === Role.ADMIN);
    if (!ok)
      throw new ForbiddenException('You are not a party of this contract');
  }

  private assertClient(contract: Contract, user: AuthUser) {
    if (contract.clientId !== user.userId) {
      throw new ForbiddenException(
        'Only the client of this contract can do this',
      );
    }
  }

  private assertActive(contract: Contract) {
    if (contract.status !== ContractStatus.ACTIVE) {
      throw new ConflictException('This contract is already completed');
    }
  }
}
