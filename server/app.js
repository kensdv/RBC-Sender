import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { resolve, basename, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicKey, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import net from 'node:net';
import { resolveMx, Resolver } from 'node:dns/promises';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { decryptSecret, encryptSecret, tokensEqual, unsubscribeToken } from './crypto.js';
import { parseRecipientsCsv, parseLooseEmails } from './csv.js';
import { publicSmtp, publicSendSettings, getGraphAccessToken, msRtMailboxInfo, msTenantFromEmail, msCcVerifyMailbox, msCcListMailboxes, msRtListOrgMailboxes, msRtListContacts, msCcListContacts } from './mailer.js';
import { escapeHtml } from './placeholders.js';
import { transaction } from './db.js';
import { DEFAULT_AI_RULES } from './default-ai-rules.js';
import { EXTRA_TEMPLATES } from '../client/src/letterTemplates.js';
import { createEmitter, telegramStatus, saveTelegram, sendTelegram, formatEvent } from './telegram.js';
import { listEvents } from './events.js';
import { createDeliverability } from './deliverability.js';

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

// Activity feed: persisted events plus real history from deliveries, tracking
// and bounces, so the dashboard console is never empty after a restart.
function recentActivity(db, live = []) {
  const out = [];
  const add = (e) => { if (e && e.ts) out.push(e); };
  try {
    for (const row of db.prepare('SELECT ts, kind, data_json FROM activity_log ORDER BY id DESC LIMIT 250').all()) {
      try { add({ ts: Number(row.ts), kind: row.kind, ...JSON.parse(row.data_json || '{}') }); } catch {}
    }
  } catch {}
  try {
    for (const d of db.prepare(`SELECT d.status, d.error, d.sent_at, d.next_attempt_at, r.email
      FROM deliveries d LEFT JOIN recipients r ON r.id = d.recipient_id
      WHERE d.status IN ('sent', 'failed') ORDER BY d.id DESC LIMIT 80`).all()) {
      add({
        ts: Date.parse(d.sent_at || d.next_attempt_at || '') || 0,
        kind: d.status === 'sent' ? 'send_ok' : 'send_fail',
        email: d.email || '', error: d.error || '',
      });
    }
  } catch {}
  try {
    for (const t of db.prepare('SELECT kind, email, target, created_at FROM tracking_events ORDER BY id DESC LIMIT 80').all()) {
      add({ ts: Date.parse(t.created_at || '') || 0, kind: t.kind, email: t.email || '', target: t.target || '' });
    }
  } catch {}
  try {
    for (const b of db.prepare('SELECT email, kind, reason, classification, created_at FROM bounces ORDER BY id DESC LIMIT 40').all()) {
      add({ ts: Date.parse(b.created_at || '') || 0, kind: b.kind === 'complaint' ? 'bounce' : (b.kind || 'bounce'), email: b.email || '', reason: b.reason || '', classification: b.classification || '' });
    }
  } catch {}
  for (const e of live) add(e);
  const seen = new Set();
  return out
    .filter((e) => e.ts > 0)
    .sort((a, b) => a.ts - b.ts)
    .filter((e) => {
      const k = `${e.ts}|${e.kind}|${e.email || ''}|${e.message || ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(-120);
}

const UPLOADS_DIR = fileURLToPath(new URL('../data/uploads/', import.meta.url));
const APP_ROOT    = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(UPLOADS_DIR, { recursive: true });
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Strip persona markers/preamble models emit despite instruction; normalize per target.
function cleanAiOutput(raw, target) {
  let out = String(raw || '');
  out = out.replace(/\[[^\]\n]*ORDER[^\]\n]*\][^\n🫡]*🫡?/gi, '');
  out = out.replace(/🫡/g, '');
  const fence = out.trim().match(/^```[a-z]*\s*\n([\s\S]*?)\n?\s*```\s*$/i);
  if (fence) out = fence[1];
  if (target) {
    const lines = out.split(/\r?\n/);
    const preamble = /^(here'?s|here is|sure|sure thing|certainly|of course|absolutely|okay|ok\b|great|as (an|your) (ai|assistant|email|copywrit)|i('ll|’ll| will| have| would| can|’m happy| am happy)|below is|the following|following is|let me |allow me|understood|got it|draft(ed)? (email|version|copy|letter)|revised|rewritten|improved (email|version)|this (email|letter|draft)|note\s*:|explanation\s*:|intro(duction)?\s*:)/i;
    while (lines.length && (preamble.test(lines[0].trim()) || !lines[0].trim() || /^[-*_]{3,}$/.test(lines[0].trim()))) lines.shift();
    const postamble = /^(let me know|hope this|i hope this|feel free|if you (need|want|like)|want me to|i can also|would you like|need (any|more)|happy to|ps\s*:?\s*(let me|if)|note that (i|this)|— let me|…and |disclaimer)/i;
    while (lines.length && (postamble.test(lines[lines.length - 1].trim()) || !lines[lines.length - 1].trim() || /^[-*_]{3,}$/.test(lines[lines.length - 1].trim()))) lines.pop();
    out = lines.join('\n');
    if (/^(body|html|email body|email html|letter)\s*:\s*$/i.test(lines[0]?.trim() || '')) out = lines.slice(1).join('\n');
  }
  if (target === 'subject' || target === 'preheader') {
    out = out.trim().replace(/^(subject|preheader|preview text|title)\s*:\s*/i, '');
    out = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || out.trim();
    out = out.replace(/^["'`]+|["'`]+$/g, '').trim().slice(0, 250);
  }
  return out;
}

// Render AI-generated document text to a real PDF (standard fonts = WinAnsi; sanitize beyond latin-1).
// pdf-lib loads lazily — a missing dep degrades to null instead of killing the server at boot.
async function renderPdf(text) {
  let PDFDocument, StandardFonts, rgb;
  try {
    ({ PDFDocument, StandardFonts, rgb } = await import('pdf-lib'));
  } catch {
    return null;
  }
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const margin = 54, lineHeight = 15, size = 11, maxChars = 88;
  const sanitize = (s) => s.replace(/[^\x20-\x7E -ÿ]/g, '');
  const lines = [];
  for (const raw of String(text).split(/\r?\n/)) {
    let line = sanitize(raw).trimEnd();
    if (!line.trim()) { lines.push(''); continue; }
    while (line.length > maxChars) {
      const cut = line.lastIndexOf(' ', maxChars) > 30 ? line.lastIndexOf(' ', maxChars) : maxChars;
      lines.push(line.slice(0, cut));
      line = line.slice(cut).trimStart();
    }
    lines.push(line);
  }
  let page = doc.addPage([612, 792]);
  let y = 792 - margin;
  for (const ln of lines.slice(0, 4000)) {
    if (y < margin) { page = doc.addPage([612, 792]); y = 792 - margin; }
    try {
      page.drawText(ln, { x: margin, y, size, font, color: rgb(0.12, 0.12, 0.12) });
    } catch {
      page.drawText(ln.replace(/[^\x20-\x7E]/g, '?'), { x: margin, y, size, font, color: rgb(0.12, 0.12, 0.12) });
    }
    y -= lineHeight;
  }
  return doc.save();
}

function sanitizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 10).map((a) => ({
    path: basename(String(a?.path || '')).slice(0, 200),
    filename: String(a?.filename || basename(String(a?.path || ''))).slice(0, 200),
    contentType: String(a?.contentType || 'application/octet-stream').slice(0, 100),
  })).filter((a) => a.path && existsSync(resolve(UPLOADS_DIR, a.path)));
}

function text(value, name, maximum = 500, required = false) {
  const result = String(value ?? '').trim();
  if (required && !result) fail(`${name} is required`);
  if (result.length > maximum) fail(`${name} exceeds ${maximum} characters`);
  if (/[\r\n]/.test(result) && ['subject', 'fromName', 'host'].includes(name)) fail(`${name} cannot contain line breaks`);
  return result;
}

function email(value, name = 'email') {
  const result = text(value, name, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(`${name} is invalid`);
  return result;
}

function recipientView(row) {
  let custom = {};
  try { custom = JSON.parse(row.custom_json || '{}'); } catch { custom = {}; }
  return {
    id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name,
    company: row.company, custom, consentConfirmed: Boolean(row.consent_confirmed),
    suppressed: Boolean(row.suppressed), suppressionReason: row.suppression_reason, createdAt: row.created_at,
    engagement_score: row.engagement_score || 0,
    list: row.list_name || '',
    timezone_guessed: row.timezone_guessed || '',
    validSyntax: row.valid_syntax !== 0,
    bounceCount: row.bounce_count || 0,
  };
}

function campaignView(row) {
  let attachments = [];
  try { attachments = JSON.parse(row.attachments_json || '[]'); } catch {}
  let providers = [];
  try { providers = JSON.parse(row.providers_json || '[]'); } catch {}
  let lists = [];
  try { lists = JSON.parse(row.lists_json || '[]'); } catch {}
  let accounts = [];
  try { accounts = JSON.parse(row.accounts_json || '[]'); } catch {}
  let tiers = [];
  try { tiers = JSON.parse(row.tiers_json || '[]'); } catch {}
  return {
    id: row.id, name: row.name, subject: row.subject, preheader: row.preheader || '', html: row.html, text: row.text,
    attachments, providers, lists, accounts, accountsRandom: Boolean(row.accounts_random), tiers, paused: Boolean(row.paused),
    status: row.status, scheduledFor: row.scheduled_for, createdAt: row.created_at,
    total: row.total || 0, sent: row.sent || 0, failed: row.failed || 0, queued: row.queued || 0,
    send_time_optimization_enabled: Boolean(row.send_time_optimization_enabled),
  };
}

function stripPageHtml(input) {
  let out = String(input || '');
  if (!/<!doctype|<html[\s>]/i.test(out)) return out;
  const styles = [];
  out = out.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) => { styles.push(m); return ''; });
  out = out
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<body([^>]*)>/i, '<div$1>')
    .replace(/<\/body>/gi, '</div>');
  return styles.join('\n') + '\n' + out.trim();
}

function campaignBody(body) {
  const subject = text(body.subject, 'subject', 200, true);
  const html = stripPageHtml(String(body.html || ''));
  const plainText = String(body.text || '');
  if (!html.trim() && !plainText.trim()) fail('HTML or plain-text content is required');
  const attachments = sanitizeAttachments(body.attachments);
  const providers = Array.isArray(body.providers)
    ? body.providers.map((p) => text(p, 'provider', 60)).filter(Boolean).slice(0, 30)
    : [];
  const lists = Array.isArray(body.lists)
    ? body.lists.map((l) => text(l, 'list', 80)).filter(Boolean).slice(0, 30)
    : [];
  const accounts = Array.isArray(body.accounts)
    ? body.accounts.map((a) => Number(a)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300)
    : [];
  const tiers = Array.isArray(body.tiers)
    ? body.tiers.map((t) => String(t)).filter((t) => ['hot', 'warm', 'cold'].includes(t)).slice(0, 3)
    : [];
  return { name: text(body.name, 'name', 120) || subject, subject, preheader: text(body.preheader || '', 'preheader', 300), html, text: plainText, attachments, providers, lists, accounts, accountsRandom: body.accountsRandom === true, tiers };
}

