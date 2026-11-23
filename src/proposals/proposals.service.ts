import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  ProjectStatus,
  ProposalStatus,
  TransactionType,
} from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { paginated, skipTake } from '../common/dto/pagination.dto';
import { limits } from '../common/limits';
import { ratingAverage } from '../common/money';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProposalDto,
  ListMyProposalsDto,
  ListProjectProposalsDto,
  UpdateProposalDto,
} from './dto/proposal.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ProposalsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(projectId: number, user: AuthUser, dto: CreateProposalDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        clientId: true,
        deadline: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.clientId === user.userId) {
      throw new ForbiddenException('You cannot bid on your own project');
    }
    if (project.status !== ProjectStatus.OPEN) {
      throw new ConflictException('This project is not open for proposals');
    }
    if (project.deadline < new Date()) {
      throw new ConflictException('The deadline for proposals has passed');
    }

    // "max 20 proposals a day per freelancer": a rolling 24h window, counting
    // withdrawn ones too (otherwise withdraw + resubmit elsewhere bypasses it)
    const perDay = limits().proposalsPerDay;
    const today = await this.prisma.proposal.count({
      where: {
        freelancerId: user.userId,
        createdAt: { gte: new Date(Date.now() - DAY_MS) },
      },
    });
    if (today >= perDay) {
      throw new HttpException(
        `Daily limit reached: at most ${perDay} proposals per 24 hours`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let proposal;
    try {
      proposal = await this.prisma.proposal.create({
        data: { ...dto, projectId, freelancerId: user.userId },
      });
    } catch (err) {
      // The UNIQUE (projectId, freelancerId) index is what keeps "one proposal
      // per project" true even when the button is clicked twice at once.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already submitted a proposal on this project',
        );
      }
      throw err;
    }

    await this.notifications.notify([
      {
        userId: project.clientId,
        type: NotificationType.PROPOSAL_RECEIVED,
        title: 'عرض جديد على مشروعك',
        body: `وصل عرض جديد بقيمة ${dto.price}$ على مشروع "${project.title}".`,
        data: { projectId, proposalId: proposal.id },
        email: true,
      },
    ]);
    return proposal;
  }

  /** Owner only: every proposal on the project, paged, sorted by price or date. */
  async listForProject(
    projectId: number,
    user: AuthUser,
    q: ListProjectProposalsDto,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { clientId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.clientId !== user.userId)
      throw new ForbiddenException('Not your project');

    const where: Prisma.ProposalWhereInput = {
      projectId,
      ...(q.status && { status: q.status }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({
        where,
        orderBy: [{ [q.sortBy]: q.order }, { id: q.order }],
        ...skipTake(q),
        include: {
          freelancer: {
            select: {
              id: true,
              name: true,
              ratingSum: true,
              ratingCount: true,
              profile: {
                select: {
                  title: true,
                  avatarUrl: true,
                  hourlyRate: true,
                  completedProjects: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);
    // the freelancer's average rating appears on each proposal (brief §12)
    const data = rows.map(
      ({ freelancer: { ratingSum, ratingCount, ...f }, ...p }) => ({
        ...p,
        freelancer: {
          ...f,
          rating: {
            average: ratingAverage(ratingSum, ratingCount),
            count: ratingCount,
          },
        },
      }),
    );
    return paginated(data, total, q);
  }

  /** A freelancer's own proposals and their status. */
  async mine(user: AuthUser, q: ListMyProposalsDto) {
    const where: Prisma.ProposalWhereInput = {
      freelancerId: user.userId,
      ...(q.status && { status: q.status }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({
        where,
        orderBy: { id: 'desc' },
        ...skipTake(q),
        include: {
          project: {
            select: { id: true, title: true, status: true, deadline: true },
          },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);
    return paginated(data, total, q);
  }

  async update(id: number, user: AuthUser, dto: UpdateProposalDto) {
    await this.ownPending(id, user);
    const { count } = await this.prisma.proposal.updateMany({
      where: this.editable(id, user),
      data: dto,
    });
    if (count === 0)
      throw new ConflictException('This proposal can no longer be changed');
    return this.prisma.proposal.findUnique({ where: { id } });
  }

  /** Withdraw = status WITHDRAWN (the row stays, so no second proposal later). */
  async withdraw(id: number, user: AuthUser) {
    await this.ownPending(id, user);
    const { count } = await this.prisma.proposal.updateMany({
      where: this.editable(id, user),
      data: { status: ProposalStatus.WITHDRAWN },
    });
    if (count === 0)
      throw new ConflictException('This proposal can no longer be withdrawn');
    return { id, status: ProposalStatus.WITHDRAWN };
  }

  /**
   * "The most important moment of the platform". Steps 1–6 of the brief happen
   * in ONE database transaction: all of them or none of them.
   *   1+2+3. enough balance? move the price from available to held + ledger row
   *   4.     create the contract
   *   5.     this proposal ACCEPTED, every other pending one REJECTED
   *   6.     project IN_PROGRESS
   * Step 7 (emails) happens after the commit, in the background queue,
   * so the client gets the answer immediately.
   */
  async accept(proposalId: number, user: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findUnique({
        where: { id: proposalId },
        include: { project: true },
      });
      if (!proposal || proposal.project.deletedAt)
        throw new NotFoundException('Proposal not found');
      const { project } = proposal;
      if (project.clientId !== user.userId)
        throw new ForbiddenException('Not your project');
      if (proposal.status !== ProposalStatus.PENDING) {
        throw new ConflictException('This proposal was already processed');
      }

      // 6 first, as a conditional UPDATE: of two accepts in the same second
      // (phone + laptop), only one can still see status = OPEN.
      const opened = await tx.project.updateMany({
        where: { id: project.id, status: ProjectStatus.OPEN },
        data: { status: ProjectStatus.IN_PROGRESS },
      });
      if (opened.count === 0)
        throw new ConflictException('This project is no longer open');

      // 1+2: the balance check is part of the UPDATE, so it can never go negative
      const held = await tx.wallet.updateMany({
        where: { userId: user.userId, balance: { gte: proposal.price } },
        data: {
          balance: { decrement: proposal.price },
          heldBalance: { increment: proposal.price },
        },
      });
      if (held.count === 0) {
        throw new HttpException(
          'Insufficient wallet balance: please top up your wallet',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // 4: Contract.projectId is UNIQUE — a second contract is impossible
      const contract = await tx.contract.create({
        data: {
          projectId: project.id,
          proposalId: proposal.id,
          clientId: user.userId,
          freelancerId: proposal.freelancerId,
          amount: proposal.price,
          durationDays: proposal.durationDays,
          escrowBalance: proposal.price,
        },
      });

      // 3: ledger
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: user.userId },
      });
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.ESCROW_HOLD,
          amount: proposal.price,
          contractId: contract.id,
          note: `Escrow for project #${project.id}`,
        },
      });

      // 5
      await tx.proposal.update({
        where: { id: proposal.id },
        data: { status: ProposalStatus.ACCEPTED },
      });
      const others = await tx.proposal.findMany({
        where: {
          projectId: project.id,
          status: ProposalStatus.PENDING,
          id: { not: proposal.id },
        },
        select: { freelancerId: true },
      });
      await tx.proposal.updateMany({
        where: {
          projectId: project.id,
          status: ProposalStatus.PENDING,
          id: { not: proposal.id },
        },
        data: { status: ProposalStatus.REJECTED },
      });

      return {
        contract,
        project,
        proposal,
        rejected: others.map((o) => o.freelancerId),
      };
    });

    // 7: after the commit — in-app notifications now, emails in the background
    const { contract, project, proposal, rejected } = result;
    await this.notifications.notify([
      {
        userId: proposal.freelancerId,
        type: NotificationType.PROPOSAL_ACCEPTED,
        title: 'مبروك! تم قبول عرضك',
        body: `قبل صاحب مشروع "${project.title}" عرضك بقيمة ${proposal.price.toString()}$ ومدة ${proposal.durationDays} يوماً.`,
        data: { projectId: project.id, contractId: contract.id },
        email: true,
      },
      ...rejected.map((userId) => ({
        userId,
        type: NotificationType.PROPOSAL_REJECTED,
        title: 'شكراً على عرضك',
        body: `اختار صاحب مشروع "${project.title}" عرضاً آخر. نتمنى لك التوفيق في مشاريع قادمة.`,
        data: { projectId: project.id },
        email: true,
      })),
    ]);

    return {
      contractId: contract.id,
      projectId: project.id,
      projectStatus: ProjectStatus.IN_PROGRESS,
      amount: contract.amount,
      durationDays: contract.durationDays,
    };
  }

  private editable(id: number, user: AuthUser): Prisma.ProposalWhereInput {
    return {
      id,
      freelancerId: user.userId,
      status: ProposalStatus.PENDING,
      project: { status: ProjectStatus.OPEN, deletedAt: null },
    };
  }

  private async ownPending(id: number, user: AuthUser) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.freelancerId !== user.userId)
      throw new ForbiddenException('Not your proposal');
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new BadRequestException(
        'Only pending proposals can be changed or withdrawn',
      );
    }
  }
}
