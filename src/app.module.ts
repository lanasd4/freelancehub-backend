import KeyvRedis from '@keyv/redis';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { Keyv } from 'keyv';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { FilesModule } from './common/files/files.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ContractsModule } from './contracts/contracts.module';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProjectsModule } from './projects/projects.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SkillsModule } from './skills/skills.module';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    // The app refuses to start if a required variable is missing (guide ch.24).
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6380/0'),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        ADMIN_EMAIL: Joi.string()
          .email({ tlds: { allow: false } })
          .required(),
        ADMIN_PASSWORD: Joi.string().min(8).required(),
        CORS_ORIGINS: Joi.string().allow('').default(''),
        THROTTLE_LIMIT: Joi.number().default(100),
        SMTP_HOST: Joi.string().allow('').default(''),
        SMTP_PORT: Joi.number().default(587),
        SMTP_USER: Joi.string().allow('').default(''),
        SMTP_PASS: Joi.string().allow('').default(''),
        MAIL_FROM: Joi.string()
          .allow('')
          .default('FreelanceHub <no-reply@freelancehub.local>'),
        CRON_TZ: Joi.string().default('Asia/Damascus'),
      }),
    }),

    // General flood protection: 100 requests / minute / IP. Login, register and
    // proposals have their own stricter limits.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: 60_000,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 100,
        },
      ],
    }),

    // Cache in Redis (guide ch.16): shared by every server instance, survives restarts.
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [
          new Keyv({
            store: new KeyvRedis(config.getOrThrow<string>('REDIS_URL')),
            namespace: 'cache', // keeps cache keys apart from BullMQ's keys
          }),
        ],
        ttl: 60_000,
      }),
    }),

    // Queues (guide ch.21): background emails and the midnight job, stored in Redis.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            db: Number(url.pathname.slice(1) || 0),
          },
          prefix: 'fh',
        };
      },
    }),

    PrismaModule,
    FilesModule,
    MailModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    SkillsModule,
    CategoriesModule,
    ProjectsModule,
    ProposalsModule,
    ContractsModule,
    WalletModule,
    ReviewsModule,
    JobsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: throttle, then authenticate, then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // One error shape for the whole API.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
