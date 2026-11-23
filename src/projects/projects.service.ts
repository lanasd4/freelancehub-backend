import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  ProjectStatus,
  ProposalStatus,
  Role,
} from '@prisma/client';
import type { Cache } from 'cache-manager';
import { CacheKeys } from '../common/cache-keys';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  paginated,
  PaginationDto,
  skipTake,
} from '../common/dto/pagination.dto';
import { FilesService, UPLOAD_RULES } from '../common/files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectDto,
  ListProjectsDto,
  UpdateProjectDto,
} from './dto/project.dto';

const projectSelect = {
  id: true,
  title: true,
  description: true,
  budgetMin: true,
  budgetMax: true,
  deadline: true,
  status: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  attachments: {
    select: {
      id: true,
      url: true,
      originalName: true,
      mimeType: true,
      size: true,
    },
  },
  _count: { select: { proposals: true } },
} satisfies Prisma.ProjectSelect;

/** Projects that are hidden from the platform (soft deleted) are never shown. */
const visible = { deletedAt: null } satisfies Prisma.ProjectWhereInput;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private prisma: PrismaService,
    private files: FilesService,
    private notifications: NotificationsService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  /**
   * The busiest page of the platform. Stays fast with tens of thousands of rows:
   *  - composite indexes on (status, createdAt), (categoryId, status, createdAt), budgetMax
   *  - a trigram (GIN) index so "search inside title/description" is not a full scan
   *  - the result of each distinct query is cached for 60 seconds (the brief allows
   *    a new project to appear up to a minute late) — repeated visits never hit the DB.
   */
  async list(q: ListProjectsDto) {
    const ttl = Number(process.env.PROJECTS_LIST_CACHE_SECONDS ?? 60) * 1000;
    const key = CacheKeys.projectsList(
      JSON.stringify([
        q.page,
        q.limit,
        q.categoryId,
        q.status,
        q.budgetMin,
        q.budgetMax,
        q.search,
        q.sortBy,
        q.order,
      ]),
    );
    if (ttl > 0) {
      const cached = await this.cache.get(key);
      if (cached) return cached;
    }

    const where: Prisma.ProjectWhereInput = {
      ...visible,
      status: q.status,
      ...(q.categoryId && { categoryId: q.categoryId }),
      // ranges overlap: project.max >= wanted.min AND project.min <= wanted.max
      ...(q.budgetMin !== undefined && { budgetMax: { gte: q.budgetMin } }),
      ...(q.budgetMax !== undefined && { budgetMin: { lte: q.budgetMax } }),
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: 'insensitive' } },
          { description: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
      q.sortBy === 'budget'
        ? [{ budgetMax: q.order }, { id: 'desc' }]
        : [{ createdAt: q.order }, { id: q.order }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        select: projectSelect,
        orderBy,
        ...skipTake(q),
      }),
      this.prisma.project.count({ where }),
    ]);
    const result = paginated(rows.map(present), total, q);
    if (ttl > 0) await this.cache.set(key, result, ttl);
    return result;
  }

  async findOne(id: number) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...visible },
      select: {
        ...projectSelect,
        contract: { select: { id: true, freelancerId: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return present(project);
  }

  /** Client: projects I published. Freelancer: projects I am hired on. */
  async mine(user: AuthUser, q: PaginationDto) {
    const where: Prisma.ProjectWhereInput =
      user.role === Role.CLIENT
        ? { ...visible, clientId: user.userId }
        : { ...visible, contract: { freelancerId: user.userId } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        select: {
          ...projectSelect,
          contract: { select: { id: true, status: true } },
        },
        orderBy: { id: 'desc' },
        ...skipTake(q),
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginated(rows.map(present), total, q);
  }

  async create(
    user: AuthUser,
    dto: CreateProjectDto,
    files: Express.Multer.File[] = [],
  ) {
    this.assertBudget(dto.budgetMin, dto.budgetMax);
    await this.assertCategory(dto.categoryId);
    const saved = await this.files.saveMany(files, 'attachment');
    try {
      const project = await this.prisma.project.create({
        data: {
          title: dto.title,
          description: dto.description,
          categoryId: dto.categoryId,
          budgetMin: dto.budgetMin,
          budgetMax: dto.budgetMax,
          deadline: dto.deadline,
          clientId: user.userId,
          attachments: {
            create: saved.map((f) => ({
              url: f.url!,
              originalName: f.originalName,
              mimeType: f.mimeType,
              size: f.size,
            })),
          },
        },
        select: projectSelect,
      });
      return present(project);
    } catch (err) {
      await this.files.removeMany('attachment', saved);
      throw err;
    }
  }

  /** Edit (and optionally add attachments) — only while OPEN. */
  async update(
    id: number,
    user: AuthUser,
    dto: UpdateProjectDto,
    files: Express.Multer.File[] = [],
  ) {
    const project = await this.ownedProject(id, user);
    this.assertOpen(project.status, 'edited');
    this.assertBudget(
      dto.budgetMin ?? project.budgetMin.toNumber(),
      dto.budgetMax ?? project.budgetMax.toNumber(),
    );
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    const existing = await this.prisma.projectAttachment.count({
      where: { projectId: id },
    });
    if (existing + files.length > UPLOAD_RULES.attachment.maxFiles) {
      throw new BadRequestException(
        `A project can have at most ${UPLOAD_RULES.attachment.maxFiles} attachments`,
      );
    }

    const saved = await this.files.saveMany(files, 'attachment');
    try {
      await this.prisma.$transaction(async (tx) => {
        // the status check is inside the UPDATE itself: an offer accepted at the
        // same instant cannot let an edit slip in afterwards
        const { count } = await tx.project.updateMany({
          where: { id, status: ProjectStatus.OPEN, ...visible },
          data: dto,
        });
        if (count === 0)
          throw new ConflictException('Only open projects can be edited');
        if (saved.length) {
          await tx.projectAttachment.createMany({
            data: saved.map((f) => ({
              projectId: id,
              url: f.url!,
              originalName: f.originalName,
              mimeType: f.mimeType,
              size: f.size,
            })),
          });
        }
      });
    } catch (err) {
      await this.files.removeMany('attachment', saved);
      throw err;
    }
    return this.findOne(id);
  }

  async removeAttachment(id: number, attachmentId: number, user: AuthUser) {
    const project = await this.ownedProject(id, user);
    this.assertOpen(project.status, 'edited');
    const attachment = await this.prisma.projectAttachment.findFirst({
      where: { id: attachmentId, projectId: id },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    await this.prisma.projectAttachment.delete({ where: { id: attachmentId } });
    await this.files.remove('attachment', attachment.url);
  }

  /** Cancel by the owner — only while OPEN. Pending proposals are rejected. */
  async cancel(id: number, user: AuthUser) {
    const project = await this.ownedProject(id, user);
    this.assertOpen(project.status, 'cancelled');
    const rejected = await this.cancelOpenProject(id);
    if (rejected === null)
      throw new ConflictException('Only open projects can be cancelled');
    await this.notifyProposers(rejected, project.title, 'cancelled');
    return { id, status: ProjectStatus.CANCELLED };
  }

  /**
   * Soft delete: the project disappears from the platform but stays in the
   * database for investigation. Allowed while OPEN (it is cancelled at the same
   * time) or CANCELLED. Projects with a contract (money, deliveries, reviews)
   * can never be deleted.
   */
  async remove(id: number, user: AuthUser) {
    const project = await this.ownedProject(id, user);
    if (project.status === ProjectStatus.OPEN) {
      const rejected = await this.cancelOpenProject(id);
      if (rejected)
        await this.notifyProposers(rejected, project.title, 'cancelled');
    }
    const { count } = await this.prisma.project.updateMany({
      where: { id, status: ProjectStatus.CANCELLED, ...visible },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException(
        'Projects in progress or completed cannot be deleted',
      );
    }
  }

  /**
   * The midnight job (FR-30): cancel every OPEN project whose deadline passed
   * without an accepted proposal, and tell the client and every bidder.
   * Works in batches so a huge backlog never loads into memory at once.
   */
  async expireOverdue(now = new Date()) {
    let cancelled = 0;
    for (;;) {
      const batch = await this.prisma.project.findMany({
        where: {
          status: ProjectStatus.OPEN,
          deadline: { lt: now },
          ...visible,
        },
        select: { id: true, title: true, clientId: true },
        take: 100,
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      for (const p of batch) {
        const rejected = await this.cancelOpenProject(p.id);
        if (rejected === null) continue; // someone accepted a proposal meanwhile
        cancelled++;
        await this.notifications.notify([
          {
            userId: p.clientId,
            type: NotificationType.PROJECT_EXPIRED,
            title: 'تم إلغاء مشروعك تلقائياً',
            body: `انتهى موعد استقبال العروض على مشروع "${p.title}" دون قبول أي عرض، فتم إلغاؤه.`,
            data: { projectId: p.id },
            email: true,
          },
          ...rejected.map((freelancerId) => ({
            userId: freelancerId,
            type: NotificationType.PROJECT_EXPIRED,
            title: 'تم إلغاء مشروع قدّمت عليه',
            body: `أُلغي مشروع "${p.title}" لانتهاء موعد استقبال العروض.`,
            data: { projectId: p.id },
            email: true,
          })),
        ]);
      }
    }
    if (cancelled) this.logger.log(`Expired ${cancelled} overdue project(s)`);
    return { cancelled };
  }

  /**
   * OPEN -> CANCELLED and every PENDING proposal -> REJECTED, atomically.
   * Returns the ids of the freelancers whose proposals were rejected, or null
   * if the project was no longer OPEN.
   */
  private cancelOpenProject(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.project.updateMany({
        where: { id, status: ProjectStatus.OPEN },
        data: { status: ProjectStatus.CANCELLED },
      });
      if (count === 0) return null;
      const pending = await tx.proposal.findMany({
        where: { projectId: id, status: ProposalStatus.PENDING },
        select: { freelancerId: true },
      });
      await tx.proposal.updateMany({
        where: { projectId: id, status: ProposalStatus.PENDING },
        data: { status: ProposalStatus.REJECTED },
      });
      return pending.map((p) => p.freelancerId);
    });
  }

  private notifyProposers(
    freelancerIds: number[],
    title: string,
    reason: string,
  ) {
    return this.notifications.notify(
      freelancerIds.map((userId) => ({
        userId,
        type: NotificationType.PROPOSAL_REJECTED,
        title: 'تم إلغاء مشروع قدّمت عليه',
        body: `قام صاحب مشروع "${title}" بإلغائه (${reason})، لذلك لم يعد عرضك قائماً.`,
        email: true,
      })),
    );
  }

  /** Loads a visible project and enforces ownership (403, not just 404). */
  private async ownedProject(id: number, user: AuthUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...visible },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.clientId !== user.userId)
      throw new ForbiddenException('Not your project');
    return project;
  }

  private assertOpen(status: ProjectStatus, action: string) {
    if (status !== ProjectStatus.OPEN) {
      throw new ConflictException(`Only open projects can be ${action}`);
    }
  }

  private assertBudget(min: number, max: number) {
    if (min > max)
      throw new BadRequestException(
        'budgetMin cannot be greater than budgetMax',
      );
  }

  private async assertCategory(categoryId: number) {
    const exists = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException('Category does not exist');
  }
}

/** Rename Prisma's `_count` to something friendly for the frontend. */
function present<T extends { _count: { proposals: number } }>({
  _count,
  ...p
}: T) {
  return { ...p, proposalsCount: _count.proposals };
}
