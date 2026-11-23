// Applies the migrations to the TEST database before the e2e tests run.
// Uses TEST_DATABASE_URL from .env, never the development database.
require('dotenv').config();
const { execSync } = require('child_process');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL is not set in .env');
  process.exit(1);
}
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
