import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve('.env');
const content = [
  'HOST=127.0.0.1',
  'PORT=3000',
  'PUBLIC_BASE_URL=http://127.0.0.1:3000',
  `DASHBOARD_TOKEN=${randomBytes(32).toString('base64url')}`,
  `CREDENTIAL_KEY=${randomBytes(32).toString('base64')}`,
  `WEBHOOK_TOKEN=${randomBytes(32).toString('base64url')}`,
  'DATABASE_PATH=./data/mailer.db',
  '',
].join('\n');
writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
console.log('Created .env with random local credentials. Read DASHBOARD_TOKEN from that file to sign in.');
