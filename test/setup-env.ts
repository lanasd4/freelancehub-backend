// Runs before every e2e test file: point the app at the TEST database and a
// separate Redis database, and relax limits that the tests would otherwise hit.
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/1';
process.env.PROJECTS_LIST_CACHE_SECONDS = '0';
process.env.DASHBOARD_CACHE_SECONDS = '0';
process.env.THROTTLE_LIMIT ??= '100000';
// the per-route limits get their own test file (rate-limits.e2e-spec.ts)
process.env.REGISTER_LIMIT_PER_HOUR ??= '1000';
process.env.LOGIN_LIMIT_PER_MINUTE ??= '1000';
