import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin accounts cannot be created through sign-up, so the platform admin is
 * created from ADMIN_EMAIL / ADMIN_PASSWORD when the app starts (only if it does
 * not exist yet; an existing password is never overwritten). Its wallet also
 * collects the 10% commission.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.getOrThrow<string>('ADMIN_EMAIL').toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      include: { wallet: true },
    });

    if (!existing) {
      const password = await bcrypt.hash(
        this.config.getOrThrow<string>('ADMIN_PASSWORD'),
        10,
      );
      await this.prisma.user.create({
        data: {
          name: 'Platform Admin',
          email,
          password,
          role: Role.ADMIN,
          wallet: { create: {} },
        },
      });
      this.logger.log(`Admin account created: ${email}`);
      return;
    }
    if (existing.role !== Role.ADMIN) {
      throw new Error(
        `ADMIN_EMAIL (${email}) belongs to a non-admin account; choose another address`,
      );
    }
    if (!existing.wallet) {
      await this.prisma.wallet.create({ data: { userId: existing.id } });
    }
  }
}
