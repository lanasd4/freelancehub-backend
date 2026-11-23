import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';

/** Shared by main.ts and the e2e tests so tests run the app exactly as it ships. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // behind Nginx, read the real IP for rate limiting
  // images are loaded by the frontend from another origin
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: (config.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Only the public folder is served. Delivery files live in uploads/private
  // and are reachable only through the guarded download endpoint.
  app.useStaticAssets(join(process.cwd(), 'uploads', 'public'), {
    prefix: '/uploads',
  });
}