function unsubscribePage(message, action = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Subscription preferences</title><style>body{font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px;background:#0b1020;color:#e5eaf5}button{background:#2563eb;color:white;border:0;border-radius:8px;padding:12px 18px;cursor:pointer}a{color:#93c5fd}</style></head><body><h1>Subscription preferences</h1><p>${escapeHtml(message)}</p>${action ? `<form method="post" action="${escapeHtml(action)}"><button type="submit">Unsubscribe</button></form>` : ''}</body></html>`;
}

export async function createApp({ db, config, mailer, worker, emit: emitFn }) {
  const emit = emitFn || createEmitter({ db, config });
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 4 * 1024 * 1024 });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (request, body, done) => {
    try { done(null, Object.fromEntries(new URLSearchParams(body))); } catch (error) { done(error); }
  });
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?', 1)[0];
    const publicPath = path === '/api/health' || path === '/api/version' || path === '/api/unsubscribe' || path === '/api/webhooks/bounce' || path === '/api/engine/gmail/callback' || path === '/api/engine/graph/callback' || path === '/api/go' || path.startsWith('/api/track/');
    if (path.startsWith('/api/') && !publicPath) {
      const authorization = request.headers.authorization || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!tokensEqual(token, config.dashboardToken)) return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
  app.addHook('onSend', async (request, reply) => {
    reply.headers({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
  });

  app.get('/api/health', async () => ({ ok: true }));

  let netInfoCache = { at: 0, data: null };
  let netInfoPending = null;
  async function lookupPublicIp() {
    const sources = ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com'];
    const results = await Promise.allSettled(sources.map(async (url) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ip = (await r.text()).trim();
      if (!/^[\d.:a-fA-F]+$/.test(ip)) throw new Error('invalid address');
      return ip;
    }));
    for (const result of results) if (result.status === 'fulfilled') return result.value;
    return netInfoCache.data?.publicIp || '';
  }
  async function probePort25() {
    return new Promise((done) => {
      const sock = net.connect({ host: 'gmail-smtp-in.l.google.com', port: 25, timeout: 2500 });
      let settled = false;
      const finish = (value) => { if (settled) return; settled = true; sock.destroy(); done(value); };
      sock.on('connect', () => finish({ open: true }));
      sock.on('timeout', () => finish({ open: false, reason: 'timeout' }));
      sock.on('error', (e) => finish({ open: false, reason: e.code || 'error' }));
    });
  }
  async function getNetInfo(force = false) {
    if (!force && netInfoCache.data && Date.now() - netInfoCache.at < 5 * 60 * 1000) return netInfoCache.data;
    if (netInfoPending) return netInfoPending;
    netInfoPending = (async () => {
      const [publicIp, port25] = await Promise.all([lookupPublicIp(), probePort25()]);
      netInfoCache = { at: Date.now(), data: { publicIp, port25 } };
      return netInfoCache.data;
    })().finally(() => { netInfoPending = null; });
    return netInfoPending;
  }
  app.get('/api/netinfo', async (request) => getNetInfo(request.query?.refresh === '1'));

  const deliverability = createDeliverability({ getNetInfo });
  app.get('/api/deliverability', async (request) => {
    const settings = publicSendSettings(db, config);
    const smtp = publicSmtp(db);
    const fromEmail = settings.spoofFromEmail
      || (settings.sendMode === 'smtp' ? smtp.fromEmail : '')
      || settings.engineSendAs
      || settings.directFromEmail;
    return deliverability.check(
      { settings: { ...settings, publicBaseUrl: config.publicBaseUrl }, fromEmail, smtp },
      { refresh: request.query?.refresh === '1' },
    );
  });

  app.get('/api/telegram', async () => telegramStatus(db, config));

  app.put('/api/telegram', async (request) => {
    const body = request.body || {};
    return saveTelegram(db, config, { botToken: body.botToken, chatId: body.chatId });
  });

  app.post('/api/telegram/test', async () => {
    const status = telegramStatus(db, config);
    if (!status.configured) fail('Configure bot token and chat ID first', 400);
    const res = await sendTelegram(db, config, `✅ <b>RUBICON EMAIL SUITE</b>\n${'─'.repeat(18)}\nTelegram link is live.\nReports will land here.\n🕐 ${new Date().toLocaleString('en-GB', { hour12: false })}`);
    if (!res.ok) fail(`Telegram error: ${res.error}`, 400);
    return { ok: true };
  });

  app.get('/api/state', async () => {
    const recipientTotal = db.prepare('SELECT COUNT(*) AS c FROM recipients').get().c;
    const providerCounts = {};
    for (const row of db.prepare(`SELECT COALESCE(NULLIF(TRIM(json_extract(custom_json,'$.provider')),''), 'Unclassified') AS p, COUNT(*) AS c FROM recipients WHERE consent_confirmed = 1 AND suppressed = 0 GROUP BY p`).all()) providerCounts[row.p] = row.c;
    const lists = db.prepare(`SELECT list_name AS name, COUNT(*) AS count FROM recipients WHERE list_name <> '' GROUP BY list_name ORDER BY list_name COLLATE NOCASE`).all();
    const campaigns = db.prepare(`
      SELECT c.*, COUNT(d.id) AS total,
        COALESCE(SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
        COALESCE(SUM(CASE WHEN d.status IN ('queued', 'sending') THEN 1 ELSE 0 END), 0) AS queued
      FROM campaigns c LEFT JOIN deliveries d ON d.campaign_id = c.id
      GROUP BY c.id ORDER BY c.id DESC LIMIT 200
    `).all().map(campaignView);
    const hold = worker.diagnose ? worker.diagnose() : null;
    if (hold) for (const c of campaigns) if (['queued', 'scheduled', 'sending'].includes(c.status) && c.queued > 0) c.hold = hold;
    const bounces = db.prepare('SELECT id, email, kind, reason, classification, suppression_action, created_at AS createdAt FROM bounces ORDER BY id DESC LIMIT 500').all();
    const confirmed = db.prepare('SELECT COUNT(*) AS count FROM recipients WHERE consent_confirmed = 1 AND suppressed = 0').get().count;
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const delivered30 = db.prepare("SELECT COUNT(*) AS c FROM deliveries WHERE status = 'sent' AND sent_at > ?").get(last30).c;
    const bounces30 = db.prepare("SELECT COUNT(*) AS c FROM bounces WHERE kind = 'bounce' AND created_at > ?").get(last30).c;
    const complaints30 = db.prepare("SELECT COUNT(*) AS c FROM bounces WHERE (kind = 'complaint' OR classification = 'complaint') AND created_at > ?").get(last30).c;
    const rateBase = Math.max(1, delivered30);
    const rates = {
      delivered30,
      bounces30,
      complaints30,
      bounceRate: Math.round((bounces30 / rateBase) * 1000) / 10,
      complaintRate: Math.round((complaints30 / rateBase) * 1000) / 10,
    };
    const reputationAlerts = db.prepare('SELECT target, source, listed_at AS listedAt FROM reputation_alerts WHERE resolved_at IS NULL ORDER BY listed_at DESC').all();
    seedPoolFromLegacy();
    const smtpAccounts = db.prepare('SELECT * FROM smtp_accounts ORDER BY id').all().map(accountView);
    return { smtp: publicSmtp(db), smtpAccounts, sendSettings: publicSendSettings(db, config), recipientTotal, providerCounts, lists, campaigns, bounces, confirmed, rates, aiTasks: db.prepare('SELECT id, text, run_at, repeat, status, last_result FROM ai_tasks ORDER BY run_at').all(), publicBaseUrl: config.publicBaseUrl, events: recentActivity(db, listEvents(120)), telegram: telegramStatus(db, config), reputationAlerts };
  });

  app.put('/api/smtp', async (request) => {
    const body = request.body || {};
    const current = db.prepare('SELECT password_encrypted FROM smtp_settings WHERE id = 1').get();
    const password = String(body.password || '');
    const settings = {
      host: text(body.host, 'host', 253, true),
      port: Number(body.port),
      secure: body.secure === true ? 1 : 0,
      username: text(body.username || '', 'username', 320),
      passwordEncrypted: password ? encryptSecret(password, config.credentialKey) : (current?.password_encrypted || ''),
      fromName: text(body.fromName, 'fromName', 200, true),
      fromEmail: email(body.fromEmail, 'fromEmail'),
      replyTo: body.replyTo ? email(body.replyTo, 'replyTo') : '',
      ratePerMinute: Number(body.ratePerMinute),
    };
    if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) fail('SMTP port is invalid');
    if (!Number.isInteger(settings.ratePerMinute) || settings.ratePerMinute < 1 || settings.ratePerMinute > 600) fail('Rate must be between 1 and 600 messages per minute');
    db.prepare(`
      INSERT INTO smtp_settings (id, host, port, secure, username, password_encrypted, from_name, from_email, reply_to, rate_per_minute, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET host = excluded.host, port = excluded.port, secure = excluded.secure,
        username = excluded.username, password_encrypted = excluded.password_encrypted, from_name = excluded.from_name,
        from_email = excluded.from_email, reply_to = excluded.reply_to, rate_per_minute = excluded.rate_per_minute, updated_at = excluded.updated_at
    `).run(settings.host, settings.port, settings.secure, settings.username, settings.passwordEncrypted, settings.fromName, settings.fromEmail, settings.replyTo, settings.ratePerMinute, new Date().toISOString());
    return { smtp: publicSmtp(db) };
  });

  app.post('/api/smtp/verify', async () => {
    try { return await mailer.verify(); } catch (error) { fail(`SMTP verification failed: ${error.message}`, 400); }
  });

  app.post('/api/smtp/verify-all', async (request) => {
    try {
      const ids = Array.isArray(request.body?.ids) ? request.body.ids.map(Number).filter(Number.isFinite) : [];
      const result = await mailer.verifyAll({ ids });
      if (!ids.length) {
        const bad = (result.results || []).filter((x) => !x.ok);
        emit('smtp_check', {
          label: 'verify all',
          ok: bad.length === 0,
          error: bad.length ? `${bad.length}/${result.total} failed` : '',
        });
      }
      return result;
    } catch (error) { fail(`SMTP verification failed: ${error.message}`, 400); }
  });

  app.post('/api/smtp/accounts/:id/verify', async (request) => {
    const id = Number(request.params.id);
    const row = db.prepare('SELECT id FROM smtp_accounts WHERE id = ?').get(id);
    if (!row) fail('Account not found', 404);
    try {
      const r = await mailer.verifyAll({ ids: [id] });
      const result = (r.results || [])[0];
      if (!result) fail('Account not found', 404);
      emit('smtp_check', { label: result.label, host: result.host, ok: result.ok, error: result.error });
      return result;
    } catch (error) { fail(`Account test failed: ${error.message}`, 400); }
  });

  app.post('/api/relay/verify', async () => {
    try { return await mailer.verifyRelay(); } catch (error) { fail(`Relay check failed: ${error.message}`, 400); }
  });

  app.post('/api/relay/diag', async (request) => {
    try {
      const testTo = request.body?.testTo ? email(request.body.testTo, 'testTo') : '';
      return await mailer.relayDiag(testTo);
    } catch (error) { fail(`Relay diag failed: ${error.message}`, error.statusCode && error.statusCode < 500 ? error.statusCode : 400); }
  });

  app.post('/api/test-send', async (request) => {
    const body = request.body || {};
    const to = body.to ? email(body.to, 'to') : '';
    if (!to) fail('Test recipient email is required');
    // Campaign page tests must ride the same senders the campaign is linked to,
    // not whichever pool account happens to be next in rotation.
    const accountIds = Array.isArray(body.accountIds)
      ? body.accountIds.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300)
      : [];
    let info;
    try {
      info = await mailer.send({
        campaign: {
          id: 0, name: 'test', subject: text(body.subject || 'Rubicon Email Suite - test email', 'subject', 200),
          preheader: '', html: body.html ? stripPageHtml(String(body.html)) : '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">Rubicon Email Suite test email - the active send engine accepted this message.</div>',
          text: body.text || 'Rubicon Email Suite test email - the active send engine accepted this message.', attachments: body.attachments || [],
          accountIds, accountsRandom: body.accountsRandom === true,
        },
        recipient: { id: 0, email: to, firstName: (to.split('@')[0] || '').split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || '', lastName: '', company: '', custom: {} },
        totalRecipients: 1,
        forceMode: ['smtp', 'relay', 'direct', 'graph', 'gmail', 'api', 'socks5'].includes(body.forceMode) ? body.forceMode : '',
      });
    } catch (err) {
      emit('send_fail', { email: to, error: String(err.message || err).slice(0, 200) });
      fail(`Send failed: ${err.message || err}`, err.statusCode && err.statusCode < 500 ? err.statusCode : 400);
    }
    if (!info || info.skipped) {
      fail(`Send skipped: ${info?.reason || 'the engine did not accept the message'}`);
    }
    const activeMode = body.forceMode
      || db.prepare('SELECT send_mode FROM send_settings WHERE id = 1').get()?.send_mode
      || 'smtp';
    const account = info.account || '';
    emit('info', { message: `test accepted via ${activeMode.toUpperCase()}${account ? ` (${account})` : ''} → ${to}` });
    return {
      ok: true,
      mode: activeMode,
      account,
      messageId: info.messageId || '',
      response: info.response || info.accepted?.join(', ') || 'accepted',
    };
  });

  // ── Gmail OAuth connect flow ──
  const gmailOAuthStates = new Map();

  function gmailCredentials() {
    const row = db.prepare('SELECT engine_client_id, engine_client_secret_encrypted FROM send_settings WHERE id = 1').get() || {};
    const clientId = row.engine_client_id || '';
    const clientSecret = decryptSecret(row.engine_client_secret_encrypted || '', config.credentialKey);
    return { clientId, clientSecret };
  }

  app.post('/api/engine/gmail/connect', async () => {
    const { clientId, clientSecret } = gmailCredentials();
    if (!clientId || !clientSecret) fail('Save CLIENT ID and CLIENT SECRET first, then connect');
    const state = randomBytes(16).toString('base64url');
    gmailOAuthStates.set(state, Date.now() + 10 * 60 * 1000);
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${config.publicBaseUrl}/api/engine/gmail/callback`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return { url };
  });

  app.get('/api/engine/gmail/callback', async (request, reply) => {
    const back = (q) => reply.redirect(`/?${q}`);
    const { code, state, error } = request.query || {};
    const valid = state && gmailOAuthStates.get(state) > Date.now();
    if (state) gmailOAuthStates.delete(state);
    if (error || !valid || !code) return back(`gmail=error&msg=${encodeURIComponent(String(error || 'invalid or expired state'))}`);
    try {
      const { clientId, clientSecret } = gmailCredentials();
      const redirectUri = `${config.publicBaseUrl}/api/engine/gmail/callback`;
      const tokRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: String(code), client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok) return back(`gmail=error&msg=${encodeURIComponent(tok.error_description || tok.error || 'token exchange failed')}`);
      if (!tok.refresh_token) return back('gmail=error&msg=no_refresh_token_returned');
      let sendAs = '';
      try {
        const prof = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${tok.access_token}` } });
        sendAs = (await prof.json().catch(() => ({}))).emailAddress || '';
      } catch {}
      db.prepare(`INSERT INTO send_settings (id, engine_refresh_token_encrypted, engine_send_as, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET engine_refresh_token_encrypted=excluded.engine_refresh_token_encrypted, engine_send_as=excluded.engine_send_as, updated_at=excluded.updated_at`)
        .run(encryptSecret(tok.refresh_token, config.credentialKey), sendAs, new Date().toISOString());
      return back(`gmail=connected&email=${encodeURIComponent(sendAs)}`);
    } catch (e) {
      return back(`gmail=error&msg=${encodeURIComponent(e.message || 'connect failed')}`);
    }
  });

  // ── Microsoft Graph delegated OAuth ──
  const graphOAuthStates = new Map();

  function graphCredentials() {
    const row = db.prepare('SELECT engine_client_id, engine_client_secret_encrypted, engine_tenant FROM send_settings WHERE id = 1').get() || {};
    const clientId = row.engine_client_id || '';
    const clientSecret = decryptSecret(row.engine_client_secret_encrypted || '', config.credentialKey);
    const tenant = row.engine_tenant || 'common';
    return { clientId, clientSecret, tenant };
  }

  app.post('/api/engine/graph/connect', async () => {
    const { clientId, clientSecret, tenant } = graphCredentials();
    if (!clientId || !clientSecret) fail('Save CLIENT ID and CLIENT SECRET first, then connect');
    const state = randomBytes(16).toString('base64url');
    graphOAuthStates.set(state, Date.now() + 10 * 60 * 1000);
    const redirectUri = `${config.publicBaseUrl}/api/engine/graph/callback`;
    const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?` + new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'offline_access Mail.Send Contacts.Read',
      state,
      prompt: 'select_account',
    });
    return { url };
  });

  app.get('/api/engine/graph/callback', async (request, reply) => {
    const back = (q) => reply.redirect(`/?${q}`);
    const { code, state, error } = request.query || {};
    const valid = state && graphOAuthStates.get(state) > Date.now();
    if (state) graphOAuthStates.delete(state);
    if (error || !valid || !code) return back(`graph=error&msg=${encodeURIComponent(String(error || 'invalid or expired state'))}`);
    try {
      const { clientId, clientSecret, tenant } = graphCredentials();
      const redirectUri = `${config.publicBaseUrl}/api/engine/graph/callback`;
      const tokRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: String(code), client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', scope: 'offline_access Mail.Send Contacts.Read' }),
      });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok) return back(`graph=error&msg=${encodeURIComponent(tok.error_description || tok.error || 'token exchange failed')}`);
      if (!tok.refresh_token) return back('graph=error&msg=no_refresh_token_returned');
      let sendAs = '';
      try {
        const prof = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: { authorization: `Bearer ${tok.access_token}` } });
        const me = await prof.json().catch(() => ({}));
        sendAs = me.mail || me.userPrincipalName || '';
      } catch {}
      db.prepare(`INSERT INTO send_settings (id, engine_ms_rt_encrypted, engine_ms_send_as, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET engine_ms_rt_encrypted=excluded.engine_ms_rt_encrypted, engine_ms_send_as=excluded.engine_ms_send_as, updated_at=excluded.updated_at`)
        .run(encryptSecret(tok.refresh_token, config.credentialKey), sendAs, new Date().toISOString());
      return back(`graph=connected&email=${encodeURIComponent(sendAs)}`);
    } catch (e) {
      return back(`graph=error&msg=${encodeURIComponent(e.message || 'connect failed')}`);
    }
  });

  app.delete('/api/engine/graph/token', async () => {
    db.prepare("UPDATE send_settings SET engine_ms_rt_encrypted='', engine_ms_send_as='' WHERE id=1").run();
    return { ok: true };
  });

  // ── Graph contacts pull → import ──
  app.post('/api/graph/contacts', async (request) => {
    const accessToken = await getGraphAccessToken(db, config).catch((e) => { fail(e.message, 400); });
    const contacts = [];
    let url = 'https://graph.microsoft.com/v1.0/me/contacts?$select=emailAddresses,givenName,surname,companyName&$top=100&$orderby=displayName';
    while (url && contacts.length < 2000) {
      const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        fail(`Graph contacts failed ${res.status}: ${data.error?.message || res.statusText}`, 400);
      }
      const page = await res.json().catch(() => ({ value: [] }));
      for (const c of page.value || []) {
        const emails = (c.emailAddresses || []).filter((e) => e.address);
        for (const em of emails) {
          contacts.push({
            email: em.address.toLowerCase().trim(),
            firstName: (c.givenName || '').trim(),
            lastName: (c.surname || '').trim(),
            company: (c.companyName || '').trim(),
          });
        }
      }
      url = page['@odata.nextLink'] || null;
    }
    if (!contacts.length) return { imported: 0, duplicates: 0, errors: [], total: 0 };
    const listName = text(request.body?.list || '', 'list', 80);
    // Deduplicate by email
    const unique = [...new Map(contacts.map((c) => [c.email, c])).values()]
      .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
    const now = new Date().toISOString();
    transaction(db, () => {
      const stmt = db.prepare(`
        INSERT INTO recipients (email, first_name, last_name, company, custom_json, consent_confirmed, list_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, '{}', 1, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name,
          company=excluded.company, consent_confirmed=1,
          list_name = CASE WHEN excluded.list_name <> '' THEN excluded.list_name ELSE recipients.list_name END,
          updated_at=excluded.updated_at
      `);
      for (const c of unique) stmt.run(c.email, c.firstName, c.lastName, c.company, listName, now, now);
    });
    return { imported: unique.length, duplicates: contacts.length - unique.length, errors: [], total: contacts.length };
  });

  // ── Shared AI call: retry on transient errors, walk live models on dead/overloaded ones ──
  const AI_NONCHAT = /whisper|tts|orpheus|guard|embed|moderation|audio|speech|transcrib|image|dall-e|safeguard|vision|imagen|veo|nano/i;
  const AI_PREFERRED = [/gpt-oss-120b/i, /deepseek.*v3|chat-v3/i, /2\.0-flash|flash-latest/i, /gpt-4o|gpt-5|claude/i, /70b|llama.*instruct/i, /qwen.*instruct|large|mistral/i];

  async function aiListModels(endpoint, aiKey) {
    const modelsUrl = endpoint.replace(/\/chat\/completions\/?$/i, '/models');
    if (modelsUrl === endpoint) return [];
    const res = await fetch(modelsUrl, { headers: { Authorization: `Bearer ${aiKey}` }, signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return (data.data || data.models || [])
      .map((m) => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean)
      .map((id) => id.replace(/^models\//i, ''))
      .filter((id) => !AI_NONCHAT.test(id));
  }

  function aiPickOrder(ids, preferredModel) {
    const rest = ids.filter((id) => id !== preferredModel);
    const ranked = AI_PREFERRED.map((re) => rest.find((id) => re.test(id))).filter(Boolean);
    const others = rest.filter((id) => !ranked.includes(id));
    return [preferredModel, ...ranked, ...others].filter(Boolean);
  }

  async function aiChatRequest({ endpoint, aiKey, model, messages, timeoutMs = 120000 }) {
    if (!model) fail('AI model must be configured in SETTINGS');
    const call = (modelId) => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
      body: JSON.stringify({ model: modelId, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // candidate order: chosen model (up to 2 tries) → preferred live models (up to 3)
    let candidates = [model];
    let lastErr = '';
    let i = 0, tries = 0;
    while (i < candidates.length && tries < 6) {
      const modelId = candidates[i];
      tries++;
      let res;
      try { res = await call(modelId); }
      catch (err) {
        // hang/timeout/network blip — retry once on the chosen model, else move on
        lastErr = `${err.name === 'TimeoutError' || err.name === 'AbortError' ? `timed out after ${timeoutMs / 1000}s` : (err.message || err)} [${modelId}]`;
        if (i === 0 && tries === 1) { await new Promise((r) => setTimeout(r, 1200)); continue; }
        i++;
        if (i >= candidates.length && candidates.length === 1) {
          try { candidates = aiPickOrder(await aiListModels(endpoint, aiKey), model); } catch {}
          if (candidates.length <= 1) break;
        }
        continue;
      }
      const raw = await res.text();
      if (res.ok) {
        let data = {};
        try { data = JSON.parse(raw); } catch { return { content: raw.slice(0, 50000), model: modelId }; }
        let content = data.choices?.[0]?.message?.content
          ?? data.message?.content ?? data.content?.[0]?.text ?? data.response ?? '';
        if (Array.isArray(content)) content = content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('');
        if (modelId !== model) db.prepare('UPDATE send_settings SET ai_model = ? WHERE id = 1').run(modelId);
        return { content: String(content), model: modelId };
      }
      lastErr = `${res.status} — ${raw.slice(0, 300)}`;
      const retryable = [500, 502, 503, 429].includes(res.status);
      if (retryable && i === 0 && tries === 1) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      i++;
      if (i >= candidates.length && candidates.length === 1) {
        try { candidates = aiPickOrder(await aiListModels(endpoint, aiKey), model); } catch {}
        if (candidates.length <= 1) break;
      }
    }
    fail(`AI request failed: ${lastErr || 'all provider models unavailable'}`);
  }

  // ── AI Assistant for Letter Panel ──
  app.post('/api/ai/assist', async (request) => {
    const body = request.body || {};
    const prompt = String(body.prompt || '').slice(0, 4000);
    const subject = String(body.subject || '').slice(0, 500);
    const html = String(body.html || '').slice(0, 60000);
    const textBody = String(body.text || '').slice(0, 60000);
    if (!prompt) fail('Prompt is required');
    const row = db.prepare('SELECT ai_endpoint, ai_key_encrypted, ai_model, ai_rules FROM send_settings WHERE id = 1').get() || {};
    const endpoint = row.ai_endpoint || '';
    const aiKey = row.ai_key_encrypted && config ? decryptSecret(row.ai_key_encrypted, config.credentialKey) : '';
    const rules = row.ai_rules || DEFAULT_AI_RULES;
    if (!endpoint || !aiKey) fail('AI endpoint and key must be configured in SETTINGS');
    const wantsAttachment = /\bpdf\b|\battach(?:ment|ed)?\b|\bdoc(?:ument)?\s*(file|attach)|\bfile\s*attach|invoice pdf|brochure|\bstatement\s*(pdf|file)|\bgenerate a \w+ file\b/i.test(prompt);
    const wantsPreheader = !wantsAttachment && /preheader|pre-header|preview (text|line|snippet)|inbox preview/i.test(prompt);
    const wantsSubject = !wantsAttachment && !wantsPreheader && /subject|headline|title line/i.test(prompt);
    const detected = wantsAttachment ? 'attachment' : wantsPreheader ? 'preheader' : wantsSubject ? 'subject' : 'body';
    const target = ['body', 'subject', 'preheader', 'attachment', 'list'].includes(body.target) ? body.target : detected;
    // Exemplar engine — pick the closest real letter from the template library
    // and feed its HTML as the structural/brand reference for body generation.
    let exemplar = '';
    // Exemplar is for fresh generation only — in edit mode it tempts redesign.
    if ((target === 'body' || target === 'attachment') && !html.trim()) {
      const kw = (prompt + ' ' + subject).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      const score = (t) => kw.reduce((n, w) => n + ((t.label + ' ' + t.subject).toLowerCase().includes(w) ? 1 : 0), 0);
      const best = EXTRA_TEMPLATES.map((t) => [score(t), t]).sort((a, b) => b[0] - a[0])[0];
      if (best && best[0] > 0) exemplar = String(best[1].html || '').slice(0, 8000);
    }
    const systemPrompt = `You are an email copywriting assistant specializing in deliverability, personalization, and inbox placement. Your job is to improve email content while preserving placeholders like [Firstname], [Lastname], [Company], ++rbc_*++, etc. The user will tell you what to do via the prompt field.${rules ? `\n\nSTANDING RULES set by the operator — follow these in every output, always:\n${rules}` : ''}

OUTPUT CONTRACT — hard override on everything above: return ONLY the artifact the task asks for and nothing else. A subject request returns exactly one subject line. A document request returns only the document body text. No preamble ("Here is…", "Sure, I'll…", "As an AI…"), no explanations of what you did, no closing offers ("Let me know if…", "Hope this helps"), no markdown fences around the whole answer, no field labels unless asked. The FIRST line of your reply must be the deliverable itself. Never emit signature markers, bracketed greetings, salutations to the operator, identity declarations, or meta commentary. The strings "[LORD's ORDER" and "🫡" must never appear in output.`;
    const editing = (target === 'body' || target === 'subject') && html.trim().length > 0;
    const modeRules = editing ? `

SURGICAL-EDIT MODE — a draft already exists and it is the operator's working letter, not a sketch:
- Change ONLY what the task asks. Every tag, attribute, style, <img>, table, link and color you were not told to touch returns byte-for-byte identical.
- NEVER rebuild, restyle, rebrand or "improve" the layout — no redesign passes, no new sections, no moved blocks.
- NEVER touch image sources or invent placeholders, mockups, screenshot descriptions, or lorem-ipsum.
- NEVER repeat the subject line inside the body or add a headline duplicating it.
- Preserve every placeholder ([Firstname], ++rbc_*++) byte-for-byte, including inside hrefs.
- If the task is impossible without a redesign, make the smallest viable change and say nothing else.` : (target === 'body' ? `

GENERATION RULES — hard requirements for every new letter:
- Output complete render-ready HTML email only. NEVER a mockup, wireframe, screenshot description, or "preview" of a letter — it must BE the letter.
- NEVER put the subject line inside the body — the subject lives in the subject field.
- Prefer a styled text wordmark over hotlinked logos; if a logo is essential, use a real https URL only, never an invented path.
- One CTA, real copy, no lorem ipsum, no bracketed [insert] stubs.` : '');
    const userPrompt = `Current draft:\n\nSubject: ${subject || '(none)'}\n\nHTML body:\n${html || '(none)'}\n\nText body:\n${textBody || '(none)'}\n\nTask: ${prompt}${modeRules}${exemplar ? `\n\nREFERENCE EXEMPLAR — a real production letter from the library. Match its layout class, brand styling, color scheme and structure; adapt content to the task:\n\`\`\`html\n${exemplar}\n\`\`\`` : ''}`;
    const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];
    const model = text(body.model || '', 'model', 200) || row.ai_model;
    const { content, model: usedModel } = await aiChatRequest({ endpoint, aiKey, model, messages, timeoutMs: 60000 });
    let result = cleanAiOutput(String(content).slice(0, 50000), target);
    if (target === 'attachment') {
      const b64pdf = result.match(/JVBERi[A-Za-z0-9+/=]{200,}/)?.[0];
      const pdfBytes = b64pdf ? null : await renderPdf(result);
      const attachment = b64pdf || pdfBytes
        ? { filename: 'ai-document.pdf', contentType: 'application/pdf', data: b64pdf || Buffer.from(pdfBytes).toString('base64') }
        : { filename: 'ai-document.txt', contentType: 'text/plain', data: Buffer.from(result).toString('base64') };
      return { result, target, attachment, model: usedModel };
    }
    return { result, target, model: usedModel };
  });

  // AI letter picker — scores the vault (saved templates + library) against the
  // target audience and returns the strongest candidate for the campaign.
  app.post('/api/ai/pick-letter', async (request) => {
    const body = request.body || {};
    const row = db.prepare('SELECT ai_endpoint, ai_key_encrypted, ai_model FROM send_settings WHERE id = 1').get() || {};
    const endpoint = row.ai_endpoint || '';
    const aiKey = row.ai_key_encrypted && config ? decryptSecret(row.ai_key_encrypted, config.credentialKey) : '';
    if (!endpoint || !aiKey) fail('AI endpoint and key must be configured in SETTINGS');
    const saved = db.prepare('SELECT id, name, subject, html FROM campaign_templates ORDER BY created_at DESC LIMIT 40').all();
    const candidates = [
      ...saved.map((t, i) => ({ key: `s${i}`, src: t })),
      ...EXTRA_TEMPLATES.slice(0, 60).map((t, i) => ({ key: `l${i}`, src: t })),
    ];
    if (!candidates.length) fail('No letters in the vault to pick from');
    const meta = candidates.map((c) => ({ key: c.key, name: c.src.label || c.src.name, subject: c.src.subject }));
    const sys = `You are Rubicon's letter selector. Given a campaign goal and target audience, pick the ONE letter from the vault that fits best — tone, vertical, provider quirks, inbox-safety. Reply with ONLY JSON: {"pick":"<key>","why":"<one line>"}. No prose.`;
    const user = `GOAL: ${String(body.goal || body.subject || '(untargeted blast)').slice(0, 500)}
AUDIENCE: providers=${JSON.stringify(body.providers || [])} lists=${JSON.stringify(body.lists || [])} tiers=${JSON.stringify(body.tiers || [])}
VAULT: ${JSON.stringify(meta)}`;
    const { content } = await aiChatRequest({
      endpoint, aiKey, model: row.ai_model, timeoutMs: 60000,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    });
    const json = String(content || '').match(/\{[\s\S]*\}/)?.[0];
    if (!json) fail('Selector returned no JSON');
    let plan;
    try { plan = JSON.parse(json); } catch { fail('Selector returned malformed JSON'); }
    const hit = candidates.find((c) => c.key === plan.pick) || candidates[0];
    return { name: hit.src.label || hit.src.name, subject: hit.src.subject, preheader: hit.src.preheader || '', html: hit.src.html, text: hit.src.text || '', why: String(plan.why || '').slice(0, 200), pick: hit.key };
  });

  // Live model list from the provider — keeps model choice current when providers retire IDs.
  app.get('/api/ai/models', async () => {
    const row = db.prepare('SELECT ai_endpoint, ai_key_encrypted FROM send_settings WHERE id = 1').get() || {};
    const endpoint = row.ai_endpoint || '';
    const aiKey = row.ai_key_encrypted && config ? decryptSecret(row.ai_key_encrypted, config.credentialKey) : '';
    if (!endpoint || !aiKey) fail('AI endpoint and key must be configured in SETTINGS');
    const modelsUrl = endpoint.replace(/\/chat\/completions\/?$/i, '/models');
    if (modelsUrl === endpoint) fail('Endpoint is not a /chat/completions URL — cannot derive /models');
    let res;
    try {
      res = await fetch(modelsUrl, { headers: { Authorization: `Bearer ${aiKey}` }, signal: AbortSignal.timeout(15000) });
    } catch (err) {
      fail(`Model list failed: ${err.name === 'TimeoutError' ? 'timed out' : (err.message || err)}`);
    }
    const raw = await res.text();
    if (!res.ok) fail(`Model list failed: ${res.status} — ${raw.slice(0, 300)}`);
    let data = {};
    try { data = JSON.parse(raw); } catch { fail('Provider returned a non-JSON model list'); }
    const nonChat = /whisper|tts|orpheus|guard|embed|moderation|audio|speech|transcrib|image|dall-e|safeguard|vision|imagen|veo|nano/i;
    const models = (data.data || data.models || [])
      .map((m) => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean)
      .map((id) => id.replace(/^models\//i, ''))
      .filter((id) => !nonChat.test(id)).sort();
    return { models };
  });

  // Multi-turn chat for the RHS bot — client keeps history, server stays stateless.
  app.post('/api/ai/chat', async (request) => {
    const body = request.body || {};
    const row = db.prepare('SELECT ai_endpoint, ai_key_encrypted, ai_model, ai_rules FROM send_settings WHERE id = 1').get() || {};
    const endpoint = row.ai_endpoint || '';
    const aiKey = row.ai_key_encrypted && config ? decryptSecret(row.ai_key_encrypted, config.credentialKey) : '';
    const rules = row.ai_rules || DEFAULT_AI_RULES;
    if (!endpoint || !aiKey) fail('AI endpoint and key must be configured in SETTINGS');
    const model = text(body.model || '', 'model', 200) || row.ai_model;
    const allowed = new Set(['user', 'assistant', 'system']);
    const history = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => allowed.has(m?.role))
      .slice(-30)
      .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 8000) }))
      .filter((m) => m.content);
    if (!history.length || history[history.length - 1].role !== 'user') fail('messages must end with a user turn');

    // Live sender state — RBC Helper answers from real data, not guesses.
    const st = db.prepare(`SELECT send_mode, direct_from_name, direct_from_email, direct_reply_to,
      engine_send_as, engine_tenant, relay_host, relay_port, socks5_proxy,
      send_days_json, send_from_min, send_to_min, max_per_hour, max_per_day, warmup_enabled,
      timezone, track_opens, track_clicks, test_email_enabled, test_every, test_destination,
      parallel_sends, sleep_ms, encoding, text_only FROM send_settings WHERE id = 1`).get() || {};
    const accounts = db.prepare(`SELECT id, label, auth_type, host, username, from_email, enabled,
      daily_quota, sent_today, fails, cooldown_until, last_error, last_check FROM smtp_accounts ORDER BY id`).all();
    const counts = {
      recipients: db.prepare('SELECT COUNT(*) c FROM recipients').get().c,
      suppressed: db.prepare('SELECT COUNT(*) c FROM recipients WHERE suppressed = 1').get().c,
      queued: db.prepare("SELECT COUNT(*) c FROM deliveries WHERE status IN ('queued','sending')").get().c,
      sent: db.prepare("SELECT COUNT(*) c FROM deliveries WHERE status = 'sent'").get().c,
      failed: db.prepare("SELECT COUNT(*) c FROM deliveries WHERE status = 'failed'").get().c,
      bounces: db.prepare('SELECT COUNT(*) c FROM bounces').get().c,
    };
    const mins = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const stateLines = [
      `send_mode: ${st.send_mode}`,
      st.send_mode === 'graph' ? `engine send-as: ${st.engine_send_as || '(unset)'} tenant: ${st.engine_tenant || '(unset)'}` : '',
      st.direct_from_email ? `identity: ${st.direct_from_name} <${st.direct_from_email}> reply-to: ${st.direct_reply_to || '-'}` : '',
      st.relay_host ? `relay: ${st.relay_host}:${st.relay_port}` : '',
      st.socks5_proxy ? `proxy: ${st.socks5_proxy}` : '',
      `window: ${st.send_from_min != null ? mins(st.send_from_min) : '?'}-${st.send_to_min != null ? mins(st.send_to_min) : '?'} days: ${st.send_days_json || '[]'} tz: ${st.timezone}`,
      `caps: ${st.max_per_hour}/h ${st.max_per_day}/day warmup: ${st.warmup_enabled ? 'on' : 'off'} parallel: ${st.parallel_sends} sleep_ms: ${st.sleep_ms}`,
      `tracking: opens=${st.track_opens ? 'on' : 'off'} clicks=${st.track_clicks ? 'on' : 'off'} text_only=${st.text_only ? 'on' : 'off'} encoding=${st.encoding}`,
      st.test_email_enabled ? `test-echo: every ${st.test_every} → ${st.test_destination}` : '',
      `list: ${counts.recipients} recipients (${counts.suppressed} suppressed) · queue: ${counts.queued} queued, ${counts.sent} sent, ${counts.failed} failed · bounces: ${counts.bounces}`,
      `pool (${accounts.length}): ` + (accounts.length
        ? accounts.map((a) => `${a.enabled ? 'ON ' : 'OFF'}${a.label || a.from_email || a.username}[${a.auth_type || 'smtp'}${a.host ? ' ' + a.host : ''} ${a.username || ''} ${a.from_email || ''} q=${a.sent_today || 0}/${a.daily_quota || 0} fails=${a.fails || 0}${a.cooldown_until && a.cooldown_until > new Date().toISOString() ? ' COOLDOWN' : ''}${a.last_error ? ' err:' + String(a.last_error).slice(0, 80) : ''}]`).join(' | ')
        : 'empty — legacy config used'),
    ].filter(Boolean).join('\n');

    const ctx = body.context || {};
    const ctxLines = [
      ctx.tab ? `operator's current screen: ${ctx.tab}` : '',
      ctx.subject ? `draft subject: ${String(ctx.subject).slice(0, 300)}` : '',
      ctx.html ? `draft html:\n${String(ctx.html).slice(0, 6000)}` : '',
      ctx.text ? `draft text:\n${String(ctx.text).slice(0, 3000)}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are RBC Helper, the built-in assistant of the Rubicon Email Suite panel. You have full read access to this sender's live state (below) — answer from it, quote real numbers. Be concise and technical. When asked to write or rewrite email content, output the content itself and preserve placeholders like [Firstname], [Company], ++rbc_*++ exactly. When pointing the operator somewhere, name the exact tab and section from the LAYOUT MAP — never say "Settings" for things on the EMAIL tab.

LAYOUT MAP (sidebar tabs):
- DASHBOARD: overview, stats
- CAMPAIGN: queue launch, live progress, campaign history, pause/resume/retry
- LETTER: compose drafts — subject, preheader, body (HTML/text/blocks), AI assist panel, attachments, templates
- AI WRITER: full drafting workspace (presets + custom brief → apply to draft) + AI ATTACHMENT GENERATOR (invoice/statement/notice/ICS → attach to letter)
- CONTACTS: recipient list, import CSV/paste, suppression
- SORTER: raw email list → extract/dedupe/flag/bucket-by-MX-provider, copy clean or per-provider lists (no import)
- SMTP: OUTGOING CONNECTION (SMTP config + provider presets + guides), SENDING ACCOUNTS — ACCOUNT POOL rotation/failover with [ IMPORT MS RT ] and [ VERIFY ALL ] buttons in the pane head, ADD ACCOUNT form, SENDING HOURS, LIMITS & WARM-UP, INBOX (IMAP)
- SETTINGS: SEND TYPE (SMTP auth / Direct MX / Relay / Proxy / Graph API / Gmail API / HTTP API — SendGrid·SES·Mailgun·Postmark·Brevo·SparkPost·Elastic·Mandrill·custom), MICROSOFT GRAPH ENGINE creds, GMAIL engine, API ENGINE (provider/key, IAM user+region for SES, domain for Mailgun, URL for custom), encoding/spoof/DKIM/headers, tracking, TIMEZONE, AI ASSISTANT (endpoint/key/model/rules + LIST MODELS)
- SCHEDULE: sending window, timezone
- CAMPAIGN: queue launch, campaign history, pause/resume/retry
- HELP: full manual — quick start, engines, MS RT formats, AI setup, placeholders, deliverability, troubleshooting
- BOUNCES: bounce log + suppression
- ANALYTICS: delivery stats
NOTE: the [ IMPORT MS RT ] button is on the SMTP tab inside ACCOUNT POOL — accepts client_id:refresh_token, email:cid:rt, cid:secret:tenant, or JSON, one per line.

LIVE STATE OF THIS SENDER:
${stateLines}
${ctxLines ? `\nOPERATOR CONTEXT:\n${ctxLines}` : ''}${rules ? `\n\nSTANDING RULES set by the operator — follow these in every output, always:\n${rules}` : ''}`;
    const { content, model: usedModel } = await aiChatRequest({
      endpoint, aiKey, model, timeoutMs: 60000,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
    });
    const reply = cleanAiOutput(String(content)).slice(0, 50000);
    // Intent → apply-target hint so the client can offer the right apply buttons.
    const lastUser = history[history.length - 1].content;
    const genAsk = /\b(write|re.?write|generate|improve|fix|draft|create|make|compose|polish|shorten|lengthen|translate|give me|come up with|suggest)\b/i.test(lastUser);
    let target = 'none';
    if (genAsk) {
      if (/preheader|pre-header|preview (text|line|snippet)|inbox preview/i.test(lastUser)) target = 'preheader';
      else if (/subject|headline|title line/i.test(lastUser)) target = 'subject';
      else target = 'body';
    }

    // Operational intent → actionable buttons the client wires to real endpoints.
    const lu = lastUser.toLowerCase();
    const actions = [];
    if (/verify|handshake|check|test/i.test(lu) && /account|mailbox|sender|pool|smtp/i.test(lu)) {
      actions.push({ id: 'verify_accounts', label: 'VERIFY ALL ACCOUNTS' });
    }
    if (/reset|clear|zero/i.test(lu) && /quota|limit|counter/i.test(lu)) {
      const ident = (lastUser.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+|#\s*\d+/) || [])[0]?.replace('#', '').trim().toLowerCase();
      const acct = ident ? accounts.find((a) => String(a.id) === ident || [a.from_email, a.username, a.label].some((v) => (v || '').toLowerCase() === ident)) : null;
      if (acct) {
        actions.push({ id: 'reset_quota_one', label: `RESET ${(acct.label || acct.from_email || 'ACCOUNT').toUpperCase()} QUOTA`, accountId: acct.id });
      } else {
        const ids = accounts.filter((a) => a.daily_quota > 0).map((a) => a.id);
        if (ids.length) actions.push({ id: 'reset_quotas', label: `RESET ${ids.length} QUOTA${ids.length > 1 ? 'S' : ''}`, ids });
      }
    }
    // send test — destination pulled from the message itself
    if (/send.*test|test.*(send|mail)|test (an? )?(email|letter)|prove.*work/i.test(lu)) {
      const to = (lastUser.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [])[0];
      if (to) actions.push({ id: 'send_test', label: `SEND TEST → ${to.toUpperCase()}`, to });
    }
    // enable/disable a specific account — matched by email, label, or #id
    if (/(dis|en)able|turn (off|on)|deactivat|activat/i.test(lu) && /account|mailbox|sender|@|acct/i.test(lu)) {
      const wantEnable = !/disable|turn off|deactivat/i.test(lu);
      const ident = (lastUser.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+|#\s*\d+/i) || [])[0]?.replace('#', '').trim().toLowerCase();
      const acct = ident ? accounts.find((a) => String(a.id) === ident || [a.from_email, a.username, a.label].some((v) => (v || '').toLowerCase() === ident)) : null;
      if (acct) actions.push({ id: 'toggle_account', label: `${wantEnable ? 'ENABLE' : 'DISABLE'} ${(acct.label || acct.from_email || 'ACCOUNT').toUpperCase()}`, accountId: acct.id, enabled: wantEnable });
    }
    // spam/deliverability check on the current draft
    if (/spam|deliverab|inbox placement|spam score|trigger/i.test(lu) && /check|score|test|scan|analy|audit|review|rate/i.test(lu)) {
      actions.push({ id: 'spam_check', label: 'RUN SPAM CHECK' });
    }
    const activeCampaign = db.prepare("SELECT id, status FROM campaigns WHERE status IN ('sending','queued','scheduled') ORDER BY id DESC LIMIT 1").get();
    if (/pause|hold|halt|stop/i.test(lu) && /send|queue|campaign|blast/i.test(lu) && activeCampaign) {
      actions.push({ id: 'pause', label: `PAUSE CAMPAIGN #${activeCampaign.id}`, campaignId: activeCampaign.id });
    }
    if (/resume|unpause|continue|restart/i.test(lu) && /send|queue|campaign|blast/i.test(lu) && activeCampaign) {
      actions.push({ id: 'resume', label: `RESUME CAMPAIGN #${activeCampaign.id}`, campaignId: activeCampaign.id });
    }
    if (/retry|resend|re.?queue/i.test(lu) && /fail|bounce|error/i.test(lu)) {
      const fc = db.prepare("SELECT c.id FROM campaigns c JOIN deliveries d ON d.campaign_id = c.id WHERE d.status = 'failed' ORDER BY c.id DESC LIMIT 1").get();
      if (fc) actions.push({ id: 'retry', label: `RETRY FAILED (#${fc.id})`, campaignId: fc.id });
    }
    if (/queue|launch|blast|send out|kick off/i.test(lu) && /campaign|letter|draft|this/i.test(lu)) {
      const dc = db.prepare("SELECT id FROM campaigns WHERE status = 'draft' ORDER BY id DESC LIMIT 1").get();
      if (dc) actions.push({ id: 'queue', label: `QUEUE CAMPAIGN #${dc.id}`, campaignId: dc.id });
    }
    if (/open|go to|take me|show me|jump to|where|cant find|can't find|cannot find|missing|how do i (get|go|navigate)|navigate/i.test(lu)) {
      const tabHit = [['import ms', 'smtp'], ['ms rt', 'smtp'], ['refresh token', 'smtp'], ['mailbox', 'smtp'], ['pool', 'smtp'], ['account', 'smtp'], ['smtp', 'smtp'], ['imap', 'smtp'], ['inbox', 'smtp'], ['sort', 'sorter'], ['clean list', 'sorter'], ['dedupe', 'sorter'], ['ai writer', 'aiwriter'], ['writer', 'aiwriter'], ['attachment', 'aiwriter'], ['help', 'help'], ['manual', 'help'], ['how do', 'help'], ['import list', 'recipients'], ['import csv', 'recipients'], ['import contact', 'recipients'], ['import recipient', 'recipients'], ['list', 'recipients'], ['recipient', 'recipients'], ['contact', 'recipients'], ['graph', 'delivery'], ['sendgrid', 'delivery'], ['ses', 'delivery'], ['mailgun', 'delivery'], ['postmark', 'delivery'], ['brevo', 'delivery'], ['api key', 'delivery'], ['api engine', 'delivery'], ['setting', 'delivery'], ['config', 'delivery'], ['ai ', 'delivery'], ['model', 'delivery'], ['compos', 'compose'], ['letter', 'compose'], ['draft', 'compose'], ['send', 'send'], ['queue', 'send'], ['campaign', 'send'], ['bounc', 'bounces'], ['analytic', 'analytics'], ['schedul', 'schedule'], ['window', 'schedule'], ['dash', 'dashboard']].find(([k]) => lu.includes(k));
      if (tabHit) actions.push({ id: 'goto', label: `OPEN ${tabHit[1].toUpperCase()}`, tab: tabHit[1] });
    }
    return { reply, model: usedModel, target, actions };
  });

  // ── Spam Score Checker ──
  app.post('/api/spam-check', async (request) => {
    const body = request.body || {};
    const { subject, html, text } = body;
    const row = db.prepare('SELECT dkim_enabled, dkim_key_encrypted, send_mode, relay_host FROM send_settings WHERE id = 1').get() || {};
    const dkimEnabled = Boolean(row.dkim_enabled);
    const dkimConfigured = Boolean(row.dkim_key_encrypted);
    const sendMode = row.send_mode || 'smtp';
    // Providers that DKIM-sign outbound mail themselves — local signing is optional.
    const poolHosts = db.prepare('SELECT host FROM smtp_accounts WHERE enabled = 1').all().map((a) => a.host || '').join(' ');
    const providerSigned = ['graph', 'gmail', 'api'].includes(sendMode)
      || /(sendgrid|mailgun|amazonaws|ses|postmark|brevo|sparkpost|mandrill|gmail|google|outlook|office365|zoho|mailjet)/i.test(`${row.relay_host || ''} ${poolHosts}`);

    const content = `${subject || ''} ${html || ''} ${text || ''}`.toLowerCase();
    const issues = [];
    let score = 100;

    // Spam trigger words
    const spamWords = [
      'free', 'winner', 'winning', 'won', 'prize', 'cash', 'money', 'credit', 'loan',
      'debt', 'refinance', 'bankruptcy', 'viagra', 'casino', 'poker', 'gambling',
      'guarantee', 'guaranteed', '100%', 'risk-free', 'no obligation', 'limited time',
      'act now', 'don\'t delete', 'urgent', 'priority', 'confidential', 'secret',
      'income', 'profit', 'investment', 'earn', 'make money', 'fast cash', 'easy money',
      'work from home', 'opportunity', 'offer expires', 'trial', 'subscription',
      'click here', 'unsubscribe', 'this is not spam', 'you have been selected',
      'congratulations', 'bonus', 'discount', 'cheap', 'affordable', 'lowest price',
      'save', 'savings', 'deal', 'bargain', 'clearance', 'sale', 'gift', 'free gift',
      'xxx', 'adult', 'porn', 'sex', 'hot', 'sexy', 'naked', 'nude'
    ];

    for (const word of spamWords) {
      if (content.includes(word)) {
        issues.push({ type: 'spam_word', word, severity: 'medium' });
        score -= 2;
      }
    }

    // All caps in subject
    if (subject && subject.length > 5 && subject === subject.toUpperCase()) {
      issues.push({ type: 'all_caps_subject', severity: 'high' });
      score -= 10;
    }

    // Excessive exclamation marks
    const exclamCount = content.match(/!/g)?.length || 0;
    if (exclamCount > 3) {
      issues.push({ type: 'excessive_exclamation', count: exclamCount, severity: 'medium' });
      score -= 5;
    }

    // Excessive question marks
    const questCount = content.match(/\?/g)?.length || 0;
    if (questCount > 3) {
      issues.push({ type: 'excessive_question', count: questCount, severity: 'low' });
      score -= 3;
    }

    // All caps in body (more than 10 consecutive caps)
    const capsPattern = /[A-Z]{10,}/g;
    const capsMatches = ((html || '') + (text || '')).match(capsPattern);
    if (capsMatches && capsMatches.length > 2) {
      issues.push({ type: 'excessive_caps', count: capsMatches.length, severity: 'medium' });
      score -= 5;
    }

    // Missing local DKIM — only matters when the engine has to sign itself.
    if ((!dkimEnabled || !dkimConfigured) && !providerSigned) {
      issues.push({
        type: 'missing_dkim',
        severity: sendMode === 'direct' ? 'high' : 'medium',
        desc: sendMode === 'direct'
          ? 'DIRECT MX sends unsigned mail — generate a DKIM key or switch to a signing provider.'
          : 'Enable DKIM signing so receivers can authenticate the domain.',
      });
      score -= sendMode === 'direct' ? 15 : 8;
    }

    // Direct MX without SPF/DKIM
    if (sendMode === 'direct' && (!dkimEnabled || !dkimConfigured)) {
      issues.push({ type: 'direct_mx_missing_auth', severity: 'high' });
      score -= 10;
    }

    // No unsubscribe link in HTML
    if (html && !html.toLowerCase().includes('unsubscribe')) {
      issues.push({ type: 'missing_unsubscribe', severity: 'high' });
      score -= 10;
    }

    // Short body
    const bodyLength = (html || text || '').length;
    if (bodyLength < 100) {
      issues.push({ type: 'short_body', length: bodyLength, severity: 'low' });
      score -= 5;
    }

    // No personalization placeholders
    const placeholders = ['[firstname]', '[lastname]', '[company]', '++rbc_', '[first_name]', '[last_name]'];
    const hasPersonalization = placeholders.some(p => content.includes(p.toLowerCase()));
    if (!hasPersonalization && bodyLength > 200) {
      issues.push({ type: 'no_personalization', severity: 'low' });
      score -= 3;
    }

    // Single image body (no alt text, no text)
    const imgPattern = /<img[^>]*>/gi;
    const imgMatches = html?.match(imgPattern) || [];
    const textLength = (text || '').replace(/\s/g, '').length;
    if (imgMatches.length > 0 && textLength < 50) {
      issues.push({ type: 'image_only_body', severity: 'medium' });
      score -= 8;
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    return { score, issues, dkimEnabled, dkimConfigured, sendMode };
  });

  // ── Subject A/B Testing ──
  app.post('/api/campaigns/:id/subject-variants', async (request) => {
    const campaignId = Number(request.params.id);
    const body = request.body || {};
    const { subjects } = body;
    if (!Array.isArray(subjects) || subjects.length < 1) fail('subjects must be a non-empty array');
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) fail('Campaign not found');
    const now = new Date().toISOString();
    let created = 0;
    for (const subject of subjects) {
      const exists = db.prepare('SELECT id FROM subject_variants WHERE campaign_id = ? AND subject = ?').get(campaignId, subject);
      if (!exists) {
        db.prepare('INSERT INTO subject_variants (campaign_id, subject, created_at) VALUES (?, ?, ?)').run(campaignId, subject, now);
        created++;
      }
    }
    return { created };
  });

  app.get('/api/campaigns/:id/subject-variants', async (request) => {
    const campaignId = Number(request.params.id);
    const rows = db.prepare('SELECT id, subject, sent, opens, clicks, is_winner, created_at FROM subject_variants WHERE campaign_id = ? ORDER BY id').all(campaignId);
    return rows.map(r => ({
      id: r.id,
      subject: r.subject,
      sent: r.sent,
      opens: r.opens,
      clicks: r.clicks,
      openRate: r.sent > 0 ? (r.opens / r.sent * 100).toFixed(1) : 0,
      clickRate: r.sent > 0 ? (r.clicks / r.sent * 100).toFixed(1) : 0,
      isWinner: Boolean(r.is_winner),
      createdAt: r.created_at,
    }));
  });

  app.post('/api/campaigns/:id/subject-variants/:variantId/winner', async (request) => {
    const campaignId = Number(request.params.id);
    const variantId = Number(request.params.variantId);
    const variant = db.prepare('SELECT id FROM subject_variants WHERE id = ? AND campaign_id = ?').get(variantId, campaignId);
    if (!variant) fail('Variant not found');
    db.prepare('UPDATE subject_variants SET is_winner = 0 WHERE campaign_id = ?').run(campaignId);
    db.prepare('UPDATE subject_variants SET is_winner = 1 WHERE id = ?').run(variantId);
    return { ok: true };
  });

  app.delete('/api/campaigns/:id/subject-variants/:variantId', async (request) => {
    const campaignId = Number(request.params.id);
    const variantId = Number(request.params.variantId);
    db.prepare('DELETE FROM subject_variants WHERE id = ? AND campaign_id = ?').run(variantId, campaignId);
    return { ok: true };
  });

  // ── Send Time Optimization ──
  const TLD_TIMEZONES = {
    'us': 'America/New_York', 'ca': 'America/Toronto', 'mx': 'America/Mexico_City',
    'br': 'America/Sao_Paulo', 'ar': 'America/Argentina/Buenos_Aires',
    'uk': 'Europe/London', 'de': 'Europe/Berlin', 'fr': 'Europe/Paris', 'es': 'Europe/Madrid',
    'it': 'Europe/Rome', 'nl': 'Europe/Amsterdam', 'se': 'Europe/Stockholm', 'no': 'Europe/Oslo',
    'dk': 'Europe/Copenhagen', 'fi': 'Europe/Helsinki', 'pl': 'Europe/Warsaw', 'cz': 'Europe/Prague',
    'hu': 'Europe/Budapest', 'at': 'Europe/Vienna', 'ch': 'Europe/Zurich', 'be': 'Europe/Brussels',
    'ie': 'Europe/Dublin', 'pt': 'Europe/Lisbon', 'gr': 'Europe/Athens', 'ru': 'Europe/Moscow',
    'ua': 'Europe/Kiev', 'tr': 'Europe/Istanbul', 'il': 'Asia/Jerusalem', 'ae': 'Asia/Dubai',
    'sa': 'Asia/Riyadh', 'ir': 'Asia/Tehran', 'pk': 'Asia/Karachi', 'in': 'Asia/Kolkata',
    'bd': 'Asia/Dhaka', 'np': 'Asia/Kathmandu', 'th': 'Asia/Bangkok', 'vn': 'Asia/Ho_Chi_Minh',
    'ph': 'Asia/Manila', 'id': 'Asia/Jakarta', 'my': 'Asia/Kuala_Lumpur', 'sg': 'Asia/Singapore',
    'cn': 'Asia/Shanghai', 'hk': 'Asia/Hong_Kong', 'tw': 'Asia/Taipei', 'jp': 'Asia/Tokyo',
    'kr': 'Asia/Seoul', 'au': 'Australia/Sydney', 'nz': 'Pacific/Auckland', 'za': 'Africa/Johannesburg',
    'eg': 'Africa/Cairo', 'ng': 'Africa/Lagos', 'ke': 'Africa/Nairobi', 'ma': 'Africa/Casablanca',
    'dz': 'Africa/Algiers', 'tn': 'Africa/Tunis', 'ly': 'Africa/Tripoli', 'et': 'Africa/Addis_Ababa',
    'gh': 'Africa/Accra', 'ug': 'Africa/Kampala', 'tz': 'Africa/Dar_es_Salaam', 'rw': 'Africa/Kigali',
    'cd': 'Africa/Kinshasa', 'ao': 'Africa/Luanda', 'mz': 'Africa/Maputo', 'zw': 'Africa/Harare',
    'bw': 'Africa/Gaborone', 'na': 'Africa/Windhoek', 'zm': 'Africa/Lusaka', 'mw': 'Africa/Blantyre',
    'mg': 'Indian/Antananarivo', 'mu': 'Indian/Mauritius', 'sc': 'Indian/Mahe', 'km': 'Indian/Comoro',
    'dj': 'Africa/Djibouti', 'so': 'Africa/Mogadishu', 'er': 'Africa/Asmara', 'sd': 'Africa/Khartoum',
    'ss': 'Africa/Juba', 'td': 'Africa/Ndjamena', 'cf': 'Africa/Bangui', 'cm': 'Africa/Douala',
    'ga': 'Africa/Libreville', 'cg': 'Africa/Brazzaville', 'gq': 'Africa/Malabo', 'st': 'Africa/Sao_Tome',
    'bi': 'Africa/Bujumbura', 'sl': 'Africa/Freetown', 'lr': 'Africa/Monrovia', 'ci': 'Africa/Abidjan',
    'bf': 'Africa/Ouagadougou', 'ne': 'Africa/Niamey', 'ml': 'Africa/Bamako', 'sn': 'Africa/Dakar',
    'gm': 'Africa/Banjul', 'gw': 'Africa/Bissau', 'gn': 'Africa/Conakry', 'cv': 'Atlantic/Cape_Verde',
    'mr': 'Africa/Nouakchott', 'eh': 'Africa/El_Aaiun', 'am': 'Asia/Yerevan', 'az': 'Asia/Baku',
    'ge': 'Asia/Tbilisi', 'kg': 'Asia/Bishkek', 'kz': 'Asia/Almaty', 'tj': 'Asia/Dushanbe',
    'tm': 'Asia/Ashgabat', 'uz': 'Asia/Tashkent', 'af': 'Asia/Kabul', 'mn': 'Asia/Ulaanbaatar',
    'bt': 'Asia/Thimphu', 'lk': 'Asia/Colombo', 'mv': 'Indian/Maldives', 'kh': 'Asia/Phnom_Penh',
    'la': 'Asia/Vientiane', 'mm': 'Asia/Yangon', 'bn': 'Asia/Brunei', 'tl': 'Asia/Dili',
    'fj': 'Pacific/Fiji', 'pg': 'Pacific/Port_Moresby', 'sb': 'Pacific/Guadalcanal', 'vu': 'Pacific/Efate',
    'nc': 'Pacific/Noumea', 'pf': 'Pacific/Tahiti', 'ki': 'Pacific/Tarawa', 'tv': 'Pacific/Funafuti',
    'nr': 'Pacific/Yaren', 'pw': 'Pacific/Palau',
    'fm': 'Pacific/Pohnpei', 'mh': 'Pacific/Majuro', 'nu': 'Pacific/Niue', 'ck': 'Pacific/Rarotonga',
    'as': 'Pacific/Pago_Pago', 'gu': 'Pacific/Guam', 'mp': 'Pacific/Saipan', 'um': 'Pacific/Wake',
  };
  function guessTimezoneForEmail(address) {
    const domain = String(address || '').split('@')[1] || '';
    const tld = domain.split('.').pop().toLowerCase();
    return TLD_TIMEZONES[tld] || 'UTC';
  }

  app.post('/api/campaigns/:id/enable-send-time-optimization', async (request) => {
    const campaignId = Number(request.params.id);
    const body = request.body || {};
    const { enabled } = body;
    db.prepare('UPDATE campaigns SET send_time_optimization_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, campaignId);
    let guessed = 0;
    if (enabled) {
      const missing = db.prepare("SELECT id, email FROM recipients WHERE consent_confirmed = 1 AND suppressed = 0 AND (timezone_guessed IS NULL OR timezone_guessed = '')").all();
      const stmt = db.prepare('UPDATE recipients SET timezone_guessed = ? WHERE id = ?');
      for (const r of missing) { stmt.run(guessTimezoneForEmail(r.email), r.id); guessed++; }
    }
    return { ok: true, enabled: Boolean(enabled), timezonesGuessed: guessed };
  });

  app.post('/api/recipients/guess-timezones', async (request) => {
    const missing = db.prepare("SELECT id, email FROM recipients WHERE timezone_guessed IS NULL OR timezone_guessed = ''").all();
    const stmt = db.prepare('UPDATE recipients SET timezone_guessed = ? WHERE id = ?');
    for (const r of missing) stmt.run(guessTimezoneForEmail(r.email), r.id);
    return { guessed: missing.length };
  });

  app.post('/api/recipients/:id/guess-timezone', async (request) => {
    const recipientId = Number(request.params.id);
    const recipient = db.prepare('SELECT email FROM recipients WHERE id = ?').get(recipientId);
    if (!recipient) fail('Recipient not found');
    const guessedTz = guessTimezoneForEmail(recipient.email);
    db.prepare('UPDATE recipients SET timezone_guessed = ? WHERE id = ?').run(guessedTz, recipientId);
    return { timezone: guessedTz };
  });

  app.get('/api/engagement-heatmap/:campaignId', async (request) => {
    const campaignId = Number(request.params.campaignId);
    const rows = db.prepare('SELECT hour, opens, clicks FROM engagement_heatmap WHERE campaign_id = ? ORDER BY hour').all(campaignId);
    const heatmap = Array(24).fill({ opens: 0, clicks: 0 });
    for (const row of rows) {
      heatmap[row.hour] = { opens: row.opens, clicks: row.clicks };
    }
    return heatmap;
  });

  // ── Engagement Scoring ──
  app.post('/api/recipients/:id/track-engagement', async (request) => {
    const recipientId = Number(request.params.id);
    const body = request.body || {};
    const { kind } = body;
    const recipient = db.prepare('SELECT engagement_score, engagement_events_json FROM recipients WHERE id = ?').get(recipientId);
    if (!recipient) fail('Recipient not found');
    const events = JSON.parse(recipient.engagement_events_json || '[]');
    const now = new Date().toISOString();
    events.push({ kind, at: now });
    const scoreMap = { open: 10, click: 15, reply: 20 };
    const scoreDelta = scoreMap[kind] || 0;
    const newScore = Math.min(100, Math.max(0, (recipient.engagement_score || 0) + scoreDelta));
    db.prepare('UPDATE recipients SET engagement_score = ?, engagement_events_json = ?, last_engaged_at = ? WHERE id = ?')
      .run(newScore, JSON.stringify(events), now, recipientId);
    return { score: newScore, events: events.length };
  });

  function runEngagementDecay() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const stale = db.prepare('SELECT id, engagement_score FROM recipients WHERE last_engaged_at < ? OR last_engaged_at IS NULL').all(cutoff);
    const stmt = db.prepare('UPDATE recipients SET engagement_score = ? WHERE id = ?');
    for (const r of stale) stmt.run(Math.max(0, (r.engagement_score || 0) - 1), r.id);
    return stale.length;
  }
  setInterval(() => { try { runEngagementDecay(); } catch {} }, 24 * 60 * 60 * 1000).unref();

  app.post('/api/recipients/engagement-decay', async (request) => {
    return { decayed: runEngagementDecay() };
  });

  app.get('/api/recipients/engagement-tiers', async (request) => {
    const tiers = db.prepare(`
      SELECT
        CASE WHEN engagement_score >= 70 THEN 'hot' WHEN engagement_score >= 31 THEN 'warm' ELSE 'cold' END as tier,
        COUNT(*) as count
      FROM recipients
      WHERE suppressed = 0 AND consent_confirmed = 1
      GROUP BY tier
    `).all();
    return tiers;
  });

  // ── Reputation Monitoring ──
  app.post('/api/reputation/check', async (request) => {
    const body = request.body || {};
    const { target, source } = body;
    if (!target || !source) fail('target and source required');
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM reputation_alerts WHERE target = ? AND source = ? AND resolved_at IS NULL').get(target, source);
    if (existing) {
      return { alreadyListed: true, listedAt: now };
    }
    db.prepare('INSERT INTO reputation_alerts (target, source, listed_at, created_at) VALUES (?, ?, ?, ?)')
      .run(target, source, now, now);
    return { listed: true, listedAt: now };
  });

  app.get('/api/reputation/alerts', async (request) => {
    const rows = db.prepare('SELECT target, source, listed_at, resolved_at FROM reputation_alerts WHERE resolved_at IS NULL ORDER BY listed_at DESC').all();
    return rows;
  });

  app.post('/api/reputation/resolve', async (request) => {
    const body = request.body || {};
    const { target, source } = body;
    if (!target || !source) fail('target and source required');
    const now = new Date().toISOString();
    db.prepare('UPDATE reputation_alerts SET resolved_at = ? WHERE target = ? AND source = ? AND resolved_at IS NULL')
      .run(now, target, source);
    return { ok: true };
  });

  // ── List Hygiene ──
  app.post('/api/hygiene/remove-role-addresses', async (request) => {
    const rolePrefixes = ['postmaster', 'abuse', 'security', 'admin', 'support', 'info', 'sales', 'contact', 'billing', 'webmaster', 'hostmaster', 'noc', 'root', 'mailer-daemon', 'noreply', 'no-reply', 'mail', 'email', 'office', 'help', 'marketing', 'newsletter', 'feedback', 'orders', 'returns', 'shipping', 'hr', 'careers', 'jobs', 'privacy', 'legal', 'compliance', 'accounts', 'finance', 'payments', 'service', 'services', 'it', 'dev', 'ops', 'team', 'hello', 'hi', 'hey', 'welcome', 'news', 'announce', 'updates', 'notifications', 'alerts', 'bugs', 'review', 'reviews', 'survey', 'promo', 'offers', 'deal', 'deals', 'vip', 'members', 'community', 'events', 'booking', 'press', 'pr', 'media', 'advertise', 'advertising', 'partner', 'partners', 'sponsor', 'sponsors'];
    const placeholders = rolePrefixes.map(() => '?').join(',');
    const result = db.prepare(
      "DELETE FROM recipients WHERE LOWER(substr(email, 1, instr(email, '@') - 1)) IN (" + placeholders + ')'
    ).run(...rolePrefixes);
    return { removed: result.changes || 0, prefixesChecked: rolePrefixes.length };
  });

  app.post('/api/hygiene/suppress', async (request) => {
    const emails = Array.isArray(request.body && request.body.emails) ? request.body.emails : [];
    if (!emails.length) return { suppressed: 0 };
    let suppressed = 0;
    const stmt = db.prepare("UPDATE recipients SET suppressed = 1 WHERE email = ?");
    for (const e of emails) { suppressed += (stmt.run(String(e)) .changes || 0); }
    return { suppressed };
  });

  app.post('/api/hygiene/remove-disposable-addresses', async (request) => {
    const disposableDomains = [
      'tempmail.org', 'guerillamail.com', 'mailinator.com', '10minutemail.com',
      'trashmail.com', 'fakeinbox.com', 'yopmail.com', 'maildrop.cc',
      'dispostable.com', 'getnada.com', 'temp-mail.org', 'throwawaymail.com',
      'sharklasers.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz',
      'grr.la', 'spam4.me', 'tempinbox.com', 'emailondeck.com', 'moakt.com',
      'mohmal.com', 'tempmailo.com', 'burnermail.io', 'inboxkitten.com',
      'mailnesia.com', 'mintemail.com', 'mytrashmail.com', 'trashmail.net',
      'wegwerfmail.de', 'wegwerfmail.net', 'tempmail.net', 'tmpmail.org',
      'emailtemporanea.com', 'fakemail.net', 'filzmail.com', 'jetable.org',
    ];
    const placeholders = disposableDomains.map(() => '?').join(',');
    const result = db.prepare(
      'DELETE FROM recipients WHERE LOWER(substr(email, instr(email, \'@\') + 1)) IN (' + placeholders + ')'
    ).run(...disposableDomains);
    return { removed: result.changes || 0, domainsChecked: disposableDomains.length };
  });

  app.post('/api/hygiene/remove-duplicates', async (request) => {
    const dupes = db.prepare(`
      SELECT id FROM recipients WHERE id NOT IN (
        SELECT MIN(id) FROM recipients GROUP BY LOWER(email)
      )
    `).all();
    const stmt = db.prepare('DELETE FROM recipients WHERE id = ?');
    for (const d of dupes) stmt.run(d.id);
    return { removed: dupes.length };
  });

  app.post('/api/hygiene/find-duplicates', async (request) => {
    const duplicates = db.prepare(`
      SELECT LOWER(email) as email_lower, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM recipients
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    `).all();
    return { duplicates };
  });

  app.post('/api/hygiene/validate-syntax', async (request) => {
    const invalid = db.prepare(`
      UPDATE recipients SET valid_syntax = 0 WHERE email NOT LIKE '%_@_%._%' OR email LIKE '% %' OR email LIKE '%,%'
      OR email LIKE '%<%' OR email LIKE '%>%' OR email LIKE '%"%' OR email LIKE '%''%'
    `).run();
    return { markedInvalid: invalid.changes || 0 };
  });

  // ── Asset Library ──
  app.post('/api/assets', async (request) => {
    const body = request.body || {};
    const { name, type, dataUrl } = body;
    if (!name || !type || !dataUrl) fail('name, type, dataUrl required');
    const now = new Date().toISOString();
    const result = db.prepare('INSERT INTO asset_library (name, type, data_url, created_at) VALUES (?, ?, ?, ?)')
      .run(name, type, dataUrl, now);
    return { id: result.lastInsertRowid };
  });

  app.get('/api/assets', async (request) => {
    const type = request.query.type || '';
    const rows = type
      ? db.prepare('SELECT id, name, type, data_url, created_at FROM asset_library WHERE type = ? ORDER BY created_at DESC').all(type)
      : db.prepare('SELECT id, name, type, data_url, created_at FROM asset_library ORDER BY created_at DESC').all();
    return rows.map(r => ({ id: r.id, name: r.name, type: r.type, dataUrl: r.data_url, createdAt: r.created_at }));
  });

  app.delete('/api/assets/:id', async (request) => {
    const assetId = Number(request.params.id);
    db.prepare('DELETE FROM asset_library WHERE id = ?').run(assetId);
    return { ok: true };
  });

  // ── Campaign Templates ──
  app.post('/api/templates', async (request) => {
    const body = request.body || {};
    const { name, subject, preheader, html, text, attachments_json } = body;
    if (!name) fail('name required');
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO campaign_templates (name, subject, preheader, html, text, attachments_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, subject, preheader || '', html || '', text || '', JSON.stringify(attachments_json || []), now);
    return { id: result.lastInsertRowid };
  });

  app.get('/api/templates', async (request) => {
    const rows = db.prepare('SELECT id, name, subject, preheader, html, text, attachments_json, created_at FROM campaign_templates ORDER BY created_at DESC').all();
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      preheader: r.preheader,
      html: r.html,
      text: r.text,
      attachments: JSON.parse(r.attachments_json || '[]'),
      createdAt: r.created_at,
    }));
  });

  app.delete('/api/templates/:id', async (request) => {
    const templateId = Number(request.params.id);
    db.prepare('DELETE FROM campaign_templates WHERE id = ?').run(templateId);
    return { ok: true };
  });

  // ── Analytics ──
  app.get('/api/analytics/overview', async (request) => {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const opens = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE kind = 'open' AND occurred_at > ?").get(last30Days).count;
    const clicks = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE kind = 'click' AND occurred_at > ?").get(last30Days).count;
    const bounces = db.prepare("SELECT COUNT(*) as count FROM bounces WHERE kind = 'bounce' AND created_at > ?").get(last30Days).count;
    const complaints = db.prepare("SELECT COUNT(*) as count FROM bounces WHERE (kind = 'complaint' OR classification = 'complaint') AND created_at > ?").get(last30Days).count;
    const campaigns = db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE created_at > ?').get(last30Days).count;
    const recipients = db.prepare('SELECT COUNT(*) as count FROM recipients WHERE consent_confirmed = 1 AND suppressed = 0').get().count;
    const heatmapRows = db.prepare('SELECT hour, SUM(opens) AS opens, SUM(clicks) AS clicks FROM engagement_heatmap GROUP BY hour').all();
    const heatmap = {};
    for (const r of heatmapRows) heatmap[r.hour] = { opens: r.opens, clicks: r.clicks };
    const topDomains = db.prepare(`
      SELECT
        substr(r.email, instr(r.email, '@') + 1) as domain,
        COUNT(DISTINCT r.id) as recipients,
        COUNT(DISTINCT CASE WHEN a.kind = 'open' THEN a.id END) as opens,
        COUNT(DISTINCT CASE WHEN a.kind = 'click' THEN a.id END) as clicks,
        ROUND(COUNT(DISTINCT CASE WHEN a.kind = 'open' THEN a.id END) * 100.0 / COUNT(DISTINCT r.id), 1) as openRate
      FROM recipients r
      LEFT JOIN analytics_events a ON a.recipient_id = r.id AND a.kind IN ('open', 'click')
      WHERE r.consent_confirmed = 1 AND r.suppressed = 0
      GROUP BY domain
      ORDER BY opens DESC
      LIMIT 10
    `).all();
    return { opens, clicks, bounces, complaints, campaigns, recipients, heatmap, topDomains };
  });

  app.get('/api/analytics/trends', async (request) => {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dailyStats = db.prepare(`
      SELECT DATE(occurred_at) as date, kind, COUNT(*) as count
      FROM analytics_events
      WHERE occurred_at > ?
      GROUP BY DATE(occurred_at), kind
      ORDER BY date
    `).all(last30Days);
    const bounceStats = db.prepare(`
      SELECT DATE(created_at) as date, classification, COUNT(*) as count
      FROM bounces
      WHERE created_at > ?
      GROUP BY DATE(created_at), classification
      ORDER BY date
    `).all(last30Days);
    return { dailyStats, bounceStats };
  });

  app.get('/api/analytics/top-domains', async (request) => {
    const domains = db.prepare(`
      SELECT
        substr(email, instr(email, '@') + 1) as domain,
        COUNT(DISTINCT r.id) as recipients,
        COUNT(DISTINCT CASE WHEN a.kind = 'open' THEN a.id END) as opens,
        COUNT(DISTINCT CASE WHEN a.kind = 'click' THEN a.id END) as clicks
      FROM recipients r
      LEFT JOIN analytics_events a ON r.id = a.recipient_id
      WHERE r.suppressed = 0 AND r.consent_confirmed = 1
      GROUP BY domain
      ORDER BY opens DESC
      LIMIT 20
    `).all();
    return domains;
  });

  // ── Bounce Classification + Auto-Suppression ──
  app.post('/api/bounces/classify', async (request) => {
    const body = request.body || {};
    const { reason, kind } = body;
    if (!reason) fail('reason required');
    const reasonLower = String(reason).toLowerCase();
    let classification = 'technical';
    let suppressionAction = 'retained';
    if (reasonLower.includes('5.1.1') || reasonLower.includes('user unknown') || reasonLower.includes('mailbox not found') || reasonLower.includes('no such user') || reasonLower.includes('invalid recipient') || reasonLower.includes('does not exist')) {
      classification = 'hard';
      suppressionAction = 'auto_suppressed';
    } else if (reasonLower.includes('mailbox full') || reasonLower.includes('quota exceeded') || reasonLower.includes('over quota') || reasonLower.includes('temporarily unavailable') || reasonLower.includes('try again later')) {
      classification = 'soft';
      suppressionAction = 'retained';
    } else if (reasonLower.includes('spam') || reasonLower.includes('blocked') || reasonLower.includes('rejected') || reasonLower.includes('policy') || reasonLower.includes('blacklist') || reasonLower.includes('rbl')) {
      classification = 'spam';
      suppressionAction = 'flagged';
    } else if (reasonLower.includes('abuse') || reasonLower.includes('complaint') || reasonLower.includes('fraud') || reasonLower.includes('phishing') || reasonLower.includes('scam')) {
      classification = 'complaint';
      suppressionAction = 'auto_suppressed';
    }
    return { classification, suppressionAction };
  });

  app.post('/api/webhooks/fbl', async (request) => {
    if (!config.webhookToken) fail('FBL webhook is not configured', 503);
    if (!tokensEqual(request.headers['x-webhook-token'], config.webhookToken)) fail('Unauthorized', 401);
    const body = request.body || {};
    const { email, reason, headers } = body;
    if (!email) fail('email required');
    const address = String(email).toLowerCase();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO bounces (email, kind, reason, classification, suppression_action, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(address, 'complaint', reason || 'FBL complaint', 'complaint', 'auto_suppressed', now);
    const recipient = db.prepare('SELECT id, complaint_count FROM recipients WHERE email = ?').get(address);
    if (recipient) {
      const newComplaintCount = (recipient.complaint_count || 0) + 1;
      db.prepare('UPDATE recipients SET complaint_count = ?, last_complaint_at = ? WHERE id = ?')
        .run(newComplaintCount, now, recipient.id);
      suppress(address, reason || 'FBL complaint', 'complaint');
    }
    emit('bounce', { email: address, reason: reason || 'FBL complaint', kind: 'complaint', classification: 'complaint', suppressionAction: 'auto_suppressed' });
    return { ok: true };
  });

  app.post('/api/recipients/:id/retry-soft-bounce', async (request) => {
    const recipientId = Number(request.params.id);
    const recipient = db.prepare('SELECT id, email, bounce_count FROM recipients WHERE id = ?').get(recipientId);
    if (!recipient) fail('Recipient not found');
    const bounceCount = Number(request.body?.bounceCount) || recipient.bounce_count || 1;
    const backoffMinutes = Math.pow(2, Math.min(bounceCount, 5)); // 1, 2, 4, 8, 16, 32 max
    const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    const res = db.prepare("UPDATE deliveries SET status = 'queued', next_attempt_at = ?, error = NULL WHERE recipient_id = ? AND status = 'failed'").run(nextAttempt, recipientId);
    if (res.changes) worker.kick();
    return { nextAttempt, backoffMinutes, rescheduled: res.changes };
  });

  // ── SMTP account pool ──
  function accountView(row) {
    return {
      id: row.id, label: row.label, host: row.host, port: row.port, secure: Boolean(row.secure),
      username: row.username, hasPassword: Boolean(row.password_encrypted),
      fromName: row.from_name, fromEmail: row.from_email, replyTo: row.reply_to,
      enabled: Boolean(row.enabled), weight: row.weight, fails: row.fails,
      cooldownUntil: row.cooldown_until, lastCheck: row.last_check || null, lastError: row.last_error || '', createdAt: row.created_at,
      authType: row.auth_type || 'password', msClientId: row.ms_client_id || '', hasMsRt: Boolean(row.ms_rt_encrypted),
      dailyQuota: row.daily_quota || 0, sentToday: row.sent_today || 0, sentDate: row.sent_date || '',
    };
  }

  function seedPoolFromLegacy() {
    const count = db.prepare('SELECT COUNT(*) AS c FROM smtp_accounts').get().c;
    if (count) return;
    const legacy = db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
    if (legacy) {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO smtp_accounts (label, host, port, secure, username, password_encrypted, from_name, from_email, reply_to, enabled, weight, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
        .run('Primary', legacy.host, legacy.port, legacy.secure, legacy.username, legacy.password_encrypted, legacy.from_name, legacy.from_email, legacy.reply_to || '', now, now);
    }
  }

  app.get('/api/smtp/accounts', async () => {
    seedPoolFromLegacy();
    return { accounts: db.prepare('SELECT * FROM smtp_accounts ORDER BY id').all().map(accountView) };
  });

  function accountBody(body, current = null) {
    const password = String(body.password || '');
    // blank password = unauthenticated relay (e.g. Google SMTP relay IP allowlist)
    return {
      label: text(body.label || '', 'label', 120),
      host: text(body.host, 'host', 253, true),
      port: Number(body.port),
      secure: body.secure === true ? 1 : 0,
      username: text(body.username || '', 'username', 320),
      passwordEncrypted: password ? encryptSecret(password, config.credentialKey) : (current?.password_encrypted || ''),
      fromName: text(body.fromName || '', 'fromName', 200),
      fromEmail: email(body.fromEmail, 'fromEmail'),
      replyTo: body.replyTo ? email(body.replyTo, 'replyTo') : '',
      enabled: body.enabled === false ? 0 : 1,
      weight: Math.min(100, Math.max(1, Number(body.weight) || 1)),
    };
  }

  app.post('/api/smtp/accounts', async (request) => {
    const a = accountBody(request.body || {});
    if (!Number.isInteger(a.port) || a.port < 1 || a.port > 65535) fail('Port is invalid');
    const now = new Date().toISOString();
    const r = db.prepare(`INSERT INTO smtp_accounts (label, host, port, secure, username, password_encrypted, from_name, from_email, reply_to, enabled, weight, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.label, a.host, a.port, a.secure, a.username, a.passwordEncrypted, a.fromName, a.fromEmail, a.replyTo, a.enabled, a.weight, now, now);
    return { id: Number(r.lastInsertRowid) };
  });

  // ── SMTP pool bulk import ──
  // One account per line: host|port|user|pass|from. Accepts | , ; : tab as
  // separators; from is optional and defaults to the login address.
  function splitSmtpLine(line) {
    const raw = String(line || '').trim();
    if (!raw || raw.startsWith('#')) return null;
    const sep = ['|', '\t', ';', ','].find((s) => raw.includes(s));
    if (sep) {
      const parts = raw.split(sep).map((p) => p.trim());
      if (parts.length < 4) return null;
      const [host, port, user] = parts;
      if (parts.length >= 5) {
        return { host, port, user, pass: parts.slice(3, -1).join(sep), from: parts[parts.length - 1] };
      }
      return { host, port, user, pass: parts.slice(3).join(sep), from: '' };
    }
    // colon form — a password may itself contain colons, so keep the tail whole
    const rawParts = raw.split(':').map((p) => p.trim());
    if (rawParts.length < 4) return null;
    const [host, port] = rawParts;
    const rest = rawParts.slice(2);
    const userIdx = rest.findIndex((p) => p.includes('@'));
    if (userIdx < 0) return null;
    const user = rest[userIdx];
    const after = rest.slice(userIdx + 1);
    let from = '';
    if (after.length >= 2 && after[after.length - 1].includes('@')) from = after.pop();
    return { host, port, user, pass: after.join(':'), from };
  }

  app.post('/api/smtp/accounts/import', async (request) => {
    const body = request.body || {};
    const quota = Math.min(1000000, Math.max(0, Number(body.dailyQuota ?? body.quota) || 0));
    const lines = String(body.data || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) fail('Nothing to import — paste host|port|user|pass|from lines');
    if (lines.length > 500) fail('Max 500 accounts per import');
    const results = [];
    let imported = 0, updated = 0;
    const now = new Date().toISOString();
    for (const line of lines) {
      const p = splitSmtpLine(line);
      if (!p) { results.push({ ok: false, error: 'unparseable line', line: line.slice(0, 80) }); continue; }
      const host = String(p.host || '').replace(/^smtps?:\/\//i, '').replace(/\/.*$/, '').trim();
      const port = Number(p.port);
      const username = String(p.user || '').trim();
      const password = String(p.pass || '');
      const fromEmail = String(p.from || (username.includes('@') ? username : '')).trim().toLowerCase();
      if (!host) { results.push({ ok: false, error: 'host missing', line: line.slice(0, 80) }); continue; }
      if (!Number.isInteger(port) || port < 1 || port > 65535) { results.push({ ok: false, error: `port invalid (${p.port})`, line: host }); continue; }
      if (!username) { results.push({ ok: false, error: 'username missing', line: host }); continue; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) { results.push({ ok: false, error: 'from email missing/invalid — use host:port:user:pass:from', line: username }); continue; }
      const secure = port === 465 ? 1 : 0;
      const existing = db.prepare("SELECT id FROM smtp_accounts WHERE auth_type = 'password' AND host = ? AND port = ? AND username = ?").get(host, port, username);
      try {
        if (existing) {
          db.prepare(`UPDATE smtp_accounts SET password_encrypted = ?, from_email = ?, enabled = 1,
            fails = 0, cooldown_until = NULL, last_error = '', updated_at = ? WHERE id = ?`)
            .run(password ? encryptSecret(password, config.credentialKey) : '', fromEmail, now, existing.id);
          updated++;
          results.push({ ok: true, updated: true, id: existing.id, email: username });
        } else {
          const r = db.prepare(`INSERT INTO smtp_accounts (label, host, port, secure, username, password_encrypted, from_name, from_email, reply_to, enabled, weight, daily_quota, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, '', ?, '', 1, 1, ?, ?, ?)`)
            .run(`${host}:${port}`, host, port, secure, username, password ? encryptSecret(password, config.credentialKey) : '', fromEmail, quota, now, now);
          imported++;
          results.push({ ok: true, id: Number(r.lastInsertRowid), email: username });
        }
      } catch (err) {
        results.push({ ok: false, error: String(err.message || err).slice(0, 160), line: username });
      }
    }
    const failed = results.filter((r) => !r.ok).length;
    emit('info', { message: `SMTP import — ${imported} added, ${updated} updated, ${failed} failed` });
    return { imported, updated, failed, results };
  });

  app.put('/api/smtp/accounts/:id', async (request) => {
    const id = Number(request.params.id);
    const current = db.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(id);
    if (!current) fail('Account not found', 404);
    const a = accountBody(request.body || {}, current);
    if (!Number.isInteger(a.port) || a.port < 1 || a.port > 65535) fail('Port is invalid');
    db.prepare(`UPDATE smtp_accounts SET label=?, host=?, port=?, secure=?, username=?, password_encrypted=?, from_name=?, from_email=?, reply_to=?, enabled=?, weight=?, updated_at=? WHERE id=?`)
      .run(a.label, a.host, a.port, a.secure, a.username, a.passwordEncrypted, a.fromName, a.fromEmail, a.replyTo, a.enabled, a.weight, new Date().toISOString(), id);
    if (request.body?.dailyQuota !== undefined) {
      db.prepare('UPDATE smtp_accounts SET daily_quota = ? WHERE id = ?').run(Math.min(1000000, Math.max(0, Number(request.body.dailyQuota) || 0)), id);
    }
    const freshRt = String(request.body?.refreshToken || '').trim();
    if (freshRt && current.auth_type === 'ms_rt') {
      db.prepare(`UPDATE smtp_accounts SET ms_rt_encrypted = ?, fails = 0, cooldown_until = NULL,
        last_error = '', updated_at = ? WHERE id = ?`)
        .run(encryptSecret(freshRt, config.credentialKey), new Date().toISOString(), id);
    }
    return { ok: true };
  });

  app.delete('/api/smtp/accounts/:id', async (request) => {
    db.prepare('DELETE FROM smtp_accounts WHERE id = ?').run(Number(request.params.id));
    return { ok: true };
  });

  app.post('/api/smtp/accounts/:id/reset-quota', async (request) => {
    db.prepare("UPDATE smtp_accounts SET sent_today = 0, sent_date = '' WHERE id = ?").run(Number(request.params.id));
    return { ok: true };
  });

  // ── MS refresh-token mailbox import ──
  // Accepts one or many lines: JSON {client_id, refresh_token, tenant?, email?},
  // or delimited strings where the client_id is the GUID and the refresh_token is
  // the longest remaining segment (covers client_id:rt, email:cid:rt, cid|rt, etc).
  const MS_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function parseMsRtLine(line) {
    line = String(line || '').trim();
    if (!line) return null;
    if (line.startsWith('{')) {
      try {
        const j = JSON.parse(line);
        // prefer mail-scoped RT when a tool dumps both
        const rt = j.mail_refresh_token || j.refresh_token || j.refreshToken || '';
        const secret = j.client_secret || j.clientSecret || j.secret || '';
        let clientId = j.client_id || j.clientId || j.appid || '';
        let tenant = j.tenant || j.tid || 'common';
        // harvest claims from an embedded JWT when top-level fields are absent
        if (j.access_token?.startsWith('eyJ')) {
          try {
            const claims = JSON.parse(Buffer.from(j.access_token.split('.')[1], 'base64url').toString());
            clientId = clientId || claims.appid || '';
            tenant = j.tenant || claims.tid || tenant;
          } catch {}
        }
        if (clientId && secret) return { type: 'cc', clientId, secret, tenant, email: j.email || j.mail || '' };
        if (rt) {
          return {
            type: 'rt', clientId: clientId || '', rt, tenant: j.tenant || j.tid || '',
            email: j.email || j.mail || j.username || '', bare: !clientId,
          };
        }
        // access-token-only dumps (app/delegated) — nothing renewable to store
        if (j.access_token && !rt) return { clientId, rt: '', tenant, email: '', error: 'access_token only — expires ~1h and has no refresh token; need the refresh_token for import' };
      } catch {}
      return null;
    }
    const parts = line.split(/[:\t|,;]+/).map((p) => p.trim()).filter(Boolean);
    const guids = parts.filter((p) => MS_GUID.test(p));
    const emailPart = parts.find((p) => p.includes('@')) || '';
    const nonGuids = parts.filter((p) => !MS_GUID.test(p) && !p.includes('@'));
    const longest = nonGuids.slice().sort((a, b) => b.length - a.length)[0] || '';
    // A refresh token is long and usually starts with 1./0./M. A client secret
    // is short-ish and has no prefix. This tells the two apart.
    const looksRt = (s) => /^(1|0|M)\./.test(s) || s.length >= 100;
    // email : client_id : tenant : refresh_token
    if (guids.length >= 2 && looksRt(longest)) {
      return { type: 'rt', clientId: guids[0], rt: longest, tenant: guids[1], email: emailPart };
    }
    // two GUIDs + a non-token value → client_id : secret : tenant (app credentials)
    if (guids.length >= 2 && nonGuids.length) {
      if (longest.length >= 10) return { type: 'cc', clientId: guids[0], secret: longest, tenant: guids[1], email: emailPart };
    }
    // one GUID → client_id : refresh_token
    const clientId = guids[0] || '';
    if (clientId && looksRt(longest)) {
      return { type: 'rt', clientId, rt: longest, tenant: 'common', email: emailPart };
    }
    // bare refresh token ("1.xxx…" or "M.C…") — no client/tenant embedded;
    // the importer probes the common public clients and, when an email is
    // supplied, resolves the tenant from its domain.
    const bare = emailPart && parts.length >= 2
      ? parts.filter((p) => p !== emailPart).sort((a, b) => b.length - a.length)[0]
      : line;
    if (/^([10M])\.[A-Za-z0-9._\-]{40,}$/.test(bare)) {
      return { type: 'rt', clientId: '', rt: bare, tenant: '', email: emailPart, bare: true };
    }
    return null;
  }

  const makeMsInserter = (quota) => (authType, clientId, secret, tenant, email, name) => {
    const dup = db.prepare('SELECT id FROM smtp_accounts WHERE auth_type = ? AND ms_client_id = ? AND username = ?').get(authType, clientId, email);
    const now = new Date().toISOString();
    if (dup) {
      // Re-importing the same mailbox replaces its credential. This is how a
      // revoked/expired MS RT token gets fixed without deleting the account.
      db.prepare(`UPDATE smtp_accounts SET label = COALESCE(NULLIF(?, ''), label), from_name = COALESCE(NULLIF(?, ''), from_name),
        ms_rt_encrypted = ?, ms_tenant = ?, enabled = 1, fails = 0, cooldown_until = NULL, last_error = '', updated_at = ? WHERE id = ?`)
        .run(name || '', name || '', encryptSecret(secret, config.credentialKey), tenant, now, dup.id);
      return { ok: true, updated: true, id: dup.id, email, name };
    }
    const r = db.prepare(`INSERT INTO smtp_accounts (label, host, port, secure, username, password_encrypted, from_name, from_email, reply_to, enabled, weight, auth_type, ms_client_id, ms_rt_encrypted, ms_tenant, daily_quota, created_at, updated_at)
      VALUES (?, 'graph.microsoft.com', 443, 1, ?, '', ?, ?, '', 1, 1, ?, ?, ?, ?, ?, ?, ?)`)
      .run(name || email, email, name || '', email, authType, clientId, encryptSecret(secret, config.credentialKey), tenant, quota, now, now);
    return { ok: true, id: Number(r.lastInsertRowid), email, name };
  };

  // Probe an imported MS mailbox — if its credential is admin-grade, take the
  // org over and bulk-import every eligible member mailbox on the same secret.
  app.post('/api/smtp/accounts/:id/probe', async (request) => {
    const row = db.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(Number(request.params.id));
    if (!row) fail('Account not found', 404);
    if (row.auth_type !== 'ms_rt' && row.auth_type !== 'ms_cc') fail('Probe only applies to Microsoft accounts');
    const secret = decryptSecret(row.ms_rt_encrypted || '', config.credentialKey);
    if (!secret) fail('Account has no stored credential');
    const tenant = row.ms_tenant || 'common';
    let org;
    try {
      org = row.auth_type === 'ms_cc'
        ? await msCcListMailboxes(row.ms_client_id, secret, tenant)
        : await msRtListOrgMailboxes(row.ms_client_id, secret, tenant);
    } catch (e) {
      return { ok: true, admin: false, error: String(e.message || e).slice(0, 200) };
    }
    const insert = makeMsInserter(row.daily_quota || 10000);
    const results = [];
    for (const mb of org) {
      if (mb.email.toLowerCase() === row.username.toLowerCase()) continue;
      results.push(insert(row.auth_type, row.ms_client_id, secret, tenant, mb.email, mb.displayName));
    }
    const imported = results.filter((r) => r.ok);
    return { ok: true, admin: true, orgSize: org.length, imported: imported.length, results };
  });

  // Extract a mailbox's personal contacts into a named mail list.
  // Extract a mailbox's personal contacts — three-phase job so the client can
  // show live progress: pull (async) → poll status → save to a named list.
  const extractJobs = new Map();
  app.post('/api/smtp/accounts/:id/extract-contacts', async (request) => {
    const row = db.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(Number(request.params.id));
    if (!row) fail('Account not found', 404);
    if (row.auth_type !== 'ms_rt' && row.auth_type !== 'ms_cc') fail('Extraction only applies to Microsoft accounts');
    const body = request.body || {};
    const phase = String(body.phase || 'pull');

    if (phase === 'pull') {
      const secret = decryptSecret(row.ms_rt_encrypted || '', config.credentialKey);
      if (!secret) fail('Account has no stored credential');
      const tenant = row.ms_tenant || 'common';
      const job = { id: randomUUID(), fetched: 0, total: 0, status: 'pulling', error: '', contacts: null, owner: row.label || row.username, createdAt: Date.now() };
      extractJobs.set(job.id, job);
      setTimeout(() => extractJobs.delete(job.id), 30 * 60 * 1000);
      (row.auth_type === 'ms_cc'
        ? msCcListContacts(row.ms_client_id, secret, tenant, row.username, (n) => { job.fetched = n; })
        : msRtListContacts(row.ms_client_id, secret, tenant, (n) => { job.fetched = n; })
      ).then(({ contacts, total }) => {
        job.contacts = [...new Map(contacts.map((c) => [c.email, c])).values()];
        job.fetched = job.contacts.length;
        job.total = total || job.contacts.length;
        job.status = 'done';
      }).catch((e) => { job.status = 'failed'; job.error = String(e.message || e).slice(0, 300); });
      return { jobId: job.id, owner: job.owner };
    }

    if (phase === 'pullsave') {
      // Synchronous single-shot — used by the AI task scheduler.
      const secret = decryptSecret(row.ms_rt_encrypted || '', config.credentialKey);
      if (!secret) fail('Account has no stored credential');
      const tenant = row.ms_tenant || 'common';
      const { contacts } = row.auth_type === 'ms_cc'
        ? await msCcListContacts(row.ms_client_id, secret, tenant, row.username)
        : await msRtListContacts(row.ms_client_id, secret, tenant);
      const unique = [...new Map(contacts.map((c) => [c.email, c])).values()];
      if (!unique.length) return { ok: true, imported: 0, merged: 0, list: '', note: 'mailbox has no contacts' };
      const listName = text(body.list || '', 'list', 80) || row.label || row.username;
      const now = new Date().toISOString();
      let inserted = 0, merged = 0;
      transaction(db, () => {
        const stmt = db.prepare(`
          INSERT INTO recipients (email, first_name, last_name, company, custom_json, consent_confirmed, list_name, created_at, updated_at)
          VALUES (?, ?, ?, '', '{}', 1, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET list_name = excluded.list_name, updated_at = excluded.updated_at`);
        for (const c of unique) {
          const existed = db.prepare('SELECT id FROM recipients WHERE email = ?').get(c.email);
          stmt.run(c.email, c.displayName, '', listName, now, now);
          if (existed) merged++; else inserted++;
        }
      });
      return { ok: true, imported: inserted, merged, total: unique.length, list: listName };
    }

    const job = extractJobs.get(String(body.jobId || ''));
    if (!job) fail('Extract job not found or expired — pull again', 404);
    if (job.status !== 'done') fail('Contacts still pulling', 400);

    if (phase === 'download') {
      return { contacts: job.contacts || [], owner: job.owner };
    }

    if (phase === 'save') {
      const unique = job.contacts || [];
      if (!unique.length) return { ok: true, imported: 0, merged: 0, list: '', note: 'mailbox has no contacts' };
      const listName = text(body.list || '', 'list', 80) || job.owner;
      const now = new Date().toISOString();
      let inserted = 0, merged = 0;
      transaction(db, () => {
        const stmt = db.prepare(`
          INSERT INTO recipients (email, first_name, last_name, company, custom_json, consent_confirmed, list_name, created_at, updated_at)
          VALUES (?, ?, ?, '', '{}', 1, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET list_name = excluded.list_name, updated_at = excluded.updated_at`);
        for (const c of unique) {
          const existed = db.prepare('SELECT id FROM recipients WHERE email = ?').get(c.email);
          stmt.run(c.email, c.displayName, '', listName, now, now);
          if (existed) merged++; else inserted++;
        }
      });
      extractJobs.delete(job.id);
      return { ok: true, imported: inserted, merged, total: unique.length, list: listName };
    }

    fail('phase must be pull, download or save');
  });

  app.get('/api/smtp/accounts/:id/extract-contacts/:jobId', async (request) => {
    const job = extractJobs.get(String(request.params.jobId));
    if (!job) fail('Extract job not found or expired', 404);
    return { status: job.status, fetched: job.fetched, total: job.total, error: job.error, owner: job.owner };
  });

  app.post('/api/smtp/accounts/import-ms', async (request) => {
    const body = request.body || {};
    const quota = Math.min(100000, Math.max(0, Number(body.quota) || 10000));
    let raw = String(body.data || '').trim();
    // rubicon_backup blob — regex-extract the payload regardless of field order
    // (vault exports put "version"/"created_at" before the data key, and huge
    // blobs may arrive truncated mid-JSON where a full parse dies)
    const b64hit = raw.match(/"rubicon_backup"\s*:\s*"([A-Za-z0-9+/=\s]{100,})"/);
    if (b64hit) {
      try { raw = gunzipSync(Buffer.from(b64hit[1].replace(/\s/g, ''), 'base64')).toString('utf8').trim(); } catch {}
    } else try {
      const blob = JSON.parse(raw);
      if (blob && typeof blob.rubicon_backup === 'string') {
        raw = gunzipSync(Buffer.from(blob.rubicon_backup, 'base64')).toString('utf8').trim();
      }
    } catch {}
    // vault/array exports: {"version":"…","mailboxes":[{…},{…}]} or a bare
    // array of credential objects → flatten each element to a JSON line
    if (/^\s*(\{|\[)/.test(raw)) {
      try {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed
          : parsed && Object.values(parsed).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
        if (Array.isArray(arr)) raw = arr.map((o) => JSON.stringify(o)).join('\n');
      } catch {}
    }
    // single whole-paste JSON blob (possibly pretty-printed across lines)
    if (raw.startsWith('{')) {
      try { JSON.parse(raw); raw = raw.replace(/\s*\n\s*/g, ''); } catch {}
    }
    // multi-object paste: extract every balanced {...} block, keep any plain
    // lines that sit between them (mixed dumps)
    let lines;
    {
      const objs = [];
      let depth = 0, start = -1;
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '{') { if (depth === 0) start = i; depth++; }
        else if (raw[i] === '}' && depth > 0) { depth--; if (depth === 0) objs.push(raw.slice(start, i + 1)); }
      }
      if (objs.length) {
        let rest = raw;
        for (const o of objs) rest = rest.replace(o, '\n');
        lines = objs.concat(rest.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^[{}\[\],]+$/.test(l)));
      } else {
        lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      }
    }
    if (!lines.length) fail('Nothing to import — paste client_id:refresh_token lines or JSON');
    if (lines.length > 200) fail('Max 200 mailboxes per import');
    const results = [];
    const insertMsAccount = makeMsInserter(quota);
    for (const line of lines) {
      const parsed = parseMsRtLine(line);
      if (!parsed) { results.push({ ok: false, error: 'unparseable line', line: line.slice(0, 60) }); continue; }
      if (parsed.error) { results.push({ ok: false, error: parsed.error, line: parsed.clientId || line.slice(0, 60) }); continue; }
      try {
        // App credentials: explicit mailbox or enumerate the tenant (User.Read.All)
        if (parsed.type === 'cc') {
          const mailboxes = parsed.email
            ? [await msCcVerifyMailbox(parsed.clientId, parsed.secret, parsed.tenant, parsed.email)]
            : await msCcListMailboxes(parsed.clientId, parsed.secret, parsed.tenant);
          if (!mailboxes.length) { results.push({ ok: false, error: 'tenant returned no mailboxes', line: parsed.clientId }); continue; }
          for (const mb of mailboxes) {
            results.push(insertMsAccount('ms_cc', parsed.clientId, parsed.secret, parsed.tenant, mb.email, mb.displayName));
          }
          // Smart detection — creds handed us one mailbox but may be tenant-wide:
          // if they can enumerate the org, take it over and import every member mailbox.
          if (parsed.email) {
            try {
              const org = await msCcListMailboxes(parsed.clientId, parsed.secret, parsed.tenant);
              const extra = org.filter((m) => m.email.toLowerCase() !== mailboxes[0].email.toLowerCase());
              if (extra.length) {
                results.push({ ok: true, email: '', name: '', admin: true, note: `admin creds detected — org takeover: ${extra.length} more mailbox(es)` });
                for (const mb of extra) results.push(insertMsAccount('ms_cc', parsed.clientId, parsed.secret, parsed.tenant, mb.email, mb.displayName));
              }
            } catch { /* single-mailbox creds — fine */ }
          }
          continue;
        }
        // Bare RT: resolve the tenant from the mailbox domain (when given) and
        // let the importer probe the public client ids for a working one.
        const hintEmail = parsed.email || String(body.email || '').trim();
        const hintedTenant = String(body.tenant || '').trim();
        const tenant = parsed.tenant || hintedTenant || (hintEmail ? await msTenantFromEmail(hintEmail) : '');
        const clientId = parsed.clientId || String(body.clientId || '').trim();
        const info = await msRtMailboxInfo(clientId, parsed.rt, tenant || 'common');
        const sender = info.email || hintEmail;
        if (!sender) { results.push({ ok: false, error: 'mailbox email not resolvable', line: clientId }); continue; }
        const inserted = insertMsAccount('ms_rt', info.clientId || clientId, parsed.rt, info.tenant || tenant || 'common', sender, info.displayName);
        results.push(inserted);
        // Smart detection — token that can read the org directory is admin-grade:
        // enumerate member mailboxes and import them bound to the same credential.
        if (inserted.ok) {
          try {
            const org = await msRtListOrgMailboxes(info.clientId || clientId, parsed.rt, info.tenant || tenant || 'common');
            const extra = org.filter((m) => m.email.toLowerCase() !== sender.toLowerCase());
            if (extra.length) {
              results.push({ ok: true, email: '', name: '', admin: true, note: `admin mailbox detected — org takeover: ${extra.length} more mailbox(es)` });
              for (const mb of extra) results.push(insertMsAccount('ms_rt', info.clientId || clientId, parsed.rt, info.tenant || tenant || 'common', mb.email, mb.displayName));
            }
          } catch { /* plain mailbox, no directory rights — fine */ }
        }
      } catch (err) {
        results.push({ ok: false, error: String(err.message || err).slice(0, 200), line: parsed.clientId });
      }
    }
    const msImported = results.filter((r) => r.ok).length;
    const msFailed = results.filter((r) => !r.ok).length;
    emit('info', { message: `MS mailbox import — ${msImported} added/updated, ${msFailed} failed` });
    return { imported: msImported, failed: msFailed, results };
  });

  // Send settings (delivery config)
  app.get('/api/settings', async () => ({ sendSettings: publicSendSettings(db, config) }));

  app.post('/api/settings/dkim-generate', async (request, reply) => {
    const domain = String(request.body?.domain || '').trim().toLowerCase();
    const selector = String(request.body?.selector || '').trim().toLowerCase() || 'rbc';
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return reply.code(400).send({ error: 'Valid DKIM domain required (e.g. yourdomain.com)' });
    if (!/^[a-z0-9_-]+$/.test(selector)) return reply.code(400).send({ error: 'Selector: letters, digits, - and _ only' });
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const pubDer = createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
    const pubB64 = Buffer.from(pubDer).toString('base64');
    db.prepare('UPDATE send_settings SET dkim_enabled=1, dkim_domain=?, dkim_selector=?, dkim_key_encrypted=?, updated_at=? WHERE id=1')
      .run(domain, selector, encryptSecret(privateKey, config.credentialKey), new Date().toISOString());
    return { ok: true, domain, selector, publicKey: pubB64 };
  });

  app.put('/api/settings', async (request) => {
    // publicSendSettings exposes secret fields as boolean flags (aiKey: true) —
    // never let those sentinel values blend into the write body.
    const { aiKey: _aiKeyFlag, ...publicDefaults } = publicSendSettings(db, config);
    const body = { ...publicDefaults, ...(request.body || {}) };
    const allowedModes = ['smtp', 'direct', 'relay', 'socks5', 'graph', 'gmail', 'api'];
    const sendMode = allowedModes.includes(body.sendMode) ? body.sendMode : 'smtp';
    const allowedEncodings = ['base64', '8bit', 'quoted-printable'];
    const encoding = allowedEncodings.includes(body.encoding) ? body.encoding : 'base64';
    const allowedSendTypes = ['to', 'cc', 'bcc'];
    const sendType = allowedSendTypes.includes(body.sendType) ? body.sendType : 'to';
    const encryptModes = ['unicode', 'html_entities'];
    const encryptMode = encryptModes.includes(body.encryptMode) ? body.encryptMode : 'unicode';

    const directFromEmail = body.directFromEmail ? email(body.directFromEmail, 'directFromEmail') : '';
    const directReplyTo = body.directReplyTo ? email(body.directReplyTo, 'directReplyTo') : '';
    const relayPort = Number(body.relayPort) || 25;
    const directRate = Math.min(600, Math.max(1, Number(body.directRatePerMinute) || 10));
    const priority = [1, 2, 3].includes(Number(body.priority)) ? Number(body.priority) : 3;
    const sleepMs = Math.max(0, Number(body.sleepMs) || 0);

    let customHeaders = [];
    try { customHeaders = Array.isArray(body.customHeaders) ? body.customHeaders : JSON.parse(body.customHeaders || '[]'); } catch {}
    let fromNames = [];
    try { fromNames = Array.isArray(body.fromNames) ? body.fromNames : JSON.parse(body.fromNames || '[]'); } catch {}
    let subjectsList = [];
    try { subjectsList = Array.isArray(body.subjectsList) ? body.subjectsList : JSON.parse(body.subjectsList || '[]'); } catch {}

    const testEvery = Math.max(1, Number(body.testEvery) || 100);
    const testDestination = body.testDestination ? text(body.testDestination, 'testDestination', 254) : '';

    const spoofFromName = text(body.spoofFromName || '', 'spoofFromName', 200);
    const spoofFromEmail = body.spoofFromEmail ? email(body.spoofFromEmail, 'spoofFromEmail') : '';
    const spoofReplyTo = body.spoofReplyTo ? email(body.spoofReplyTo, 'spoofReplyTo') : '';
    const returnPath = body.returnPath ? email(body.returnPath, 'returnPath') : '';
    const msgidDomain = text(body.msgidDomain || '', 'msgidDomain', 253);
    const xMailer = text(body.xMailer || '', 'xMailer', 100);
    const clickTrackerUrl = text(body.clickTrackerUrl || '', 'clickTrackerUrl', 1000);
    const dkimDomain = text(body.dkimDomain || '', 'dkimDomain', 253);
    const dkimSelector = text(body.dkimSelector || '', 'dkimSelector', 100);

    // DKIM private key: keep existing if blank, encrypt new if provided
    const currentDkim = db.prepare('SELECT dkim_key_encrypted FROM send_settings WHERE id = 1').get();
    const dkimKeyEncrypted = body.dkimPrivateKey
      ? encryptSecret(String(body.dkimPrivateKey), config.credentialKey)
      : (currentDkim?.dkim_key_encrypted || '');

    // AI key: keep existing if blank, encrypt new if provided (string only — the
    // public view's aiKey:true boolean flag must never be encrypted as a key)
    const currentAi = db.prepare('SELECT ai_key_encrypted FROM send_settings WHERE id = 1').get();
    const aiKeyEncrypted = typeof body.aiKey === 'string' && body.aiKey.trim()
      ? encryptSecret(body.aiKey.trim(), config.credentialKey)
      : (currentAi?.ai_key_encrypted || '');
    // API engine key — same keep-existing-if-blank rule
    const currentApiKey = db.prepare('SELECT api_key_encrypted FROM send_settings WHERE id = 1').get();
    const apiKeyEncrypted = typeof body.apiKey === 'string' && body.apiKey.trim()
      ? encryptSecret(body.apiKey.trim(), config.credentialKey)
      : (currentApiKey?.api_key_encrypted || '');
    let apiProvider = ['', 'sendgrid', 'postmark', 'brevo', 'sparkpost', 'elastic', 'mandrill', 'mailgun', 'ses', 'custom'].includes(body.apiProvider) ? body.apiProvider : '';
    if (body.sendMode === 'api' && !apiProvider) apiProvider = 'sendgrid';

    db.prepare(`
      INSERT INTO send_settings (id, send_mode, direct_from_name, direct_from_email, direct_reply_to, direct_rate_per_minute,
        relay_host, relay_port, socks5_proxy, encoding, priority, send_type, sleep_ms,
        encrypt_letter, encrypt_mode, fromname_encrypt, subject_encrypt, custom_headers_enabled, custom_headers_json,
        timezone, test_email_enabled, test_every, test_destination, from_names_json, subjects_json, redirect_url,
        spoof_from_name, spoof_from_email, spoof_reply_to, return_path, msgid_domain, x_mailer,
        fake_received, dkim_enabled, dkim_domain, dkim_selector, dkim_key_encrypted, text_only,
        track_opens, track_clicks, click_tracker_url,
        parallel_sends, html_randomize, spam_bypass, subject_b64, fromname_b64, disclaimer_text,
        engine_client_id, engine_client_secret_encrypted, engine_tenant, engine_refresh_token_encrypted,
        engine_send_as, attach_formats_json, image_recompress,
        send_days_json, send_from_min, send_to_min, max_per_hour, max_per_day,
        warmup_enabled, warmup_started_at, link_cloak, cloak_base,
        api_provider, api_key_encrypted, api_user, api_domain, api_url,
        ai_endpoint, ai_key_encrypted, ai_model, ai_rules,
        relay_secure, relay_username, relay_password_encrypted, relay_ehlo,
        updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        send_mode=excluded.send_mode, direct_from_name=excluded.direct_from_name, direct_from_email=excluded.direct_from_email,
        direct_reply_to=excluded.direct_reply_to, direct_rate_per_minute=excluded.direct_rate_per_minute,
        relay_host=excluded.relay_host, relay_port=excluded.relay_port,
        socks5_proxy=excluded.socks5_proxy, encoding=excluded.encoding, priority=excluded.priority,
        send_type=excluded.send_type, sleep_ms=excluded.sleep_ms, encrypt_letter=excluded.encrypt_letter,
        encrypt_mode=excluded.encrypt_mode, fromname_encrypt=excluded.fromname_encrypt, subject_encrypt=excluded.subject_encrypt,
        custom_headers_enabled=excluded.custom_headers_enabled, custom_headers_json=excluded.custom_headers_json,
        timezone=excluded.timezone, test_email_enabled=excluded.test_email_enabled, test_every=excluded.test_every,
        test_destination=excluded.test_destination, from_names_json=excluded.from_names_json,
        subjects_json=excluded.subjects_json, redirect_url=excluded.redirect_url,
        spoof_from_name=excluded.spoof_from_name, spoof_from_email=excluded.spoof_from_email,
        spoof_reply_to=excluded.spoof_reply_to, return_path=excluded.return_path,
        msgid_domain=excluded.msgid_domain, x_mailer=excluded.x_mailer,
        fake_received=excluded.fake_received, dkim_enabled=excluded.dkim_enabled,
        dkim_domain=excluded.dkim_domain, dkim_selector=excluded.dkim_selector,
        dkim_key_encrypted=excluded.dkim_key_encrypted, text_only=excluded.text_only,
        track_opens=excluded.track_opens, track_clicks=excluded.track_clicks,
        click_tracker_url=excluded.click_tracker_url,
        parallel_sends=excluded.parallel_sends, html_randomize=excluded.html_randomize,
        spam_bypass=excluded.spam_bypass, subject_b64=excluded.subject_b64,
        fromname_b64=excluded.fromname_b64, disclaimer_text=excluded.disclaimer_text,
        engine_client_id=excluded.engine_client_id, engine_client_secret_encrypted=excluded.engine_client_secret_encrypted,
        engine_tenant=excluded.engine_tenant, engine_refresh_token_encrypted=excluded.engine_refresh_token_encrypted,
        engine_send_as=excluded.engine_send_as, attach_formats_json=excluded.attach_formats_json,
        image_recompress=excluded.image_recompress,
        send_days_json=excluded.send_days_json, send_from_min=excluded.send_from_min,
        send_to_min=excluded.send_to_min, max_per_hour=excluded.max_per_hour,
        max_per_day=excluded.max_per_day, warmup_enabled=excluded.warmup_enabled,
        warmup_started_at=excluded.warmup_started_at, link_cloak=excluded.link_cloak,
        cloak_base=excluded.cloak_base,
        api_provider=excluded.api_provider, api_key_encrypted=excluded.api_key_encrypted,
        api_user=excluded.api_user, api_domain=excluded.api_domain, api_url=excluded.api_url,
        ai_endpoint=excluded.ai_endpoint, ai_key_encrypted=excluded.ai_key_encrypted,
        ai_model=excluded.ai_model, ai_rules=excluded.ai_rules,
        relay_secure=excluded.relay_secure, relay_username=excluded.relay_username,
        relay_password_encrypted=excluded.relay_password_encrypted, relay_ehlo=excluded.relay_ehlo, updated_at=excluded.updated_at
    `).run(
      sendMode,
      text(body.directFromName || '', 'directFromName', 200),
      directFromEmail,
      directReplyTo,
      directRate,
      text(body.relayHost || '', 'relayHost', 253),
      relayPort,
      text(body.socks5Proxy || '', 'socks5Proxy', 500),
      encoding,
      priority,
      sendType,
      sleepMs,
      body.encryptLetter ? 1 : 0,
      encryptMode,
      body.fromNameEncrypt ? 1 : 0,
      body.subjectEncrypt ? 1 : 0,
      body.customHeadersEnabled ? 1 : 0,
      JSON.stringify(customHeaders.slice(0, 20)),
      text(body.timezone || 'UTC', 'timezone', 100),
      body.testEmailEnabled ? 1 : 0,
      testEvery,
      testDestination,
      JSON.stringify(fromNames.filter(Boolean).slice(0, 50)),
      JSON.stringify(subjectsList.filter(Boolean).slice(0, 50)),
      text(body.redirectUrl || '', 'redirectUrl', 1000),
      spoofFromName,
      spoofFromEmail,
      spoofReplyTo,
      returnPath,
      msgidDomain,
      xMailer,
      body.fakeReceived ? 1 : 0,
      body.dkimEnabled ? 1 : 0,
      dkimDomain,
      dkimSelector,
      dkimKeyEncrypted,
      body.textOnly ? 1 : 0,
      body.trackOpens ? 1 : 0,
      body.trackClicks ? 1 : 0,
      clickTrackerUrl,
      Math.min(30, Math.max(1, Number(body.parallelSends) || 1)),
      body.htmlRandomize ? 1 : 0,
      body.spamBypass ? 1 : 0,
      body.subjectB64 ? 1 : 0,
      body.fromnameB64 ? 1 : 0,
      text(body.disclaimerText || '', 'disclaimerText', 5000),
      text(body.engineClientId || '', 'engineClientId', 200),
      typeof body.engineClientSecret === 'string' && body.engineClientSecret.trim() ? encryptSecret(body.engineClientSecret.trim(), config.credentialKey) : (db.prepare('SELECT engine_client_secret_encrypted FROM send_settings WHERE id = 1').get()?.engine_client_secret_encrypted || ''),
      text(body.engineTenant || '', 'engineTenant', 200),
      typeof body.engineRefreshToken === 'string' && body.engineRefreshToken.trim() ? encryptSecret(body.engineRefreshToken.trim(), config.credentialKey) : (db.prepare('SELECT engine_refresh_token_encrypted FROM send_settings WHERE id = 1').get()?.engine_refresh_token_encrypted || ''),
      body.engineSendAs ? email(body.engineSendAs, 'engineSendAs') : '',
      JSON.stringify((Array.isArray(body.attachFormats) ? body.attachFormats : []).filter((f) => ['eml', 'docx', 'pdf', 'ics'].includes(f))),
      body.imageRecompress ? 1 : 0,
      JSON.stringify((Array.isArray(body.sendDays) ? body.sendDays : []).map(Number).filter((d) => d >= 1 && d <= 7)),
      Math.min(1439, Math.max(0, Number(body.sendFromMin ?? 480))),
      Math.min(1439, Math.max(0, Number(body.sendToMin ?? 1200))),
      Math.min(100000, Math.max(0, Number(body.maxPerHour ?? 5000))),
      Math.min(1000000, Math.max(0, Number(body.maxPerDay ?? 50000))),
      body.warmupEnabled ? 1 : 0,
      text(body.warmupStartedAt || db.prepare('SELECT warmup_started_at FROM send_settings WHERE id = 1').get()?.warmup_started_at || '', 'warmupStartedAt', 40),
      body.linkCloak ? 1 : 0,
      text(body.cloakBase || '', 'cloakBase', 500),
      apiProvider,
      apiKeyEncrypted,
      text(body.apiUser || '', 'apiUser', 320),
      text(body.apiDomain || '', 'apiDomain', 253),
      text(body.apiUrl || '', 'apiUrl', 1000),
      text(body.aiEndpoint || '', 'aiEndpoint', 1000),
      aiKeyEncrypted,
      text(body.aiModel || '', 'aiModel', 200),
      text(body.aiRules || '', 'aiRules', 60000),
      [0, 1, 2].includes(Number(body.relaySecure)) ? Number(body.relaySecure) : 0,
      text(body.relayUsername || '', 'relayUsername', 320),
      typeof body.relayPassword === 'string' && body.relayPassword.trim() ? encryptSecret(body.relayPassword.trim(), config.credentialKey) : (db.prepare('SELECT relay_password_encrypted FROM send_settings WHERE id = 1').get()?.relay_password_encrypted || ''),
      text(body.relayEhlo || '', 'relayEhlo', 253),
      new Date().toISOString(),
    );
    if (body.scheduleEnabled !== undefined) {
      db.prepare("INSERT INTO integrations (key, value) VALUES ('schedule_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(body.scheduleEnabled === false || body.scheduleEnabled === 'false' || body.scheduleEnabled === 0 ? '0' : '1');
    }
    if (body.capsEnabled !== undefined) {
      db.prepare("INSERT INTO integrations (key, value) VALUES ('caps_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(body.capsEnabled === true || body.capsEnabled === 'true' || body.capsEnabled === 1 ? '1' : '0');
    }
    const poolIds = Array.isArray(body.poolAccountIds) ? body.poolAccountIds.map((a) => Number(a)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300) : [];
    db.prepare("INSERT INTO integrations (key, value) VALUES ('pool_account_ids', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(poolIds));
    if (body.providerRates && typeof body.providerRates === 'object') {
      const rates = {};
      for (const [k, v] of Object.entries(body.providerRates)) {
        const name = String(k).toLowerCase().trim().slice(0, 60);
        const perMin = Math.min(600, Math.max(0, Number(v) || 0));
        if (name && perMin > 0) rates[name] = perMin;
      }
      db.prepare("INSERT INTO integrations (key, value) VALUES ('provider_rates', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(rates));
    }
    return { sendSettings: publicSendSettings(db, config) };
  });

  app.post('/api/recipients/import', async (request) => {
    if (request.body?.consentConfirmed !== true) fail('Import requires explicit confirmation that every recipient opted in');
    let parsed;
    try {
      parsed = parseRecipientsCsv(request.body?.csv);
    } catch (strictErr) {
      const loose = parseLooseEmails(request.body?.csv);
      if (loose.records.length) parsed = loose;
      else fail(strictErr.message || 'Invalid CSV', 400);
    }
    const listName = text(request.body?.list || '', 'list', 80);
    const unique = [...new Map(parsed.records.map((record) => [record.email, record])).values()];
    const now = new Date().toISOString();
    transaction(db, () => {
      const statement = db.prepare(`
        INSERT INTO recipients (email, first_name, last_name, company, custom_json, consent_confirmed, list_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
          company = excluded.company, custom_json = excluded.custom_json, consent_confirmed = 1,
          list_name = CASE WHEN excluded.list_name <> '' THEN excluded.list_name ELSE recipients.list_name END,
          updated_at = excluded.updated_at
      `);
      for (const record of unique) statement.run(record.email, record.firstName, record.lastName, record.company, JSON.stringify(record.custom), listName, now, now);
    });
    return { imported: unique.length, duplicates: parsed.records.length - unique.length, errors: parsed.errors, list: listName };
  });

  // Editable recipient fields — name/company corrections and list moves.
  app.put('/api/recipients/:id', async (request) => {
    const id = Number(request.params.id);
    const row = db.prepare('SELECT id FROM recipients WHERE id = ?').get(id);
    if (!row) fail('Recipient not found', 404);
    const body = request.body || {};
    db.prepare(`UPDATE recipients SET first_name = ?, last_name = ?, company = ?, list_name = ?, updated_at = ? WHERE id = ?`)
      .run(text(body.firstName || '', 'firstName', 120), text(body.lastName || '', 'lastName', 120),
        text(body.company || '', 'company', 160), text(body.list || '', 'list', 80), new Date().toISOString(), id);
    return { ok: true };
  });

  // File uploads for campaign attachments (base64 JSON — no multipart dep)
  app.post('/api/uploads', async (request) => {
    const filename = text(request.body?.filename, 'filename', 200, true);
    const contentType = text(request.body?.contentType || 'application/octet-stream', 'contentType', 100);
    const data = String(request.body?.data || '');
    if (!data) fail('data is required');
    const buf = Buffer.from(data, 'base64');
    if (!buf.length) fail('Empty file');
    if (buf.length > MAX_UPLOAD_BYTES) fail('File exceeds 10MB limit');
    const ext = (filename.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1] || 'bin').toLowerCase();
    const stored = `${randomUUID()}.${ext}`;
    writeFileSync(resolve(UPLOADS_DIR, stored), buf);
    return { path: stored, filename, contentType, size: buf.length };
  });

  app.delete('/api/uploads/:name', async (request) => {
    const name = basename(String(request.params.name || ''));
    const p = resolve(UPLOADS_DIR, name);
    if (p.startsWith(UPLOADS_DIR) && existsSync(p)) unlinkSync(p);
    return { ok: true };
  });

  // DNS verification — MX lookup, disposable & role-based detection for arbitrary emails
  const DISPOSABLE_DOMAINS = new Set([
    'mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','temp-mail.org',
    'yopmail.com','throwawaymail.com','sharklasers.com','getnada.com','dispostable.com',
    'fakeinbox.com','maildrop.cc','trashmail.com','mintemail.com','tempinbox.com',
  ]);
  const ROLE_LOCALS = new Set([
    'admin','administrator','info','support','sales','contact','hello','office','mail',
    'noreply','no-reply','webmaster','postmaster','hostmaster','billing','help','team',
    'service','enquiries','inquiries','marketing','press','media','hr','jobs','careers',
  ]);
  const MX_PROVIDERS = [
    [/google|aspmx|googlemail|gmail/i, 'Google'],
    [/outlook|microsoft|protection\.outlook|mail\.protection/i, 'Microsoft 365'],
    [/yahoodns|yahoo/i, 'Yahoo'],
    [/mimecast/i, 'Mimecast'],
    [/pphosted|proofpoint/i, 'Proofpoint'],
    [/messagelabs|symantec|broadcom/i, 'Broadcom/Symantec'],
    [/zoho/i, 'Zoho'],
    [/secureserver|godaddy/i, 'GoDaddy'],
    [/registrar-servers|namecheap/i, 'Namecheap'],
    [/amazonses|aws/i, 'AWS SES'],
    [/mailgun/i, 'Mailgun'],
    [/sendgrid/i, 'SendGrid'],
    [/ppmx|ppe-hosted/i, 'Proofpoint'],
    [/hornetsecurity|spamfighter/i, 'Hornetsecurity'],
    [/cloudflare|emailsecurity/i, 'Cloudflare'],
    [/zimbra/i, 'Zimbra'],
    [/exchange|owa/i, 'OWA/Exchange'],
  ];

  // Self-hosted webmail (Zimbra, OWA/Exchange) shows the same generic
  // mail.domain.com MX — probe the domain's web root for signatures.
  // Webmail judger — probes mail./webmail. hosts and stack-specific paths.
  // Returns 'OWA/Exchange' | 'Zimbra' | 'Roundcube' | null.
  async function probeWebmail(domain) {
    const tryFetch = async (url, ms = 4000) => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms);
        const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        clearTimeout(timer);
        return { url: res.url || url, body: (await res.text()).slice(0, 300000), headers: res.headers };
      } catch { return null; }
    };
    const judge = (r) => {
      if (!r) return null;
      const hay = `${r.url}\n${r.body}`;
      if (r.headers.get('x-owa-version') || /\/owa(\/|$|\?)|owa\/auth|outlook web app|microsoft\.exchange|OwaPage|exchange server/i.test(hay)) return 'OWA/Exchange';
      if (/\/roundcube|roundcube|rcmail_|_task=mail|rcmbrowser/i.test(hay)) return 'Roundcube';
      if (/\/zimbra|zimbra|zimbraMail|ZM_LOGIN|skin=/i.test(hay)) return 'Zimbra';
      return null;
    };
    const targets = [
      `https://mail.${domain}/owa/auth/logon.aspx`,
      `https://mail.${domain}/owa/`,
      `https://webmail.${domain}/`,
      `https://mail.${domain}/`,
      `https://${domain}/owa/`,
      `https://${domain}/`,
    ];
    const results = await Promise.all(targets.map((t) => tryFetch(t, 1800).then(judge)));
    return results.find(Boolean) || null;
  }

  const mxResolver = new Resolver({ timeout: 1500, tries: 1 });
  const mxGlobalCache = new Map(); // domain -> { info, at } — repeat verify/sort runs skip resolved domains for 1h
  const MX_CACHE_TTL = 60 * 60 * 1000;

  async function mxInfo(domain) {
    const hit = mxGlobalCache.get(domain);
    if (hit && Date.now() - hit.at < MX_CACHE_TTL) return hit.info;
    let info;
    try {
      const records = await mxResolver.resolveMx(domain);
      records.sort((a, b) => a.priority - b.priority);
      const exchange = records[0]?.exchange || '';
      let provider = MX_PROVIDERS.find(([re]) => re.test(exchange))?.[1] || 'Other/Custom';
      if (provider === 'Other/Custom') provider = (await probeWebmail(domain)) || provider;
      info = { hasMx: true, mx: exchange, provider };
    } catch {
      info = { hasMx: false, mx: '', provider: 'No MX' };
    }
    if (mxGlobalCache.size > 60000) mxGlobalCache.clear();
    mxGlobalCache.set(domain, { info, at: Date.now() });
    return info;
  }

  app.get('/api/recipients', async (request) => {
    const offset = Math.max(0, Number(request.query.offset) || 0);
    const limit = Math.min(2000, Math.max(1, Number(request.query.limit) || 1000));
    const tier = String(request.query.tier || 'all');
    const lookup = String(request.query.email || '').trim().toLowerCase();
    const list = String(request.query.list || '').trim();
    const where = ['1=1'];
    const params = [];
    if (lookup) { where.push('LOWER(email) = ?'); params.push(lookup); }
    if (list === '__none__') where.push("list_name = ''");
    else if (list) { where.push('list_name = ?'); params.push(list); }
    if (tier === 'hot') where.push('engagement_score >= 70');
    else if (tier === 'warm') where.push('engagement_score BETWEEN 31 AND 69');
    else if (tier === 'cold') where.push('engagement_score < 31');
    const cond = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS c FROM recipients WHERE ${cond}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM recipients WHERE ${cond} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset).map(recipientView);
    return { recipients: rows, total, offset, limit };
  });

  app.post('/api/recipients/verify', async (request) => {
    let emails = Array.isArray(request.body?.emails) ? request.body.emails : [];
    if (request.body?.all === true) emails = db.prepare('SELECT email FROM recipients').all().map((r) => r.email);
    emails = emails.slice(0, 200000);
    emit('sorter', { message: `verify started — ${emails.length} addresses` });
    const domains = [...new Set(emails.map((e) => String(e).split('@')[1]?.toLowerCase()).filter(Boolean))];
    const mxCache = {};
    const CONCURRENCY = 64;
    let done = 0;
    for (let i = 0; i < domains.length; i += CONCURRENCY) {
      await Promise.all(domains.slice(i, i + CONCURRENCY).map(async (d) => { mxCache[d] = await mxInfo(d); }));
      done += Math.min(CONCURRENCY, domains.length - i);
      if (done % 320 < CONCURRENCY || done === domains.length) emit('sorter', { message: `verify ${done}/${domains.length} domains resolved` });
    }
    const results = emails.map((raw) => {
      const addr = String(raw).toLowerCase();
      const [local, domain] = addr.split('@');
      const mx = mxCache[domain] || { hasMx: false, mx: '', provider: 'No MX' };
      return {
        email: addr,
        valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr),
        hasMx: mx.hasMx,
        mx: mx.mx,
        provider: mx.provider,
        disposable: DISPOSABLE_DOMAINS.has(domain),
        roleBased: ROLE_LOCALS.has(local),
      };
    });
    const flagged = results.filter((r) => !r.hasMx || r.disposable || r.roleBased || !r.valid).length;
    emit('sorter', { message: `verify done — ${results.length} checked, ${flagged} flagged` });
    return { results, total: results.length, flagged };
  });

  // Standalone sorter — paste raw emails, get provider buckets + flags. Does not touch the contacts table.
  app.post('/api/sorter', async (request) => {
    const raw = String(request.body?.text || '').slice(0, 5000000);
    emit('sorter', { message: `sort started — ${(raw.length / 1024).toFixed(0)}KB of input` });
    const found = raw.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [];
    emit('sorter', { message: `extracted ${found.length} address candidates` });
    const seen = new Set();
    const emails = [];
    let dupes = 0;
    for (const e of found) {
      const addr = e.toLowerCase();
      if (seen.has(addr)) { dupes++; continue; }
      seen.add(addr);
      emails.push(addr);
    }
    if (emails.length > 50000) fail('Max 50,000 unique emails per sort', 400);
    emit('sorter', { message: `deduped — ${emails.length} unique (${dupes} dupes dropped)` });
    const invalid = [], disposable = [], roleBased = [], valid = [];
    for (const addr of emails) {
      const [local, domain] = addr.split('@');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) { invalid.push(addr); continue; }
      if (DISPOSABLE_DOMAINS.has(domain)) { disposable.push(addr); continue; }
      if (ROLE_LOCALS.has(local)) roleBased.push(addr);
      valid.push(addr);
    }
    const domains = [...new Set(valid.map((e) => e.split('@')[1]))].slice(0, 600);
    emit('sorter', { message: `flagged ${invalid.length} invalid · ${disposable.length} disposable · ${roleBased.length} role — resolving ${domains.length} domains` });
    const mxCache = {};
    const CONCURRENCY = 64;
    for (let i = 0; i < domains.length; i += CONCURRENCY) {
      await Promise.all(domains.slice(i, i + CONCURRENCY).map(async (d) => {
        mxCache[d] = await mxInfo(d);
        const info = mxCache[d];
        emit('sorter', { message: `${info.hasMx ? '✓' : '✗'} ${d} → ${info.hasMx ? info.provider : 'no MX'}` });
      }));
    }
    emit('sorter', { message: `MX pass complete — bucketing ${valid.length} clean addresses` });
    const FREEMAIL = new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','yahoo.fr','ymail.com','rocketmail.com','outlook.com','hotmail.com','live.com','msn.com','aol.com','icloud.com','me.com','mac.com','protonmail.com','proton.me','pm.me','mail.com','gmx.com','gmx.net','zoho.com','yandex.com','yandex.ru','mail.ru','bk.ru','inbox.ru','list.ru','tutanota.com','tuta.io','fastmail.com','comcast.net','verizon.net','att.net','sbcglobal.net','bellsouth.net','earthlink.net','cox.net','charter.net','spectrum.net','shaw.ca','rogers.com','telus.net','sympatico.ca','btinternet.com','sky.com','talktalk.net','virginmedia.com','ntlworld.com','orange.fr','free.fr','wanadoo.fr','laposte.net','sfr.fr','web.de','t-online.de','gmx.de','freenet.de','libero.it','virgilio.it','tiscali.it','alice.it','terra.com.br','uol.com.br','bol.com.br','ig.com.br','globo.com','globomail.com','naver.com','daum.net','hanmail.net','qq.com','163.com','126.com','sina.com','sohu.com','rediffmail.com','hotmail.co.uk','hotmail.fr','hotmail.de','hotmail.es','hotmail.it','live.co.uk','live.fr','live.de','outlook.fr','outlook.de','outlook.es']);
    const buckets = {};
    const bucketMx = {};
    const domainCounts = {};
    const tldCounts = {};
    let freemailCount = 0, businessCount = 0;
    for (const addr of valid) {
      const domain = addr.split('@')[1];
      const info = mxCache[domain] || { hasMx: false, mx: '', provider: 'Unsorted (domain cap)' };
      const key = info.hasMx ? info.provider : 'No MX';
      (buckets[key] = buckets[key] || []).push(addr);
      if (info.hasMx && info.mx && !bucketMx[key]) bucketMx[key] = info.mx;
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      const tld = domain.split('.').pop();
      tldCounts[tld] = (tldCounts[tld] || 0) + 1;
      if (FREEMAIL.has(domain)) freemailCount++; else businessCount++;
    }
    const ordered = Object.fromEntries(Object.entries(buckets).sort((a, b) => b[1].length - a[1].length));
    const providers = Object.entries(ordered).map(([name, list]) => ({
      name, count: list.length, share: valid.length ? Math.round((list.length / valid.length) * 1000) / 10 : 0, mx: bucketMx[name] || '',
    }));
    const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([domain, count]) => ({ domain, count, provider: (mxCache[domain] || {}).provider || '—' }));
    const topTlds = Object.entries(tldCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([tld, count]) => ({ tld, count }));
    const WEBMAIL_STACKS = new Set(['OWA/Exchange', 'Zimbra', 'Roundcube']);
    const judged = Object.entries(mxCache)
      .filter(([, info]) => WEBMAIL_STACKS.has(info.provider))
      .map(([domain, info]) => ({ domain, stack: info.provider, count: domainCounts[domain] || 0, mx: info.mx }))
      .sort((a, b) => b.count - a.count);
    emit('sorter', { message: `done — ${providers.length} provider bucket(s) · ${judged.length} judged webmail domain(s) · ${valid.length} clean` });
    return {
      total: found.length, unique: emails.length, dupes,
      buckets: ordered, invalid, disposable, roleBased,
      providers, topDomains, topTlds, freemailCount, businessCount, judged,
      clean: valid.filter((e) => !roleBased.includes(e) && (buckets['No MX'] || []).indexOf(e) === -1 && (buckets['Unsorted (domain cap)'] || []).indexOf(e) === -1),
    };
  });

  // Email sorter — classify stored recipient list by provider via MX
  app.post('/api/recipients/classify', async (request) => {
    const rows = db.prepare('SELECT id, email FROM recipients').all();
    const domains = [...new Set(rows.map((r) => r.email.split('@')[1]?.toLowerCase()).filter(Boolean))];
    const mxCache = {};
    const CONCURRENCY = 64;
    for (let i = 0; i < domains.length; i += CONCURRENCY) {
      await Promise.all(domains.slice(i, i + CONCURRENCY).map(async (d) => { mxCache[d] = await mxInfo(d); }));
    }
    const update = db.prepare("UPDATE recipients SET custom_json = json_set(COALESCE(custom_json,'{}'), '$.provider', ?) WHERE id = ?");
    const counts = {};
    for (const r of rows) {
      const domain = r.email.split('@')[1]?.toLowerCase() || '';
      const provider = mxCache[domain]?.provider || 'Unknown';
      counts[provider] = (counts[provider] || 0) + 1;
      update.run(provider, r.id);
    }
    return { classified: rows.length, counts };
  });

  app.post('/api/recipients/:id/suppress', async (request) => {
    const result = db.prepare("UPDATE recipients SET suppressed = 1, suppression_reason = 'Manually suppressed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), Number(request.params.id));
    if (!result.changes) fail('Recipient not found', 404);
    return { ok: true };
  });

  app.post('/api/recipients/:id/unsuppress', async (request) => {
    const result = db.prepare("UPDATE recipients SET suppressed = 0, suppression_reason = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), Number(request.params.id));
    if (!result.changes) fail('Recipient not found', 404);
    return { ok: true };
  });

  app.delete('/api/recipients/:id', async (request) => {
    const result = db.prepare('DELETE FROM recipients WHERE id = ?').run(Number(request.params.id));
    if (!result.changes) fail('Recipient not found', 404);
    return { ok: true };
  });

  app.delete('/api/recipients', async () => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM recipients').get().c;
    db.prepare('DELETE FROM recipients').run();
    return { ok: true, deleted: count };
  });

  app.post('/api/campaigns', async (request) => {
    const campaign = campaignBody(request.body || {});
    const now = new Date().toISOString();
    const result = db.prepare("INSERT INTO campaigns (name, subject, preheader, html, text, attachments_json, providers_json, lists_json, accounts_json, accounts_random, tiers_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").run(campaign.name, campaign.subject, campaign.preheader, campaign.html, campaign.text, JSON.stringify(campaign.attachments || []), JSON.stringify(campaign.providers || []), JSON.stringify(campaign.lists || []), JSON.stringify(campaign.accounts || []), campaign.accountsRandom ? 1 : 0, JSON.stringify(campaign.tiers || []), now, now);
    return { id: Number(result.lastInsertRowid) };
  });

  app.put('/api/campaigns/:id', async (request) => {
    const id = Number(request.params.id);
    const existing = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(id);
    if (!existing) fail('Campaign not found', 404);
    if (!['draft', 'failed', 'scheduled'].includes(existing.status)) fail('Only draft, scheduled or failed campaigns can be edited');
    const campaign = campaignBody(request.body || {});
    db.prepare('UPDATE campaigns SET name = ?, subject = ?, preheader = ?, html = ?, text = ?, attachments_json = ?, providers_json = ?, lists_json = ?, accounts_json = ?, accounts_random = ?, tiers_json = ?, updated_at = ? WHERE id = ?').run(campaign.name, campaign.subject, campaign.preheader, campaign.html, campaign.text, JSON.stringify(campaign.attachments || []), JSON.stringify(campaign.providers || []), JSON.stringify(campaign.lists || []), JSON.stringify(campaign.accounts || []), campaign.accountsRandom ? 1 : 0, JSON.stringify(campaign.tiers || []), new Date().toISOString(), id);
    return { id };
  });

  app.post('/api/campaigns/:id/duplicate', async (request) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(request.params.id));
    if (!campaign) fail('Campaign not found', 404);
    const now = new Date().toISOString();
    const result = db.prepare("INSERT INTO campaigns (name, subject, preheader, html, text, attachments_json, providers_json, lists_json, accounts_json, accounts_random, tiers_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").run(`${campaign.name} copy`.slice(0, 120), campaign.subject, campaign.preheader || '', campaign.html, campaign.text, campaign.attachments_json || '[]', campaign.providers_json || '[]', campaign.lists_json || '[]', campaign.accounts_json || '[]', campaign.accounts_random || 0, campaign.tiers_json || '[]', now, now);
    return { id: Number(result.lastInsertRowid) };
  });

  app.post('/api/preview', async (request) => mailer.preview(campaignBody(request.body || {})));

  app.post('/api/campaigns/:id/queue', async (request) => {
    const id = Number(request.params.id);
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) fail('Campaign not found', 404);
    if (campaign.status !== 'draft') fail('Only a draft campaign can be queued');
    if (!campaign.subject?.trim()) fail('Campaign has no subject');
    if (!campaign.html?.trim() && !campaign.text?.trim()) fail('Campaign has no content');
    const settings = publicSendSettings(db, config);
    if (settings.sendMode === 'smtp' && !db.prepare('SELECT 1 FROM smtp_settings WHERE id = 1').get() && !db.prepare('SELECT 1 FROM smtp_accounts LIMIT 1').get()) fail('Configure SMTP before queueing');
    if (settings.sendMode === 'relay' && !settings.relayHost) fail('Configure relay host before queueing');
    if ((settings.sendMode === 'direct' || settings.sendMode === 'socks5' || settings.sendMode === 'relay') && !settings.directFromEmail) fail('Configure direct sending from-email before queueing');
    if (settings.sendMode === 'graph' && (!settings.engineClientId || !settings.engineClientSecret || !settings.engineTenant)) fail('Configure Graph engine credentials before queueing');
    if (settings.sendMode === 'gmail' && (!settings.engineClientId || !settings.engineClientSecret || !settings.engineRefreshToken)) fail('Configure Gmail engine credentials before queueing');
    if (settings.sendMode === 'api' && (!settings.apiProvider || (settings.apiProvider !== 'custom' && !db.prepare('SELECT api_key_encrypted FROM send_settings WHERE id = 1').get()?.api_key_encrypted))) fail('Configure the API engine provider and key before queueing');
    if (settings.sendMode === 'api' && !settings.directFromEmail) fail('Configure a from/direct email before queueing');
    let providers = [], lists = [];
    try { providers = JSON.parse(campaign.providers_json || '[]').filter((p) => typeof p === 'string' && p); } catch {}
    try { lists = JSON.parse(campaign.lists_json || '[]').filter((l) => typeof l === 'string' && l); } catch {}
    const conds = ['consent_confirmed = 1', 'suppressed = 0', 'valid_syntax = 1'];
    const condParams = [];
    if (providers.length) { conds.push(`json_extract(COALESCE(custom_json,'{}'), '$.provider') IN (${providers.map(() => '?').join(',')})`); condParams.push(...providers); }
    if (lists.length) { conds.push(`list_name IN (${lists.map(() => '?').join(',')})`); condParams.push(...lists); }
    let tiers = [];
    try { tiers = JSON.parse(campaign.tiers_json || '[]').filter((t) => ['hot', 'warm', 'cold'].includes(t)); } catch {}
    if (tiers.length) {
      const bits = [];
      if (tiers.includes('hot')) bits.push('engagement_score >= 70');
      if (tiers.includes('warm')) bits.push('(engagement_score BETWEEN 31 AND 69)');
      if (tiers.includes('cold')) bits.push('engagement_score < 31');
      if (bits.length) conds.push(`(${bits.join(' OR ')})`);
    }
    const recipients = db.prepare(`SELECT id FROM recipients WHERE ${conds.join(' AND ')}`).all(...condParams);
    if (!recipients.length) fail(providers.length || lists.length || tiers.length ? 'No confirmed, unsuppressed recipients in the selected audience' : 'No confirmed, unsuppressed recipients are available');
    let scheduledFor = null;
    if (request.body?.scheduledFor) {
      const timestamp = Date.parse(request.body.scheduledFor);
      if (!Number.isFinite(timestamp)) fail('Scheduled date is invalid');
      if (timestamp < Date.now() - 60000) fail('Scheduled date cannot be in the past');
      scheduledFor = new Date(timestamp).toISOString();
    }
    const variants = db.prepare('SELECT id, is_winner FROM subject_variants WHERE campaign_id = ? ORDER BY id').all(id);
    const winner = variants.find((v) => v.is_winner);
    transaction(db, () => {
      const flipped = db.prepare("UPDATE campaigns SET status = 'queued', scheduled_for = ?, updated_at = ? WHERE id = ? AND status = 'draft'").run(scheduledFor, new Date().toISOString(), id);
      if (!flipped.changes) fail('Campaign is no longer a draft', 409);
      const statement = db.prepare('INSERT INTO deliveries (campaign_id, recipient_id, variant_id) VALUES (?, ?, ?)');
      recipients.forEach((recipient, i) => {
        const variantId = winner ? winner.id : (variants.length ? variants[i % variants.length].id : null);
        statement.run(id, recipient.id, variantId);
      });
      if (scheduledFor) db.prepare("UPDATE campaigns SET status = 'scheduled' WHERE id = ?").run(id);
    });
    emit('campaign_queued', { campaignId: id, name: campaign.name, subject: campaign.subject, total: recipients.length, scheduledFor });
    // SMTP runs are preflighted at launch: log each sender's health, drop dead
    // ones from the campaign, then start only if something is still live.
    // Graph and the other engines keep their existing behaviour.
    let preflight = null;
    if (!scheduledFor && settings.sendMode === 'smtp' && typeof worker.preflight === 'function') {
      preflight = await worker.preflight(id, { force: true });
    }
    worker.kick();
    return { id, queued: recipients.length, scheduledFor, preflight };
  });

  app.post('/api/campaigns/:id/pause', async (request) => {
    const result = db.prepare("UPDATE campaigns SET paused = 1, updated_at = ? WHERE id = ? AND status IN ('queued', 'scheduled', 'sending')").run(new Date().toISOString(), Number(request.params.id));
    if (!result.changes) fail('Campaign not found or not active', 404);
    return { ok: true, paused: true };
  });

  app.post('/api/campaigns/:id/resume', async (request) => {
    const result = db.prepare("UPDATE campaigns SET paused = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), Number(request.params.id));
    if (!result.changes) fail('Campaign not found', 404);
    return { ok: true, paused: false };
  });

  app.delete('/api/campaigns/:id', async (request) => {
    const id = Number(request.params.id);
    const campaign = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(id);
    if (!campaign) fail('Campaign not found', 404);
    if (['queued', 'scheduled', 'sending'].includes(campaign.status)) fail('Cancel the campaign before deleting it', 409);
    transaction(db, () => {
      db.prepare('DELETE FROM deliveries WHERE campaign_id = ?').run(id);
      db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    });
    return { ok: true };
  });

  app.post('/api/campaigns/:id/retry', async (request) => {
    const id = Number(request.params.id);
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) fail('Campaign not found', 404);
    if (campaign.status !== 'failed') fail('Only a failed campaign can be retried', 409);
    const pending = db.prepare("SELECT COUNT(*) AS c FROM deliveries WHERE campaign_id = ? AND status IN ('queued', 'sending')").get(id).c;
    if (!pending) fail('No pending deliveries left to send', 409);
    db.prepare("UPDATE campaigns SET status = 'queued', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    if (worker.recheck) worker.recheck(id);
    worker.kick();
    emit('campaign_queued', { campaignId: id, name: campaign.name, subject: campaign.subject, total: pending, retried: true });
    return { id, queued: pending };
  });

  app.post('/api/campaigns/:id/cancel', async (request) => {
    const id = Number(request.params.id);
    const result = transaction(db, () => {
      const changed = db.prepare("UPDATE campaigns SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('queued', 'scheduled', 'sending')").run(new Date().toISOString(), id);
      if (changed.changes) db.prepare("UPDATE deliveries SET status = 'cancelled' WHERE campaign_id = ? AND status = 'queued'").run(id);
      return changed.changes;
    });
    if (!result) fail('Campaign is not active', 409);
    return { ok: true };
  });

  app.get('/api/campaigns/:id/export', async (request, reply) => {
    const id = Number(request.params.id);
    const rows = db.prepare(`
      SELECT r.email, r.first_name AS firstName, r.last_name AS lastName, d.status, d.attempts,
        d.error, d.provider_message_id AS providerMessageId, d.sent_at AS sentAt
      FROM deliveries d JOIN recipients r ON r.id = d.recipient_id WHERE d.campaign_id = ? ORDER BY d.id
    `).all(id);
    if (!rows.length && !db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(id)) fail('Campaign not found', 404);
    const columns = ['email', 'firstName', 'lastName', 'status', 'attempts', 'error', 'providerMessageId', 'sentAt'];
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [columns.map(quote).join(','), ...rows.map((row) => columns.map((column) => quote(row[column])).join(','))].join('\r\n');
    return reply.type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="campaign-${id}.csv"`).send(csv);
  });

  function suppress(address, reason, kind = 'bounce') {
    const normalized = email(address);
    const now = new Date().toISOString();
    transaction(db, () => {
      db.prepare('UPDATE recipients SET suppressed = 1, suppression_reason = ?, updated_at = ? WHERE email = ?').run(reason, now, normalized);
      db.prepare("UPDATE deliveries SET status = 'suppressed' WHERE status = 'queued' AND recipient_id IN (SELECT id FROM recipients WHERE email = ?)").run(normalized);
      db.prepare('INSERT INTO bounces (email, kind, reason, created_at) VALUES (?, ?, ?, ?)').run(normalized, kind, reason, now);
    });
  }

  app.post('/api/webhooks/bounce', async (request) => {
    if (!config.webhookToken) fail('Bounce webhook is not configured', 503);
    if (!tokensEqual(request.headers['x-webhook-token'], config.webhookToken)) fail('Unauthorized', 401);
    const kind = request.body?.kind === 'complaint' ? 'complaint' : 'bounce';
    const reason = text(request.body?.reason, 'reason', 1000) || kind;
    const address = String(request.body?.email || '').toLowerCase();
    const now = new Date().toISOString();

    // Classify bounce type
    let classification = 'technical';
    let suppressionAction = 'retained';
    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes('5.1.1') || reasonLower.includes('user unknown') || reasonLower.includes('mailbox not found') || reasonLower.includes('no such user') || reasonLower.includes('invalid recipient')) {
      classification = 'hard';
      suppressionAction = 'auto_suppressed';
    } else if (reasonLower.includes('mailbox full') || reasonLower.includes('quota exceeded') || reasonLower.includes('over quota')) {
      classification = 'soft';
      suppressionAction = 'retained';
    } else if (reasonLower.includes('spam') || reasonLower.includes('blocked') || reasonLower.includes('rejected') || reasonLower.includes('policy')) {
      classification = 'spam';
      suppressionAction = 'flagged';
    } else if (reasonLower.includes('abuse') || reasonLower.includes('complaint') || reasonLower.includes('fraud')) {
      classification = 'complaint';
      suppressionAction = 'auto_suppressed';
    }

    // Update bounce record with classification
    const bounceResult = db.prepare('INSERT INTO bounces (email, kind, reason, classification, suppression_action, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(address, kind, reason, classification, suppressionAction, now);
    const bounceId = bounceResult.lastInsertRowid;

    // Update recipient bounce/complaint counts
    const recipient = db.prepare('SELECT id, bounce_count, complaint_count, last_complaint_at FROM recipients WHERE email = ?').get(address);
    if (recipient) {
      const newBounceCount = (recipient.bounce_count || 0) + 1;
      const newComplaintCount = kind === 'complaint' ? (recipient.complaint_count || 0) + 1 : (recipient.complaint_count || 0);
      db.prepare('UPDATE recipients SET bounce_count = ?, last_bounce_at = ?, complaint_count = ?, last_complaint_at = ? WHERE id = ?')
        .run(newBounceCount, now, newComplaintCount, kind === 'complaint' ? now : recipient.last_complaint_at || '', recipient.id);
    }

    // Auto-suppress hard bounces and complaints
    if (suppressionAction === 'auto_suppressed') {
      suppress(address, reason, kind);
    }

    emit('bounce', { email: address, reason, kind, classification, suppressionAction, bounceId });
    return { ok: true, bounceId, classification, suppressionAction };
  });

  // 1x1 transparent GIF for open tracking
  const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

  app.get('/api/track/open', async (request, reply) => {
    const address = String(request.query?.e || '').toLowerCase();
    const token = String(request.query?.t || '');
    const campaignId = Number(request.query?.c) || null;
    if (address && tokensEqual(token, unsubscribeToken(address, config.unsubscribeSecret))) {
      try {
        const recipient = db.prepare('SELECT id, engagement_score, engagement_events_json FROM recipients WHERE email = ?').get(address);
        db.prepare('INSERT INTO tracking_events (campaign_id, email, kind, created_at) VALUES (?, ?, ?, ?)').run(campaignId, address, 'open', new Date().toISOString());
        db.prepare('INSERT INTO analytics_events (campaign_id, kind, recipient_id, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?)').run(campaignId, 'open', recipient?.id || null, new Date().toISOString(), JSON.stringify({ email: address }));
        const opens = db.prepare("SELECT COUNT(*) AS c FROM tracking_events WHERE kind = 'open' AND email = ? AND campaign_id IS ?").get(address, campaignId).c;
        if (opens === 1) {
          const camp = campaignId ? db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) : null;
          emit('open', { campaignId, email: address, name: camp?.name });
        }
        if (recipient) {
          const events = JSON.parse(recipient.engagement_events_json || '[]');
          events.push({ kind: 'open', at: new Date().toISOString() });
          const newScore = Math.min(100, (recipient.engagement_score || 0) + 10);
          db.prepare('UPDATE recipients SET engagement_score = ?, engagement_events_json = ?, last_engaged_at = ? WHERE id = ?')
            .run(newScore, JSON.stringify(events), new Date().toISOString(), recipient.id);
          const variant = campaignId ? db.prepare('SELECT variant_id FROM deliveries WHERE campaign_id = ? AND recipient_id = ?').get(campaignId, recipient.id) : null;
          if (variant?.variant_id) db.prepare('UPDATE subject_variants SET opens = opens + 1 WHERE id = ?').run(variant.variant_id);
        }
        if (campaignId) {
          const hour = new Date().getHours();
          db.prepare('INSERT INTO engagement_heatmap (campaign_id, hour, opens, clicks, created_at) VALUES (?, ?, 1, 0, ?) ON CONFLICT(campaign_id, hour) DO UPDATE SET opens = opens + 1')
            .run(campaignId, hour, new Date().toISOString());
        }
      } catch {}
    }
    return reply.type('image/gif').header('cache-control', 'no-store, no-cache, must-revalidate').header('pragma', 'no-cache').send(PIXEL_GIF);
  });

  app.get('/api/track/click', async (request, reply) => {
    const address = String(request.query?.e || '').toLowerCase();
    const token = String(request.query?.t || '');
    const campaignId = Number(request.query?.c) || null;
    const target = Buffer.from(String(request.query?.u || ''), 'base64url').toString('utf8');
    if (address && tokensEqual(token, unsubscribeToken(address, config.unsubscribeSecret)) && /^https?:\/\//i.test(target)) {
      try {
        const recipient = db.prepare('SELECT id, engagement_score, engagement_events_json FROM recipients WHERE email = ?').get(address);
        db.prepare('INSERT INTO tracking_events (campaign_id, email, kind, target, created_at) VALUES (?, ?, ?, ?, ?)').run(campaignId, address, 'click', target.slice(0, 2000), new Date().toISOString());
        db.prepare('INSERT INTO analytics_events (campaign_id, kind, recipient_id, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?)').run(campaignId, 'click', recipient?.id || null, new Date().toISOString(), JSON.stringify({ email: address, target }));
        const camp = campaignId ? db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) : null;
        emit('click', { campaignId, email: address, target, name: camp?.name });
        if (recipient) {
          const events = JSON.parse(recipient.engagement_events_json || '[]');
          events.push({ kind: 'click', at: new Date().toISOString() });
          const newScore = Math.min(100, (recipient.engagement_score || 0) + 15);
          db.prepare('UPDATE recipients SET engagement_score = ?, engagement_events_json = ?, last_engaged_at = ? WHERE id = ?')
            .run(newScore, JSON.stringify(events), new Date().toISOString(), recipient.id);
          const variant = campaignId ? db.prepare('SELECT variant_id FROM deliveries WHERE campaign_id = ? AND recipient_id = ?').get(campaignId, recipient.id) : null;
          if (variant?.variant_id) db.prepare('UPDATE subject_variants SET clicks = clicks + 1 WHERE id = ?').run(variant.variant_id);
        }
        if (campaignId) {
          const hour = new Date().getHours();
          db.prepare('INSERT INTO engagement_heatmap (campaign_id, hour, opens, clicks, created_at) VALUES (?, ?, 0, 1, ?) ON CONFLICT(campaign_id, hour) DO UPDATE SET clicks = clicks + 1')
            .run(campaignId, hour, new Date().toISOString());
        }
      } catch {}
      return reply.redirect(target, 302);
    }
    return reply.code(400).send({ error: 'Invalid tracking link' });
  });

  app.get('/api/go', async (request, reply) => {
    const target = String(request.query?.u || '');
    if (/^https?:\/\//i.test(target)) return reply.redirect(target, 302);
    return reply.code(400).send({ error: 'Invalid redirect target' });
  });

  app.get('/api/unsubscribe', async (request, reply) => {
    const address = email(request.query?.email);
    if (!tokensEqual(request.query?.token, unsubscribeToken(address, config.unsubscribeSecret))) fail('Invalid unsubscribe token', 403);
    const action = `/api/unsubscribe?email=${encodeURIComponent(address)}&token=${encodeURIComponent(request.query.token)}`;
    return reply.type('text/html').send(unsubscribePage(`Manage the subscription for ${address}.`, action));
  });

  app.post('/api/unsubscribe', async (request, reply) => {
    const address = email(request.query?.email);
    if (!tokensEqual(request.query?.token, unsubscribeToken(address, config.unsubscribeSecret))) fail('Invalid unsubscribe token', 403);
    suppress(address, 'Unsubscribed by recipient', 'unsubscribe');
    emit('unsubscribe', { email: address });
    return reply.type('text/html').send(unsubscribePage(`${address} has been unsubscribed.`));
  });

  // ── Version / Auto-update ──
  function localCommit() {
    try { return execSync('git rev-parse HEAD', { cwd: APP_ROOT, stdio: 'pipe' }).toString().trim(); }
    catch { return ''; }
  }

  let _pkgVersion = '1.0.0';
  try { _pkgVersion = JSON.parse(readFileSync(resolve(APP_ROOT, 'package.json'), 'utf8')).version; } catch {}

  app.get('/api/version', async () => ({ version: _pkgVersion, commit: localCommit() }));

  app.get('/api/update/check', async () => {
    const local = localCommit();
    let remote = '';
    try {
      const r = await fetch('https://api.github.com/repos/kensdv/RBC-Sender/branches/main', {
        headers: { 'User-Agent': 'rbc-sender-autoupdate/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) { const j = await r.json(); remote = j?.commit?.sha || ''; }
    } catch {}
    let changes = [];
    if (remote && local && local !== remote) {
      try {
        const c = await fetch(`https://api.github.com/repos/kensdv/RBC-Sender/compare/${local}...${remote}`, {
          headers: { 'User-Agent': 'rbc-sender-autoupdate/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (c.ok) {
          const j = await c.json();
          changes = (j.commits || []).map((cm) => String(cm?.commit?.message || '').split('\n')[0]).filter(Boolean).slice(-10);
        }
      } catch {}
    }
    return { upToDate: !remote || local === remote, local, remote, version: _pkgVersion, changes };
  });

  const UPDATE_LOG = resolve(APP_ROOT, 'data', 'update.log');
  app.get('/api/update/status', async () => {
    try { return { log: readFileSync(UPDATE_LOG, 'utf8').slice(-4000) }; } catch { return { log: '' }; }
  });

  app.post('/api/update/apply', async (request, reply) => {
    reply.send({ ok: true, message: 'Update started — the server will restart automatically.' });
    setTimeout(() => {
      const log = [];
      // PM2/systemd service envs often lack the node dir on PATH — resolve npm
      // relative to the running node binary and prepend it so bare `npm` works too.
      const nodeDir = dirname(process.execPath);
      const npmBin = existsSync(resolve(nodeDir, 'npm.cmd')) ? `"${resolve(nodeDir, 'npm.cmd')}"`
        : existsSync(resolve(nodeDir, 'npm')) ? `"${resolve(nodeDir, 'npm')}"` : 'npm';
      const childEnv = { ...process.env, PATH: `${nodeDir}${delimiter}${process.env.PATH || ''}` };
      const runSilent = (cmd) => {
        log.push(`$ ${cmd}`);
        const out = execSync(cmd, { cwd: APP_ROOT, stdio: 'pipe', shell: true, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: childEnv });
        log.push(String(out || '').trim().slice(-3000));
      };
      const save = () => { try { writeFileSync(UPDATE_LOG, log.join('\n')); } catch {} };
      // Mark the log immediately — the status poller must not read a stale
      // FAILED/OK left over from a previous run while this one is working.
      log.push(`[update] STARTED ${new Date().toISOString()}`);
      save();
      try {
        // autostash covers dirty tracked files (package-lock churn); if the reapply
        // conflicts, fall back to discarding local tracked changes — deployed box
        // always wants upstream, data/ is untracked and untouched.
        try { runSilent('git pull --rebase --autostash'); }
        catch { runSilent('git checkout -- .'); runSilent('git pull --rebase'); }
        runSilent(`${npmBin} install --include=dev --no-audit --no-fund`);
        runSilent(`${npmBin} run build`);
        log.push(`[update] OK ${new Date().toISOString()}`);
        save();
        process.exit(0);
      } catch (e) {
        log.push(`[update] FAILED: ${String(e.stderr || e.message).slice(0, 1000)}`);
        save();
      }
    }, 300);
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) request.log.error(error);
    // AI and updater failures are diagnostic — return the real provider/updater
    // message instead of a generic 500 so the UI can show what actually broke.
    const expose = statusCode < 500 || /^\/api\/(ai|update)\b/.test(request.url);
    reply.code(statusCode).send({ error: expose ? (error.message || 'Request failed') : 'Internal server error' });
  });

  const clientDist = resolve('client/dist');
  if (existsSync(clientDist)) await app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith('/api/') || !existsSync(clientDist)) return reply.code(404).send({ error: 'Not found' });
    return reply.sendFile('index.html');
  });

  // ── AI TASKS — scheduled autonomous actions, no operator needed ──
  app.get('/api/ai/tasks', async () => ({
    tasks: db.prepare('SELECT id, text, run_at, repeat, status, last_result, created_at FROM ai_tasks ORDER BY run_at ASC').all(),
  }));

  app.post('/api/ai/tasks', async (request) => {
    const body = request.body || {};
    const taskText = text(body.text, 'text', 2000, true);
    const at = Date.parse(String(body.runAt || ''));
    if (!Number.isFinite(at)) fail('runAt must be a date/time');
    if (at > Date.now() + 366 * 86400000) fail('runAt is too far out');
    const repeat = ['', 'daily', 'weekly'].includes(body.repeat) ? body.repeat : '';
    const now = new Date().toISOString();
    const r = db.prepare('INSERT INTO ai_tasks (text, run_at, repeat, status, last_result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(taskText, new Date(at).toISOString(), repeat, 'pending', '', now, now);
    return { id: Number(r.lastInsertRowid) };
  });

  app.delete('/api/ai/tasks/:id', async (request) => {
    db.prepare('DELETE FROM ai_tasks WHERE id = ?').run(Number(request.params.id));
    return { ok: true };
  });

  // Task → action translation is done by the configured AI; the whitelist of
  // actions then executes through the suite's own API so every safeguard in the
  // endpoints (validation, warm-up, engine checks) still applies.
  const AI_TASK_ROUTES = {
    queue_campaign: (p) => ['POST', `/api/campaigns/${Number(p.campaignId)}/queue`, {}],
    schedule_campaign: (p) => ['POST', `/api/campaigns/${Number(p.campaignId)}/queue`, { scheduledFor: String(p.at || '') }],
    pause_campaign: (p) => ['POST', `/api/campaigns/${Number(p.campaignId)}/pause`, {}],
    resume_campaign: (p) => ['POST', `/api/campaigns/${Number(p.campaignId)}/resume`, {}],
    retry_campaign: (p) => ['POST', `/api/campaigns/${Number(p.campaignId)}/retry`, {}],
    cancel_campaign: (p) => ['POST', `/api/campaigns/${Number(p.campaignId)}/cancel`, {}],
    verify_accounts: () => ['POST', '/api/smtp/verify-all', {}],
    send_test: (p) => ['POST', '/api/test-send', { to: String(p.to || ''), subject: String(p.subject || ''), html: String(p.html || '') }],
    reset_quota: (p) => ['POST', `/api/smtp/accounts/${Number(p.accountId)}/reset-quota`, {}],
    extract_contacts: (p) => ['POST', `/api/smtp/accounts/${Number(p.accountId)}/extract-contacts`, { phase: 'pullsave', list: String(p.list || '') }],
    probe_account: (p) => ['POST', `/api/smtp/accounts/${Number(p.accountId)}/probe`, {}],
  };

  async function callSuite(method, path, body) {
    const res = await fetch(`http://127.0.0.1:${config.port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.dashboardToken}` },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${res.status}`);
    return data;
  }

  let aiTaskRunning = false;
  async function runDueAiTasks() {
    if (aiTaskRunning) return;
    aiTaskRunning = true;
    try {
      const now = new Date().toISOString();
      const due = db.prepare("SELECT * FROM ai_tasks WHERE status = 'pending' AND run_at <= ? ORDER BY run_at LIMIT 5").all(now);
      if (!due.length) return;
      const row = db.prepare('SELECT ai_endpoint, ai_key_encrypted, ai_model FROM send_settings WHERE id = 1').get() || {};
      const endpoint = row.ai_endpoint || '';
      const aiKey = row.ai_key_encrypted && config ? decryptSecret(row.ai_key_encrypted, config.credentialKey) : '';
      const camps = db.prepare("SELECT id, name, subject, status FROM campaigns ORDER BY id DESC LIMIT 20").all();
      const accts = db.prepare("SELECT id, label, username, auth_type, enabled FROM smtp_accounts ORDER BY id LIMIT 40").all();
      for (const task of due) {
        db.prepare("UPDATE ai_tasks SET status = 'running', updated_at = ? WHERE id = ?").run(now, task.id);
        try {
          if (!endpoint || !aiKey) throw new Error('AI not configured — set endpoint + key in SETTINGS');
          const sys = `You are the Rubicon Email Suite scheduler executor. Translate the operator's task into JSON actions and NOTHING else — no prose, no fences.

Reply shape: {"actions":[{"type":"<action>","campaignId":<id>|"accountId":<id>|"at":"<iso>"|"to":"<email>"|"list":"<name>"|"enabled":true}], "note":"<one-line summary>"}

Allowed actions: queue_campaign(campaignId), schedule_campaign(campaignId+at ISO), pause_campaign(campaignId), resume_campaign(campaignId), retry_campaign(campaignId), cancel_campaign(campaignId), verify_accounts(), send_test(to), toggle_account(accountId+enabled), reset_quota(accountId), extract_contacts(accountId+list), probe_account(accountId).
Rules: pick ids ONLY from the state below; if the task names a campaign/account by name or subject, resolve it to its id. Ambiguous or impossible task → {"actions":[],"note":"why it can't run"}. Maximum 5 actions. Never invent ids.

STATE — campaigns: ${JSON.stringify(camps)} | accounts: ${JSON.stringify(accts)} | now: ${now}`;
          const { content } = await aiChatRequest({
            endpoint, aiKey, model: row.ai_model, timeoutMs: 90000,
            messages: [{ role: 'system', content: sys }, { role: 'user', content: task.text }],
          });
          const raw = String(content || '');
          const json = raw.match(/\{[\s\S]*\}/)?.[0];
          if (!json) throw new Error(`executor reply was not JSON: ${raw.slice(0, 120)}`);
          const plan = JSON.parse(json);
          const results = [];
          for (const a of (plan.actions || []).slice(0, 5)) {
            if (a?.type === 'toggle_account') {
              db.prepare('UPDATE smtp_accounts SET enabled = ?, updated_at = ? WHERE id = ?').run(a.enabled !== false ? 1 : 0, new Date().toISOString(), Number(a.accountId));
              results.push('toggle_account: ok');
              continue;
            }
            const route = AI_TASK_ROUTES[a?.type];
            if (!route) { results.push(`${a?.type}: skipped — unknown action`); continue; }
            try {
              const [method, path, body] = route(a);
              await callSuite(method, path, body);
              results.push(`${a.type}: ok`);
            } catch (e) { results.push(`${a.type}: ${String(e.message || e).slice(0, 140)}`); }
          }
          const note = String(plan.note || '').slice(0, 300);
          const lastResult = [note, ...results].filter(Boolean).join(' · ').slice(0, 900);
          emit('ai_task', { taskId: task.id, text: task.text.slice(0, 120), result: lastResult });
          if (task.repeat === 'daily' || task.repeat === 'weekly') {
            const next = new Date(Date.parse(task.run_at) + (task.repeat === 'daily' ? 86400000 : 7 * 86400000));
            db.prepare("UPDATE ai_tasks SET status = 'pending', run_at = ?, last_result = ?, updated_at = ? WHERE id = ?")
              .run(next.toISOString(), lastResult, new Date().toISOString(), task.id);
          } else {
            db.prepare("UPDATE ai_tasks SET status = 'done', last_result = ?, updated_at = ? WHERE id = ?")
              .run(lastResult, new Date().toISOString(), task.id);
          }
        } catch (e) {
          db.prepare("UPDATE ai_tasks SET status = 'failed', last_result = ?, updated_at = ? WHERE id = ?")
            .run(String(e.message || e).slice(0, 500), new Date().toISOString(), task.id);
          emit('ai_task', { taskId: task.id, text: task.text.slice(0, 120), error: String(e.message || e).slice(0, 200) });
        }
      }
    } finally {
      aiTaskRunning = false;
    }
  }
  const aiTaskTimer = setInterval(runDueAiTasks, 30000);
  aiTaskTimer.unref();

  return app;
}
