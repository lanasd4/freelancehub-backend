/**
 * The brief's abuse limits, at their REAL values (a fresh app instance, so the
 * in-memory throttler counters start from zero):
 *   - 5 login attempts per minute
 *   - 3 new accounts per hour from the same source
 */
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

describe('rate limits (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  const run = Date.now();

  beforeAll(async () => {
    process.env.REGISTER_LIMIT_PER_HOUR = '3';
    process.env.LOGIN_LIMIT_PER_MINUTE = '5';
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(() => app.close());

  it('a 4th account from the same source within the hour is refused (429)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await http.post('/api/auth/register').send({
        name: `bot${i}`,
        email: `bot${i}.${run}@test.local`,
        password: 'Passw0rd!',
        role: 'FREELANCER',
      });
      codes.push(r.status);
    }
    expect(codes).toEqual([201, 201, 201, 429]);
  });

  it('a 6th login attempt within the minute is refused (429)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await http.post('/api/auth/login').send({
        email: `nobody.${run}@test.local`,
        password: 'wrong-password',
      });
      codes.push(r.status);
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
  });
});
