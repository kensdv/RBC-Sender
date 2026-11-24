import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';
import { createMailer } from '../server/mailer.js';
import { deriveSecret, unsubscribeToken } from '../server/crypto.js';

process.env.NODE_ENV = 'test';
const token = 'dashboard-token-with-at-least-24-characters';
const authorization = { authorization: `Bearer ${token}` };

async function fixture(t) {
  const credentialKey = randomBytes(32);
  const config = {
    dashboardToken: token,
    credentialKey,
    unsubscribeSecret: deriveSecret(credentialKey, 'unsubscribe-tokens'),
    webhookToken: 'webhook-token-with-at-least-24-characters',
    publicBaseUrl: 'https://mailer.test',
  };
  const db = openDatabase(':memory:');
  const mailer = createMailer({ db, config });
  const app = await createApp({ db, config, mailer, worker: { kick() {} } });
  t.after(async () => {
    await app.close();
    db.close();
  });
  return { app, db, config };
}

async function importRecipient(app) {
  return app.inject({
    method: 'POST',
    url: '/api/recipients/import',
    headers: authorization,
    payload: { csv: 'email,first_name,last_name,company\nalex@example.com,Alex,Morgan,Example Ltd', consentConfirmed: true },
  });
}

async function configureSmtp(app) {
  return app.inject({
    method: 'PUT',
    url: '/api/smtp',
    headers: authorization,
    payload: { host: 'smtp.example.com', port: 587, secure: false, username: 'smtp-user', password: 'smtp-password', fromName: 'Support', fromEmail: 'support@example.com', replyTo: '', ratePerMinute: 30 },
  });
}

async function createCampaign(app) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: authorization,
    payload: { name: 'Update', subject: 'Hello [Firstname]', html: '<p>Hello [Firstname]</p>', text: '' },
  });
  return response.json().id;
}

test('protects dashboard APIs with bearer authentication', async (t) => {
  const { app } = await fixture(t);
  const response = await app.inject({ method: 'GET', url: '/api/state' });
  assert.equal(response.statusCode, 401);
  const authorized = await app.inject({ method: 'GET', url: '/api/state', headers: authorization });
  assert.equal(authorized.statusCode, 200);
});

test('requires consent and stores SMTP passwords without exposing them', async (t) => {
  const { app } = await fixture(t);
  const denied = await app.inject({ method: 'POST', url: '/api/recipients/import', headers: authorization, payload: { csv: 'email\nalex@example.com', consentConfirmed: false } });
  assert.equal(denied.statusCode, 400);
  assert.equal((await importRecipient(app)).statusCode, 200);
  assert.equal((await configureSmtp(app)).statusCode, 200);
  const state = await app.inject({ method: 'GET', url: '/api/state', headers: authorization });
  assert.equal(state.json().confirmed, 1);
  assert.equal(state.json().smtp.configured, true);
  assert.equal(state.body.includes('smtp-password'), false);
});

test('creates previews, queues confirmed recipients, and exports delivery logs', async (t) => {
  const { app } = await fixture(t);
  await importRecipient(app);
  await configureSmtp(app);
  const id = await createCampaign(app);
  const preview = await app.inject({ method: 'POST', url: '/api/preview', headers: authorization, payload: { subject: 'Hello [Firstname]', html: '<p>Hello [Firstname]</p>', text: '' } });
  assert.equal(preview.statusCode, 200);
  assert.match(preview.json().subject, /Alex/);
  assert.match(preview.json().html, /Unsubscribe/);
  const queued = await app.inject({ method: 'POST', url: `/api/campaigns/${id}/queue`, headers: authorization, payload: {} });
  assert.equal(queued.statusCode, 200);
  assert.equal(queued.json().queued, 1);
  const exported = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/export`, headers: authorization });
  assert.equal(exported.statusCode, 200);
  assert.match(exported.body, /alex@example.com/);
  assert.match(exported.body, /queued/);
});

test('GET shows unsubscribe confirmation and POST suppresses the recipient', async (t) => {
  const { app, config } = await fixture(t);
  await importRecipient(app);
  const address = 'alex@example.com';
  const tokenValue = unsubscribeToken(address, config.unsubscribeSecret);
  const url = `/api/unsubscribe?email=${encodeURIComponent(address)}&token=${encodeURIComponent(tokenValue)}`;
  const get = await app.inject({ method: 'GET', url });
  assert.equal(get.statusCode, 200);
  let state = await app.inject({ method: 'GET', url: '/api/state', headers: authorization });
  assert.equal(state.json().recipients[0].suppressed, false);
  const post = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'List-Unsubscribe=One-Click' });
  assert.equal(post.statusCode, 200);
  state = await app.inject({ method: 'GET', url: '/api/state', headers: authorization });
  assert.equal(state.json().recipients[0].suppressed, true);
  assert.equal(state.json().bounces[0].kind, 'unsubscribe');
});

test('duplicates any campaign as a reusable draft', async (t) => {
  const { app } = await fixture(t);
  const id = await createCampaign(app);
  const duplicated = await app.inject({ method: 'POST', url: `/api/campaigns/${id}/duplicate`, headers: authorization });
  assert.equal(duplicated.statusCode, 200);
  assert.notEqual(duplicated.json().id, id);
  const state = await app.inject({ method: 'GET', url: '/api/state', headers: authorization });
  const copy = state.json().campaigns.find((campaign) => campaign.id === duplicated.json().id);
  assert.equal(copy.status, 'draft');
  assert.equal(copy.name, 'Update copy');
});

test('validates bounce webhook authentication and suppresses complaints', async (t) => {
  const { app } = await fixture(t);
  await importRecipient(app);
  const denied = await app.inject({ method: 'POST', url: '/api/webhooks/bounce', payload: { email: 'alex@example.com', kind: 'complaint' } });
  assert.equal(denied.statusCode, 401);
  const accepted = await app.inject({ method: 'POST', url: '/api/webhooks/bounce', headers: { 'x-webhook-token': 'webhook-token-with-at-least-24-characters' }, payload: { email: 'alex@example.com', kind: 'complaint', reason: 'Recipient complaint' } });
  assert.equal(accepted.statusCode, 200);
  const state = await app.inject({ method: 'GET', url: '/api/state', headers: authorization });
  assert.equal(state.json().recipients[0].suppressed, true);
  assert.equal(state.json().bounces[0].kind, 'complaint');
});
