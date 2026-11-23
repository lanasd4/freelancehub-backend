/**
 * End-to-end test of the FreelanceHub brief (v2) against real PostgreSQL + Redis.
 * Run with `npm run test:e2e` (uses TEST_DATABASE_URL / TEST_REDIS_URL from .env).
 * Every run uses fresh e-mail addresses, so it can be repeated on the same DB.
 */
import { getQueueToken } from '@nestjs/bullmq';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MAIL_QUEUE } from '../src/mail/mail.constants';
import { MAINTENANCE_QUEUE } from '../src/jobs/jobs.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n%test\n');
const ZIP = Buffer.from('PK\x03\x04 fake zip');
const png = { filename: 'a.png', contentType: 'image/png' };
const pdf = { filename: 'cv.pdf', contentType: 'application/pdf' };
const zip = { filename: 'work.zip', contentType: 'application/zip' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const n = (v: unknown) => Number(v);

describe('FreelanceHub v2 (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  const run = Date.now();
  const email = (who: string) => `${who}.${run}@test.local`;
  const tokens: Record<string, string> = {};
  const refresh: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const cat: Record<string, number> = {};
  const skills: number[] = [];

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const wallet = async (who: string) => {
    const w = (await http.get('/api/wallet').set(auth(who)).expect(200)).body;
    return { balance: n(w.balance), held: n(w.heldBalance) };
  };

  async function register(who: string, role: 'CLIENT' | 'FREELANCER') {
    const res = await http
      .post('/api/auth/register')
      .send({ name: who, email: email(who), password: 'Passw0rd!', role })
      .expect(201);
    tokens[who] = res.body.accessToken;
    refresh[who] = res.body.refreshToken;
    ids[who] = res.body.user.id;
  }

  async function newProject(
    who: string,
    extra: Record<string, string | number> = {},
  ) {
    const res = await http
      .post('/api/projects')
      .set(auth(who))
      .field({
        title: `Project ${run} ${Math.random().toString(36).slice(2, 7)}`,
        description: 'A detailed description',
        categoryId: cat.code,
        budgetMin: 100,
        budgetMax: 300,
        deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
        ...extra,
      })
      .expect(201);
    return res.body.id as number;
  }

  const bid = (who: string, projectId: number, price: number, days = 10) =>
    http
      .post(`/api/projects/${projectId}/proposals`)
      .set(auth(who))
      .send({
        price,
        durationDays: days,
        message: `I am ${who}, a great fit for this job.`,
      });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());

    const admin = await http
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(200);
    tokens.admin = admin.body.accessToken;

    for (const [key, name] of [
      ['code', `Programming ${run}`],
      ['design', `Design ${run}`],
    ]) {
      const c = await http
        .post('/api/categories')
        .set(auth('admin'))
        .send({ name })
        .expect(201);
      cat[key] = c.body.id;
    }
    for (const name of [`Flutter ${run}`, `NestJS ${run}`]) {
      const s = await http
        .post('/api/skills')
        .set(auth('admin'))
        .send({ name })
        .expect(201);
      skills.push(s.body.id);
    }
    for (const who of ['sara', 'omar']) await register(who, 'CLIENT');
    for (const who of ['ahmed', 'layla', 'khaled', 'mona'])
      await register(who, 'FREELANCER');
  });

  afterAll(() => app.close());

  // ───────────────────────── accounts & sessions ─────────────────────────
  describe('accounts, devices and security', () => {
    it('never creates an admin from sign-up and never returns passwords', async () => {
      await http
        .post('/api/auth/register')
        .send({
          name: 'x',
          email: email('x'),
          password: 'Passw0rd!',
          role: 'ADMIN',
        })
        .expect(400);
      const me = await http.get('/api/users/me').set(auth('sara')).expect(200);
      expect(me.body).not.toHaveProperty('password');
      await http
        .post('/api/auth/register')
        .send({
          name: 'dup',
          email: email('sara'),
          password: 'Passw0rd!',
          role: 'CLIENT',
        })
        .expect(409);
    });

    it('errors always have the same shape', async () => {
      const res = await http.get('/api/projects/999999999').expect(404);
      expect(res.body).toEqual({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Project not found',
        path: '/api/projects/999999999',
        timestamp: expect.any(String),
      });
      const bad = await http
        .post('/api/auth/login')
        .send({ email: 'nope' })
        .expect(400);
      expect(Array.isArray(bad.body.message)).toBe(true);
    });

    it('lists my devices and logs out one specific device', async () => {
      const phone = await http
        .post('/api/auth/login')
        .set(
          'User-Agent',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
        )
        .send({ email: email('omar'), password: 'Passw0rd!' })
        .expect(200);
      const cafe = await http
        .post('/api/auth/login')
        .set(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36',
        )
        .send({ email: email('omar'), password: 'Passw0rd!' })
        .expect(200);
      const list = await http
        .get('/api/auth/sessions')
        .set({ Authorization: `Bearer ${phone.body.accessToken}` })
        .expect(200);
      expect(list.body.length).toBeGreaterThanOrEqual(3);
      expect(list.body.map((s: any) => s.device)).toEqual(
        expect.arrayContaining([
          'Safari on iOS (mobile)',
          'Chrome on Windows (desktop)',
        ]),
      );
      const current = list.body.find((s: any) => s.current);
      expect(current.device).toBe('Safari on iOS (mobile)');
      expect(current).toHaveProperty('ip');
      expect(current).toHaveProperty('loggedInAt');

      // log out the café laptop from the phone
      const cafeSession = list.body.find((s: any) =>
        s.device.startsWith('Chrome'),
      );
      await http
        .delete(`/api/auth/sessions/${cafeSession.id}`)
        .set({ Authorization: `Bearer ${phone.body.accessToken}` })
        .expect(204);
      await http
        .get('/api/users/me')
        .set({ Authorization: `Bearer ${cafe.body.accessToken}` })
        .expect(401);
      await http
        .get('/api/users/me')
        .set({ Authorization: `Bearer ${phone.body.accessToken}` })
        .expect(200);
      // someone else's session id is just "not found"
      await http
        .delete(`/api/auth/sessions/${current.id}`)
        .set(auth('sara'))
        .expect(404);
    });

    it('reusing an old refresh token ends EVERY session of the user', async () => {
      const a = await http
        .post('/api/auth/login')
        .send({ email: email('mona'), password: 'Passw0rd!' })
        .expect(200);
      const b = await http
        .post('/api/auth/login')
        .send({ email: email('mona'), password: 'Passw0rd!' })
        .expect(200);
      const rotated = await http
        .post('/api/auth/refresh')
        .send({ refreshToken: a.body.refreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(a.body.refreshToken);

      // the stolen (old) token comes back
      const reuse = await http
        .post('/api/auth/refresh')
        .send({ refreshToken: a.body.refreshToken })
        .expect(401);
      expect(reuse.body.message).toMatch(/reuse detected/);
      // every device is logged out, including the one that never leaked
      await http
        .post('/api/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
      await http
        .post('/api/auth/refresh')
        .send({ refreshToken: b.body.refreshToken })
        .expect(401);
      await http
        .get('/api/users/me')
        .set({ Authorization: `Bearer ${b.body.accessToken}` })
        .expect(401);
      await http.get('/api/users/me').set(auth('mona')).expect(401); // the registration session too
    });

    it('logout-all ends every session', async () => {
      const s = await http
        .post('/api/auth/login')
        .send({ email: email('omar'), password: 'Passw0rd!' })
        .expect(200);
      await http
        .post('/api/auth/logout-all')
        .set({ Authorization: `Bearer ${s.body.accessToken}` })
        .expect(204);
      await http.get('/api/users/me').set(auth('omar')).expect(401);
      const again = await http
        .post('/api/auth/login')
        .send({ email: email('omar'), password: 'Passw0rd!' })
        .expect(200);
      tokens.omar = again.body.accessToken;
    });
  });

  // ───────────────────────── profile & skills ─────────────────────────
  describe('freelancer profile', () => {
    it('title, bio, rate and skills from the platform list', async () => {
      await http
        .patch('/api/freelancers/me/profile')
        .set(auth('ahmed'))
        .send({ skillIds: [999999] })
        .expect(400);
      const res = await http
        .patch('/api/freelancers/me/profile')
        .set(auth('ahmed'))
        .send({
          title: 'Flutter developer',
          bio: 'Mobile apps',
          hourlyRate: 20.5,
          skillIds: skills,
        })
        .expect(200);
      expect(res.body.skills.map((s: any) => s.id).sort()).toEqual(
        [...skills].sort(),
      );
      expect(res.body.rating).toEqual({ average: null, count: 0 });
      await http
        .patch('/api/freelancers/me/profile')
        .set(auth('sara'))
        .send({ bio: 'x' })
        .expect(403);
    });

    it('avatar: images up to 2MB; CV: PDF up to 5MB', async () => {
      await http
        .put('/api/freelancers/me/avatar')
        .set(auth('ahmed'))
        .attach('file', PDF, pdf)
        .expect(400);
      await http
        .put('/api/freelancers/me/avatar')
        .set(auth('ahmed'))
        .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1), png)
        .expect(413);
      const a = await http
        .put('/api/freelancers/me/avatar')
        .set(auth('ahmed'))
        .attach('file', PNG, png)
        .expect(200);
      await http.get(a.body.avatarUrl).expect(200);

      await http
        .put('/api/freelancers/me/cv')
        .set(auth('ahmed'))
        .attach('file', PNG, png)
        .expect(400);
      await http
        .put('/api/freelancers/me/cv')
        .set(auth('ahmed'))
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), pdf)
        .expect(413);
      const cv = await http
        .put('/api/freelancers/me/cv')
        .set(auth('ahmed'))
        .attach('file', PDF, pdf)
        .expect(200);
      expect(cv.body.cvUrl).toMatch(/^\/uploads\/cvs\/[0-9a-f-]+\.pdf$/);

      // the cached public profile shows the change immediately
      const p = await http.get(`/api/freelancers/${ids.ahmed}`).expect(200);
      expect(p.body.avatarUrl).toBe(a.body.avatarUrl);
      expect(p.body.cvUrl).toBe(cv.body.cvUrl);
      expect(JSON.stringify(p.body)).not.toContain('@test.local');
    });
  });

  // ───────────────────────── the story ─────────────────────────
  describe("the brief's story: Sara, Ahmed, Layla and Khaled", () => {
    let projectId: number;
    const proposal: Record<string, number> = {};
    let contractId: number;
    const milestone: number[] = [];
    let adminBefore: number;

    it('day 1: Sara tops up $600 and publishes a project with attachments', async () => {
      await http
        .post('/api/wallet/deposit')
        .set(auth('sara'))
        .send({ amount: 600 })
        .expect(200);
      expect(await wallet('sara')).toEqual({ balance: 600, held: 0 });

      await http
        .post('/api/projects')
        .set(auth('sara'))
        .field({
          title: 't',
          description: 'd',
          categoryId: cat.code,
          budgetMin: 600,
          budgetMax: 400,
          deadline: new Date(Date.now() + 864e5).toISOString(),
        })
        .expect(400); // min > max
      await http
        .post('/api/projects')
        .set(auth('sara'))
        .field({
          title: 't',
          description: 'd',
          categoryId: cat.code,
          budgetMin: 400,
          budgetMax: 600,
          deadline: '2020-01-01',
        })
        .expect(400); // deadline in the past

      const res = await http
        .post('/api/projects')
        .set(auth('sara'))
        .field({
          title: `Clothing store app ${run}`,
          description: `A mobile app for my clothing store ${run}-unique-word`,
          categoryId: cat.code,
          budgetMin: 400,
          budgetMax: 600,
          deadline: new Date(Date.now() + 7 * 864e5).toISOString(),
        })
        .attach('attachments', PNG, png)
        .attach('attachments', PDF, pdf)
        .expect(201);
      projectId = res.body.id;
      expect(res.body.status).toBe('OPEN');
      expect(res.body.attachments).toHaveLength(2);
    });

    it('at most 5 attachments per project', async () => {
      const r = http
        .post('/api/projects')
        .set(auth('sara'))
        .field({
          title: 't',
          description: 'd',
          categoryId: cat.code,
          budgetMin: 1,
          budgetMax: 2,
          deadline: new Date(Date.now() + 864e5).toISOString(),
        });
      for (let i = 0; i < 6; i++) r.attach('attachments', PNG, png);
      await r.expect(400);
    });

    it('days 1–2: freelancers filter projects and find it', async () => {
      const filtered = await http
        .get(
          `/api/projects?categoryId=${cat.code}&budgetMin=450&budgetMax=500&status=OPEN&sortBy=budget&order=desc`,
        )
        .expect(200);
      expect(filtered.body.data.map((p: any) => p.id)).toContain(projectId);
      expect(filtered.body.meta).toEqual(
        expect.objectContaining({
          page: 1,
          limit: 10,
          total: expect.any(Number),
          totalPages: expect.any(Number),
        }),
      );
      // search inside the DESCRIPTION, not only the title
      const search = await http
        .get(`/api/projects?search=${run}-unique-word`)
        .expect(200);
      expect(search.body.data.map((p: any) => p.id)).toEqual([projectId]);
      // budget range that doesn't overlap
      const none = await http
        .get(`/api/projects?categoryId=${cat.code}&budgetMin=601&budgetMax=900`)
        .expect(200);
      expect(none.body.data.map((p: any) => p.id)).not.toContain(projectId);
      await http.get('/api/projects?sortBy=password').expect(400);
      await http.get('/api/projects?limit=101').expect(400);
    });

    it('they bid; a double click still gives ONE proposal; the owner cannot bid', async () => {
      const [first, second] = await Promise.all([
        bid('ahmed', projectId, 500, 20),
        bid('ahmed', projectId, 500, 20),
      ]);
      expect([first.status, second.status].sort()).toEqual([201, 409]);
      proposal.ahmed = (first.status === 201 ? first : second).body.id;
      proposal.layla = (
        await bid('layla', projectId, 450, 25).expect(201)
      ).body.id;
      proposal.khaled = (
        await bid('khaled', projectId, 550, 15).expect(201)
      ).body.id;
      await http
        .post(`/api/projects/${projectId}/proposals`)
        .set(auth('sara'))
        .send({ price: 1, durationDays: 1, message: 'my own project' })
        .expect(403);
    });

    it('Sara is notified of every proposal', async () => {
      const list = await http
        .get('/api/notifications?unreadOnly=true')
        .set(auth('sara'))
        .expect(200);
      expect(
        list.body.data.filter((x: any) => x.type === 'PROPOSAL_RECEIVED'),
      ).toHaveLength(3);
      expect(
        (
          await http
            .get('/api/notifications/unread-count')
            .set(auth('sara'))
            .expect(200)
        ).body.count,
      ).toBe(3);
    });

    it('a freelancer edits or withdraws only while pending; withdrawn cannot re-bid', async () => {
      await http
        .patch(`/api/proposals/${proposal.layla}`)
        .set(auth('khaled'))
        .send({ price: 1 })
        .expect(403);
      await http
        .patch(`/api/proposals/${proposal.layla}`)
        .set(auth('layla'))
        .send({ price: 440 })
        .expect(200);
      const temp = await http
        .post('/api/projects')
        .set(auth('omar'))
        .field({
          title: 'tmp',
          description: 'd',
          categoryId: cat.code,
          budgetMin: 1,
          budgetMax: 9,
          deadline: new Date(Date.now() + 864e5).toISOString(),
        })
        .expect(201);
      const p = (await bid('khaled', temp.body.id, 5).expect(201)).body.id;
      await http
        .post(`/api/proposals/${p}/withdraw`)
        .set(auth('khaled'))
        .expect(200);
      await bid('khaled', temp.body.id, 6).expect(409);
      const mine = await http
        .get('/api/proposals/mine?status=WITHDRAWN')
        .set(auth('khaled'))
        .expect(200);
      expect(mine.body.data.map((x: any) => x.id)).toContain(p);
    });

    it('day 3: Sara compares proposals (sorted, paged, with ratings); others cannot see them', async () => {
      const res = await http
        .get(
          `/api/projects/${projectId}/proposals?sortBy=price&order=asc&limit=2`,
        )
        .set(auth('sara'))
        .expect(200);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.data.map((x: any) => n(x.price))).toEqual([440, 500]);
      expect(res.body.data[0].freelancer.rating).toEqual({
        average: null,
        count: 0,
      });
      await http
        .get(`/api/projects/${projectId}/proposals`)
        .set(auth('omar'))
        .expect(403);
      await http
        .get(`/api/projects/${projectId}/proposals`)
        .set(auth('ahmed'))
        .expect(403);
    });

    it('day 3: accepting Ahmed ($500, 20 days): escrow + contract + rejections, all at once', async () => {
      const mailQueue = app.get<Queue>(getQueueToken(MAIL_QUEUE));
      const before = Date.now();
      const res = await http
        .post(`/api/proposals/${proposal.ahmed}/accept`)
        .set(auth('sara'))
        .expect(200);
      expect(Date.now() - before).toBeLessThan(3000); // the client does not wait for emails
      contractId = res.body.contractId;
      expect(res.body).toMatchObject({
        projectStatus: 'IN_PROGRESS',
        durationDays: 20,
      });
      expect(n(res.body.amount)).toBe(500);

      expect(await wallet('sara')).toEqual({ balance: 100, held: 500 });
      const tx = await http
        .get('/api/wallet/transactions?type=ESCROW_HOLD')
        .set(auth('sara'))
        .expect(200);
      expect(tx.body.data).toHaveLength(1);
      expect(n(tx.body.data[0].amount)).toBe(500);

      const statuses = async (who: string) =>
        (
          await http.get('/api/proposals/mine').set(auth(who)).expect(200)
        ).body.data.find((x: any) => x.projectId === projectId).status;
      expect(await statuses('ahmed')).toBe('ACCEPTED');
      expect(await statuses('layla')).toBe('REJECTED');
      expect(await statuses('khaled')).toBe('REJECTED');

      // emails were queued (background), with retries + growing backoff
      const jobs = await mailQueue.getJobs([
        'waiting',
        'active',
        'completed',
        'delayed',
      ]);
      const mine = jobs.filter((j) =>
        [email('ahmed'), email('layla'), email('khaled')].includes(j.data.to),
      );
      expect(mine.map((j) => j.name)).toEqual(
        expect.arrayContaining([
          'PROPOSAL_ACCEPTED',
          'PROPOSAL_REJECTED',
          'PROPOSAL_REJECTED',
        ]),
      );
      expect(mine[0].opts.attempts).toBe(5);
      expect(mine[0].opts.backoff).toEqual({
        type: 'exponential',
        delay: 5000,
      });

      // nothing can be accepted, edited or cancelled afterwards
      await http
        .post(`/api/proposals/${proposal.layla}/accept`)
        .set(auth('sara'))
        .expect(409);
      await http
        .patch(`/api/projects/${projectId}`)
        .set(auth('sara'))
        .send({ title: 'x' })
        .expect(409);
      await http
        .post(`/api/projects/${projectId}/cancel`)
        .set(auth('sara'))
        .expect(409);
      await http
        .delete(`/api/projects/${projectId}`)
        .set(auth('sara'))
        .expect(409);
    });

    it('day 4: Sara splits the contract into 100 + 250 + 150 (never more than $500)', async () => {
      for (const [title, amount] of [
        ['Design', 100],
        ['Build', 250],
        ['Publish', 150],
      ] as const) {
        const m = await http
          .post(`/api/contracts/${contractId}/milestones`)
          .set(auth('sara'))
          .send({ title, amount })
          .expect(201);
        milestone.push(m.body.id);
      }
      await http
        .post(`/api/contracts/${contractId}/milestones`)
        .set(auth('sara'))
        .send({ title: 'extra', amount: 0.01 })
        .expect(400);
      await http
        .post(`/api/contracts/${contractId}/milestones`)
        .set(auth('ahmed'))
        .send({ title: 'x', amount: 1 })
        .expect(403);
      const c = await http
        .get(`/api/contracts/${contractId}`)
        .set(auth('ahmed'))
        .expect(200);
      expect(c.body.milestones.map((m: any) => m.position)).toEqual([1, 2, 3]);
      expect(n(c.body.unallocated)).toBe(0);
      await http
        .get(`/api/contracts/${contractId}`)
        .set(auth('layla'))
        .expect(403);
    });

    it('day 10: Ahmed delivers, Sara asks for a revision, Ahmed re-delivers, Sara approves', async () => {
      await http
        .post(`/api/milestones/${milestone[0]}/approve`)
        .set(auth('sara'))
        .expect(409); // nothing delivered
      await http
        .post(`/api/milestones/${milestone[0]}/submissions`)
        .set(auth('ahmed'))
        .field({ note: 'designs v1' })
        .attach('files', PNG, png)
        .expect(400); // only PDF / ZIP
      await http
        .post(`/api/milestones/${milestone[0]}/submissions`)
        .set(auth('layla'))
        .field({ note: 'not mine' })
        .attach('files', ZIP, zip)
        .expect(403);
      await http
        .post(`/api/milestones/${milestone[0]}/submissions`)
        .set(auth('ahmed'))
        .field({ note: 'designs v1' })
        .attach('files', ZIP, zip)
        .expect(201);

      const n1 = await http
        .get('/api/notifications')
        .set(auth('sara'))
        .expect(200);
      expect(n1.body.data[0].type).toBe('MILESTONE_SUBMITTED');

      await http
        .post(`/api/milestones/${milestone[0]}/request-revision`)
        .set(auth('sara'))
        .send({ note: 'Please change the colors' })
        .expect(200);
      const n2 = await http
        .get('/api/notifications')
        .set(auth('ahmed'))
        .expect(200);
      expect(n2.body.data[0]).toMatchObject({
        type: 'MILESTONE_REVISION_REQUESTED',
      });

      await http
        .post(`/api/milestones/${milestone[0]}/submissions`)
        .set(auth('ahmed'))
        .field({ note: 'designs v2, new colors' })
        .attach('files', ZIP, zip)
        .attach('files', PDF, pdf)
        .expect(201);

      // private files: the parties and the admin only
      const subs = await http
        .get(`/api/milestones/${milestone[0]}/submissions`)
        .set(auth('sara'))
        .expect(200);
      expect(subs.body).toHaveLength(2); // history is kept
      const fileId = subs.body[0].files[0].id;
      await http
        .get(`/api/submission-files/${fileId}/download`)
        .set(auth('sara'))
        .expect(200);
      await http
        .get(`/api/submission-files/${fileId}/download`)
        .set(auth('admin'))
        .expect(200);
      await http
        .get(`/api/submission-files/${fileId}/download`)
        .set(auth('layla'))
        .expect(403);
      await http
        .get(`/api/milestones/${milestone[0]}/submissions`)
        .set(auth('khaled'))
        .expect(403);

      adminBefore = (await wallet('admin')).balance;
      // a double click on "approve" pays once
      const [a, b] = await Promise.all([
        http.post(`/api/milestones/${milestone[0]}/approve`).set(auth('sara')),
        http.post(`/api/milestones/${milestone[0]}/approve`).set(auth('sara')),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await wallet('ahmed')).toEqual({ balance: 90, held: 0 });
      expect((await wallet('admin')).balance - adminBefore).toBeCloseTo(10, 2);
      expect(await wallet('sara')).toEqual({ balance: 100, held: 400 });

      const pay = await http
        .get('/api/notifications')
        .set(auth('ahmed'))
        .expect(200);
      expect(pay.body.data.map((x: any) => x.type)).toEqual(
        expect.arrayContaining(['MILESTONE_APPROVED', 'PAYMENT_RECEIVED']),
      );
    });

    it('reviews are not allowed before completion', async () => {
      await http
        .post(`/api/contracts/${contractId}/reviews`)
        .set(auth('sara'))
        .send({ rating: 5, comment: 'great' })
        .expect(409);
    });

    it('day 20: the last two milestones complete the contract; Ahmed has $450', async () => {
      for (const id of [milestone[1], milestone[2]]) {
        await http
          .post(`/api/milestones/${id}/submissions`)
          .set(auth('ahmed'))
          .field({ note: 'done' })
          .attach('files', ZIP, zip)
          .expect(201);
        const r = await http
          .post(`/api/milestones/${id}/approve`)
          .set(auth('sara'))
          .expect(200);
        expect(r.body.contractStatus).toBe(
          id === milestone[2] ? 'COMPLETED' : 'ACTIVE',
        );
      }
      expect(await wallet('ahmed')).toEqual({ balance: 450, held: 0 });
      expect(await wallet('sara')).toEqual({ balance: 100, held: 0 });
      expect((await wallet('admin')).balance - adminBefore).toBeCloseTo(50, 2);
      expect(
        (await http.get(`/api/projects/${projectId}`).expect(200)).body.status,
      ).toBe('COMPLETED');
      const c = await http
        .get(`/api/contracts/${contractId}`)
        .set(auth('sara'))
        .expect(200);
      expect(c.body.status).toBe('COMPLETED');
    });

    it('day 21: both rate 5 stars, once each; the profile updates at once', async () => {
      await http.get(`/api/freelancers/${ids.ahmed}`).expect(200); // warm the cache
      await http
        .post(`/api/contracts/${contractId}/reviews`)
        .set(auth('layla'))
        .send({ rating: 1, comment: 'x' })
        .expect(403);
      await http
        .post(`/api/contracts/${contractId}/reviews`)
        .set(auth('sara'))
        .send({ rating: 6, comment: 'x' })
        .expect(400);
      const [r1, r2] = await Promise.all([
        http
          .post(`/api/contracts/${contractId}/reviews`)
          .set(auth('sara'))
          .send({ rating: 5, comment: 'Excellent work!' }),
        http
          .post(`/api/contracts/${contractId}/reviews`)
          .set(auth('sara'))
          .send({ rating: 5, comment: 'Excellent work!' }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      await http
        .post(`/api/contracts/${contractId}/reviews`)
        .set(auth('ahmed'))
        .send({ rating: 5, comment: 'Clear client' })
        .expect(201);

      const p = await http.get(`/api/freelancers/${ids.ahmed}`).expect(200);
      expect(p.body.rating).toEqual({ average: 5, count: 1 });
      expect(p.body.completedProjects).toBe(1);
      expect(p.body.latestReviews[0]).toMatchObject({
        rating: 5,
        comment: 'Excellent work!',
      });
      const reviews = await http
        .get(`/api/users/${ids.sara}/reviews`)
        .expect(200);
      expect(reviews.body.rating).toEqual({ average: 5, count: 1 });
    });

    it('day 21: Ahmed withdraws $450; never more than he has, even in parallel', async () => {
      await http
        .post('/api/wallet/withdraw')
        .set(auth('ahmed'))
        .send({ amount: 450.01 })
        .expect(402);
      const [a, b] = await Promise.all([
        http
          .post('/api/wallet/withdraw')
          .set(auth('ahmed'))
          .send({ amount: 300 }),
        http
          .post('/api/wallet/withdraw')
          .set(auth('ahmed'))
          .send({ amount: 300 }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 402]);
      await http
        .post('/api/wallet/withdraw')
        .set(auth('ahmed'))
        .send({ amount: 150 })
        .expect(200);
      expect(await wallet('ahmed')).toEqual({ balance: 0, held: 0 });
    });

    it('the wallet history filters by type and between two dates', async () => {
      const all = await http
        .get('/api/wallet/transactions')
        .set(auth('ahmed'))
        .expect(200);
      expect(all.body.data.map((t: any) => t.type)).toEqual([
        'WITHDRAWAL',
        'WITHDRAWAL',
        'PAYMENT',
        'PAYMENT',
        'PAYMENT',
      ]);
      const payments = await http
        .get('/api/wallet/transactions?type=PAYMENT')
        .set(auth('ahmed'))
        .expect(200);
      expect(payments.body.data.map((t: any) => n(t.amount))).toEqual([
        135, 225, 90,
      ]);
      const future = new Date(Date.now() + 864e5).toISOString();
      const none = await http
        .get(`/api/wallet/transactions?from=${future}`)
        .set(auth('ahmed'))
        .expect(200);
      expect(none.body.meta.total).toBe(0);
      await http
        .get(`/api/wallet/transactions?from=${future}&to=2020-01-01`)
        .set(auth('ahmed'))
        .expect(400);
    });

    it('the admin sees the new earnings on the dashboard', async () => {
      const d = await http
        .get('/api/admin/dashboard')
        .set(auth('admin'))
        .expect(200);
      expect(n(d.body.earnings.totalCommission)).toBeGreaterThanOrEqual(50);
      expect(d.body.earnings.lastSixMonths).toHaveLength(6);
      const thisMonth = d.body.earnings.lastSixMonths[5];
      expect(n(thisMonth.earnings)).toBeGreaterThanOrEqual(50);
      expect(d.body.topFreelancers.length).toBeLessThanOrEqual(5);
      expect(d.body.topCategories.length).toBeLessThanOrEqual(5);
      expect(d.body.users.byRole.CLIENT).toBeGreaterThanOrEqual(2);
      expect(d.body.users.newThisMonth).toBeGreaterThanOrEqual(6);
      expect(Object.keys(d.body.projects).sort()).toEqual([
        'CANCELLED',
        'COMPLETED',
        'IN_PROGRESS',
        'OPEN',
      ]);
      await http.get('/api/admin/dashboard').set(auth('sara')).expect(403);
    });
  });

  // ───────────────────────── money edge cases ─────────────────────────
  describe('money: concurrency, insufficient balance, refunds', () => {
    it('insufficient balance: 402 and NOTHING changes', async () => {
      const p = await newProject('omar');
      const b = (await bid('layla', p, 99_999).expect(201)).body.id;
      const before = await wallet('omar');
      await http
        .post(`/api/proposals/${b}/accept`)
        .set(auth('omar'))
        .expect(402);
      expect(await wallet('omar')).toEqual(before);
      expect(
        (await http.get(`/api/projects/${p}`).expect(200)).body.status,
      ).toBe('OPEN');
    });

    it('two different proposals accepted in the same second: exactly one wins', async () => {
      await http
        .post('/api/wallet/deposit')
        .set(auth('omar'))
        .send({ amount: 1000 })
        .expect(200);
      const p = await newProject('omar');
      const a = (await bid('layla', p, 300).expect(201)).body.id;
      const b = (await bid('khaled', p, 400).expect(201)).body.id;
      const before = await wallet('omar');
      const [r1, r2] = await Promise.all([
        http.post(`/api/proposals/${a}/accept`).set(auth('omar')),
        http.post(`/api/proposals/${b}/accept`).set(auth('omar')),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const after = await wallet('omar');
      const held = after.held - before.held;
      expect([300, 400]).toContain(held); // charged once
      expect(after.balance).toBeCloseTo(before.balance - held, 2);
    });

    it('milestones below the contract amount: the leftover returns to the client on completion', async () => {
      const p = await newProject('omar');
      const b = (await bid('layla', p, 200).expect(201)).body.id;
      const c = (
        await http
          .post(`/api/proposals/${b}/accept`)
          .set(auth('omar'))
          .expect(200)
      ).body.contractId;
      const m = (
        await http
          .post(`/api/contracts/${c}/milestones`)
          .set(auth('omar'))
          .send({ title: 'all', amount: 120.5 })
          .expect(201)
      ).body.id;
      const before = await wallet('omar');
      await http
        .post(`/api/milestones/${m}/submissions`)
        .set(auth('layla'))
        .field({ note: 'done' })
        .attach('files', PDF, pdf)
        .expect(201);
      const r = await http
        .post(`/api/milestones/${m}/approve`)
        .set(auth('omar'))
        .expect(200);
      expect(r.body.contractStatus).toBe('COMPLETED');
      expect(n(r.body.refunded)).toBe(79.5);
      expect(n(r.body.payout)).toBe(108.45);
      expect(n(r.body.commission)).toBe(12.05);
      const after = await wallet('omar');
      expect(after.held).toBeCloseTo(before.held - 200, 2);
      expect(after.balance).toBeCloseTo(before.balance + 79.5, 2);
      const refund = await http
        .get('/api/wallet/transactions?type=REFUND')
        .set(auth('omar'))
        .expect(200);
      expect(n(refund.body.data[0].amount)).toBe(79.5);
    });
  });

  // ───────────────────────── projects lifecycle ─────────────────────────
  describe('projects: edit, cancel, soft delete, limits', () => {
    it('cancel rejects pending proposals and notifies the bidders', async () => {
      const p = await newProject('omar');
      await bid('khaled', p, 150).expect(201);
      await http
        .post(`/api/projects/${p}/cancel`)
        .set(auth('sara'))
        .expect(403);
      await http
        .post(`/api/projects/${p}/cancel`)
        .set(auth('omar'))
        .expect(200);
      const mine = await http
        .get('/api/proposals/mine')
        .set(auth('khaled'))
        .expect(200);
      expect(mine.body.data.find((x: any) => x.projectId === p).status).toBe(
        'REJECTED',
      );
      await bid('layla', p, 100).expect(409); // not open any more
    });

    it('soft delete: gone from the platform, still in the database', async () => {
      const p = await newProject('omar');
      await http.delete(`/api/projects/${p}`).set(auth('sara')).expect(403);
      await http.delete(`/api/projects/${p}`).set(auth('omar')).expect(204);
      await http.get(`/api/projects/${p}`).expect(404);
      const list = await http
        .get(`/api/projects?status=CANCELLED&categoryId=${cat.code}&limit=100`)
        .expect(200);
      expect(list.body.data.map((x: any) => x.id)).not.toContain(p);
      const prisma = app.get(PrismaService);
      const row = await prisma.project.findUnique({ where: { id: p } });
      expect(row?.deletedAt).toBeInstanceOf(Date);
      expect(row?.status).toBe('CANCELLED');
    });

    it('a category with projects cannot be deleted', async () => {
      await http
        .delete(`/api/categories/${cat.code}`)
        .set(auth('admin'))
        .expect(409);
    });

    it('max N proposals per freelancer per day', async () => {
      process.env.PROPOSALS_PER_DAY = '2';
      try {
        await register('busy', 'FREELANCER');
        const [p1, p2, p3] = [
          await newProject('omar'),
          await newProject('omar'),
          await newProject('omar'),
        ];
        await bid('busy', p1, 10).expect(201);
        await bid('busy', p2, 10).expect(201);
        const third = await bid('busy', p3, 10).expect(429);
        expect(third.body.message).toMatch(/at most 2 proposals/);
      } finally {
        delete process.env.PROPOSALS_PER_DAY;
      }
    });
  });

  // ───────────────────────── notifications ─────────────────────────
  describe('notifications', () => {
    it('mark one / all as read; other people’s notifications are invisible', async () => {
      const list = await http
        .get('/api/notifications')
        .set(auth('sara'))
        .expect(200);
      const id = list.body.data[0].id;
      await http
        .patch(`/api/notifications/${id}/read`)
        .set(auth('omar'))
        .expect(404);
      await http
        .patch(`/api/notifications/${id}/read`)
        .set(auth('sara'))
        .expect(200);
      await http
        .patch('/api/notifications/read-all')
        .set(auth('sara'))
        .expect(200);
      expect(
        (
          await http
            .get('/api/notifications/unread-count')
            .set(auth('sara'))
            .expect(200)
        ).body.count,
      ).toBe(0);
    });
  });

  // ───────────────────────── the midnight job ─────────────────────────
  describe('midnight job', () => {
    it('is registered as a daily 00:00 schedule', async () => {
      const q = app.get<Queue>(getQueueToken(MAINTENANCE_QUEUE));
      const schedulers = await q.getJobSchedulers();
      expect(schedulers.find((s) => s.key === 'expire-projects')).toMatchObject(
        { pattern: '0 0 * * *' },
      );
    });

    it('cancels open projects whose deadline passed and notifies client + bidders', async () => {
      const p = await newProject('omar', {
        deadline: new Date(Date.now() + 1500).toISOString(),
      });
      await bid('khaled', p, 120).expect(201);
      await sleep(1700);
      await bid('layla', p, 100).expect(409); // deadline passed: no more proposals
      await http
        .post('/api/admin/jobs/expire-projects')
        .set(auth('sara'))
        .expect(403);
      await http
        .post('/api/admin/jobs/expire-projects')
        .set(auth('admin'))
        .expect(202);

      let status = 'OPEN';
      for (let i = 0; i < 30 && status === 'OPEN'; i++) {
        await sleep(300);
        status = (await http.get(`/api/projects/${p}`).expect(200)).body.status;
      }
      expect(status).toBe('CANCELLED');
      const k = await http
        .get('/api/notifications')
        .set(auth('khaled'))
        .expect(200);
      expect(k.body.data[0]).toMatchObject({ type: 'PROJECT_EXPIRED' });
      const o = await http
        .get('/api/notifications')
        .set(auth('omar'))
        .expect(200);
      expect(o.body.data.map((x: any) => x.type)).toContain('PROJECT_EXPIRED');
    });
  });

  // ───────────────────────── admin: bans ─────────────────────────
  describe('admin: search and bans', () => {
    it('a banned user stops IMMEDIATELY, even mid-session, and can be restored', async () => {
      await http.get('/api/users/me').set(auth('layla')).expect(200);
      const found = await http
        .get(`/api/admin/users?search=${email('layla')}`)
        .set(auth('admin'))
        .expect(200);
      expect(found.body.data[0].id).toBe(ids.layla);
      await http
        .post(`/api/admin/users/${ids.layla}/ban`)
        .set(auth('admin'))
        .expect(201);
      await http.get('/api/users/me').set(auth('layla')).expect(401);
      await http
        .post('/api/auth/refresh')
        .send({ refreshToken: refresh.layla })
        .expect(401);
      await http
        .post('/api/auth/login')
        .send({ email: email('layla'), password: 'Passw0rd!' })
        .expect(403);
      await http.get(`/api/freelancers/${ids.layla}`).expect(404);
      await http
        .post(`/api/admin/users/${ids.layla}/unban`)
        .set(auth('admin'))
        .expect(201);
      await http
        .post('/api/auth/login')
        .send({ email: email('layla'), password: 'Passw0rd!' })
        .expect(200);
    });
  });
});
