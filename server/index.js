import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createMailer } from './mailer.js';
import { createWorker } from './queue.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const mailer = createMailer({ db, config });
const worker = createWorker({ db, mailer });
const app = await createApp({ db, config, mailer, worker });

await app.listen({ host: config.host, port: config.port });
worker.start();

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await worker.stop();
  await app.close();
  db.close();
}

process.on('SIGINT', async () => {
  await close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await close();
  process.exit(0);
});
