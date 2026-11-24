import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { createWorker } from '../server/queue.js';

function fixture(t, send) {
  const db = openDatabase(':memory:');
  const now = new Date().toISOString();
  db.prepare("INSERT INTO smtp_settings (id, host, port, secure, username, password_encrypted, from_name, from_email, reply_to, rate_per_minute, updated_at) VALUES (1, 'smtp.test', 587, 0, 'user', 'unused', 'Sender', 'sender@example.com', '', 60, ?)").run(now);
  const worker = createWorker({ db, mailer: { send }, logger: { error() {} } });
  t.after(async () => {
    await worker.stop();
    db.close();
  });
  return { db, worker };
}

function addDelivery(db, { email = 'alex@example.com', status = 'queued', scheduledFor = null, suppressed = 0 } = {}) {
  const now = new Date().toISOString();
  const recipient = db.prepare('INSERT INTO recipients (email, consent_confirmed, suppressed, created_at, updated_at) VALUES (?, 1, ?, ?, ?)').run(email, suppressed, now, now);
  const campaign = db.prepare('INSERT INTO campaigns (name, subject, html, status, scheduled_for, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('Test', 'Subject', '<p>Hello</p>', status, scheduledFor, now, now);
  const delivery = db.prepare('INSERT INTO deliveries (campaign_id, recipient_id) VALUES (?, ?)').run(campaign.lastInsertRowid, recipient.lastInsertRowid);
  return { campaignId: campaign.lastInsertRowid, deliveryId: delivery.lastInsertRowid };
}

test('worker sends a due recipient and completes the campaign', async (t) => {
  const calls = [];
  const { db, worker } = fixture(t, async (message) => {
    calls.push(message);
    return { messageId: 'provider-message-id' };
  });
  const ids = addDelivery(db);
  worker.start();
  await worker.kick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].recipient.email, 'alex@example.com');
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(ids.deliveryId);
  assert.equal(delivery.status, 'sent');
  assert.equal(delivery.provider_message_id, 'provider-message-id');
  assert.equal(db.prepare('SELECT status FROM campaigns WHERE id = ?').get(ids.campaignId).status, 'completed');
});

test('worker leaves future campaigns scheduled', async (t) => {
  let calls = 0;
  const { db, worker } = fixture(t, async () => { calls += 1; });
  const ids = addDelivery(db, { status: 'scheduled', scheduledFor: new Date(Date.now() + 3600000).toISOString() });
  worker.start();
  await worker.kick();
  assert.equal(calls, 0);
  assert.equal(db.prepare('SELECT status FROM campaigns WHERE id = ?').get(ids.campaignId).status, 'scheduled');
});

test('worker retries temporary SMTP failures with backoff', async (t) => {
  const { db, worker } = fixture(t, async () => {
    const error = new Error('Temporary provider failure');
    error.responseCode = 450;
    throw error;
  });
  const ids = addDelivery(db);
  worker.start();
  await worker.kick();
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(ids.deliveryId);
  assert.equal(delivery.status, 'queued');
  assert.equal(delivery.attempts, 1);
  assert.ok(delivery.next_attempt_at);
});

test('worker does not retry permanent SMTP failures', async (t) => {
  const { db, worker } = fixture(t, async () => {
    const error = new Error('Mailbox unavailable');
    error.responseCode = 550;
    throw error;
  });
  const ids = addDelivery(db);
  worker.start();
  await worker.kick();
  assert.equal(db.prepare('SELECT status FROM deliveries WHERE id = ?').get(ids.deliveryId).status, 'failed');
  assert.equal(db.prepare('SELECT status FROM campaigns WHERE id = ?').get(ids.campaignId).status, 'completed');
});

test('worker removes newly suppressed recipients from the queue', async (t) => {
  let calls = 0;
  const { db, worker } = fixture(t, async () => { calls += 1; });
  const ids = addDelivery(db, { suppressed: 1 });
  worker.start();
  await worker.kick();
  assert.equal(calls, 0);
  assert.equal(db.prepare('SELECT status FROM deliveries WHERE id = ?').get(ids.deliveryId).status, 'suppressed');
  assert.equal(db.prepare('SELECT status FROM campaigns WHERE id = ?').get(ids.campaignId).status, 'completed');
});

test('worker applies the configured rate between messages', async (t) => {
  let calls = 0;
  const { db, worker } = fixture(t, async () => {
    calls += 1;
    return { messageId: String(calls) };
  });
  addDelivery(db, { email: 'one@example.com' });
  addDelivery(db, { email: 'two@example.com' });
  worker.start();
  await worker.kick();
  await worker.kick();
  assert.equal(calls, 1);
});
