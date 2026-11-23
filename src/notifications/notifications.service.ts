import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { paginated, skipTake } from '../common/dto/pagination.dto';
import { MAIL_JOB_OPTIONS, MAIL_QUEUE, MailJob } from '../mail/mail.constants';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

export interface NotifyInput {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  /** also send an email (in the background) */
  email?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(MAIL_QUEUE) private mailQueue: Queue<MailJob>,
  ) {}

  /**
   * Called AFTER the business transaction committed. Stores in-app notifications
   * and puts emails in the queue; it never makes the user wait for SMTP and never
   * fails the request that triggered it (errors are logged).
   */
  async notify(items: NotifyInput[]) {
    if (items.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: items.map(({ userId, type, title, body, data }) => ({
          userId,
          type,
          title,
          body,
          data,
        })),
      });

      const emailed = items.filter((i) => i.email);
      if (emailed.length) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: emailed.map((i) => i.userId) } },
          select: { id: true, email: true, name: true },
        });
        const byId = new Map(users.map((u) => [u.id, u]));
        await this.mailQueue.addBulk(
          emailed
            .filter((i) => byId.has(i.userId))
            .map((i) => {
              const u = byId.get(i.userId)!;
              return {
                name: i.type,
                data: {
                  to: u.email,
                  subject: `FreelanceHub — ${i.title}`,
                  text: `مرحباً ${u.name},\n\n${i.body}\n\nفريق FreelanceHub`,
                },
                opts: MAIL_JOB_OPTIONS,
              };
            }),
        );
      }
    } catch (err) {
      this.logger.error(`Failed to notify: ${(err as Error).message}`);
    }
  }

  async list(userId: number, q: ListNotificationsDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(q.unreadOnly && { readAt: null }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { id: 'desc' },
        ...skipTake(q),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(data, total, q);
  }

  async unreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: number, id: number) {
    // the userId in the WHERE makes other people's notifications invisible (404)
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Notification not found');
    return { id, read: true };
  }

  async markAllRead(userId: number) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
