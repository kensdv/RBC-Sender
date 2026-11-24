import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolveMx } from 'node:dns/promises';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { decryptSecret, encryptSecret, tokensEqual, unsubscribeToken } from './crypto.js';
import { parseRecipientsCsv } from './csv.js';
import { publicSmtp, publicSendSettings } from './mailer.js';
import { escapeHtml } from './placeholders.js';
import { transaction } from './db.js';

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

const UPLOADS_DIR = fileURLToPath(new URL('../data/uploads/', import.meta.url));
mkdirSync(UPLOADS_DIR, { recursive: true });
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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
  };
}

function campaignView(row) {
  let attachments = [];
  try { attachments = JSON.parse(row.attachments_json || '[]'); } catch {}
  return {
    id: row.id, name: row.name, subject: row.subject, preheader: row.preheader || '', html: row.html, text: row.text,
    attachments,
    status: row.status, scheduledFor: row.scheduled_for, createdAt: row.created_at,
    total: row.total || 0, sent: row.sent || 0, failed: row.failed || 0, queued: row.queued || 0,
  };
}

function campaignBody(body) {
  const subject = text(body.subject, 'subject', 200, true);
  const html = String(body.html || '');
  const plainText = String(body.text || '');
  if (!html.trim() && !plainText.trim()) fail('HTML or plain-text content is required');
  const attachments = sanitizeAttachments(body.attachments);
  return { name: text(body.name, 'name', 120) || subject, subject, preheader: text(body.preheader || '', 'preheader', 300), html, text: plainText, attachments };
}

function unsubscribePage(message, action = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Subscription preferences</title><style>body{font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px;background:#0b1020;color:#e5eaf5}button{background:#2563eb;color:white;border:0;border-radius:8px;padding:12px 18px;cursor:pointer}a{color:#93c5fd}</style></head><body><h1>Subscription preferences</h1><p>${escapeHtml(message)}</p>${action ? `<form method="post" action="${escapeHtml(action)}"><button type="submit">Unsubscribe</button></form>` : ''}</body></html>`;
}

export async function createApp({ db, config, mailer, worker }) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 4 * 1024 * 1024 });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (request, body, done) => {
    try { done(null, Object.fromEntries(new URLSearchParams(body))); } catch (error) { done(error); }
  });
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?', 1)[0];
    const publicPath = path === '/api/health' || path === '/api/unsubscribe' || path === '/api/webhooks/bounce' || path === '/api/engine/gmail/callback' || path === '/api/go' || path.startsWith('/api/track/');
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
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/state', async () => {
    const recipients = db.prepare('SELECT * FROM recipients ORDER BY id DESC LIMIT 1000').all().map(recipientView);
    const campaigns = db.prepare(`
      SELECT c.*, COUNT(d.id) AS total,
        COALESCE(SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
        COALESCE(SUM(CASE WHEN d.status IN ('queued', 'sending') THEN 1 ELSE 0 END), 0) AS queued
      FROM campaigns c LEFT JOIN deliveries d ON d.campaign_id = c.id
      GROUP BY c.id ORDER BY c.id DESC LIMIT 200
    `).all().map(campaignView);
    const bounces = db.prepare('SELECT id, email, kind, reason, created_at AS createdAt FROM bounces ORDER BY id DESC LIMIT 500').all();
    const confirmed = db.prepare('SELECT COUNT(*) AS count FROM recipients WHERE consent_confirmed = 1 AND suppressed = 0').get().count;
    seedPoolFromLegacy();
    const smtpAccounts = db.prepare('SELECT * FROM smtp_accounts ORDER BY id').all().map(accountView);
    return { smtp: publicSmtp(db), smtpAccounts, sendSettings: publicSendSettings(db), recipients, campaigns, bounces, confirmed, publicBaseUrl: config.publicBaseUrl };
  });

  app.put('/api/smtp', async (request) => {
    const body = request.body || {};
    const current = db.prepare('SELECT password_encrypted FROM smtp_settings WHERE id = 1').get();
    const password = String(body.password || '');
    if (!password && !current) fail('SMTP password is required');
    const settings = {
      host: text(body.host, 'host', 253, true),
      port: Number(body.port),
      secure: body.secure === true ? 1 : 0,
      username: text(body.username, 'username', 320, true),
      passwordEncrypted: password ? encryptSecret(password, config.credentialKey) : current.password_encrypted,
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

  app.post('/api/test-send', async (request) => {
    const body = request.body || {};
    const to = body.to ? email(body.to, 'to') : '';
    if (!to) fail('Test recipient email is required');
    const info = await mailer.send({
      campaign: {
        id: 0, name: 'test', subject: text(body.subject || 'RBC Sender — test email', 'subject', 200),
        preheader: '', html: body.html || '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">RBC Sender test email — the active send engine accepted this message.</div>',
        text: 'RBC Sender test email — the active send engine accepted this message.', attachments: [],
      },
      recipient: { id: 0, email: to, firstName: 'Test', lastName: 'User', company: '', custom: {} },
      totalRecipients: 1,
    });
    return { ok: true, messageId: info?.messageId || '' };
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

  // ── SMTP account pool ──
  function accountView(row) {
    return {
      id: row.id, label: row.label, host: row.host, port: row.port, secure: Boolean(row.secure),
      username: row.username, hasPassword: Boolean(row.password_encrypted),
      fromName: row.from_name, fromEmail: row.from_email, replyTo: row.reply_to,
      enabled: Boolean(row.enabled), weight: row.weight, fails: row.fails,
      cooldownUntil: row.cooldown_until, createdAt: row.created_at,
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
    if (!password && !current) fail('Password is required for a new account');
    return {
      label: text(body.label || '', 'label', 120),
      host: text(body.host, 'host', 253, true),
      port: Number(body.port),
      secure: body.secure === true ? 1 : 0,
      username: text(body.username, 'username', 320, true),
      passwordEncrypted: password ? encryptSecret(password, config.credentialKey) : current.password_encrypted,
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

  app.put('/api/smtp/accounts/:id', async (request) => {
    const id = Number(request.params.id);
    const current = db.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(id);
    if (!current) fail('Account not found', 404);
    const a = accountBody(request.body || {}, current);
    if (!Number.isInteger(a.port) || a.port < 1 || a.port > 65535) fail('Port is invalid');
    db.prepare(`UPDATE smtp_accounts SET label=?, host=?, port=?, secure=?, username=?, password_encrypted=?, from_name=?, from_email=?, reply_to=?, enabled=?, weight=?, updated_at=? WHERE id=?`)
      .run(a.label, a.host, a.port, a.secure, a.username, a.passwordEncrypted, a.fromName, a.fromEmail, a.replyTo, a.enabled, a.weight, new Date().toISOString(), id);
    return { ok: true };
  });

  app.delete('/api/smtp/accounts/:id', async (request) => {
    db.prepare('DELETE FROM smtp_accounts WHERE id = ?').run(Number(request.params.id));
    return { ok: true };
  });

  // Send settings (delivery config)
  app.get('/api/settings', async () => ({ sendSettings: publicSendSettings(db) }));

  app.put('/api/settings', async (request) => {
    const body = request.body || {};
    const allowedModes = ['smtp', 'direct', 'relay', 'socks5', 'graph', 'gmail'];
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

    db.prepare(`
      INSERT INTO send_settings (id, send_mode, direct_from_name, direct_from_email, direct_reply_to, direct_rate_per_minute,
        relay_host, relay_port, relay_helo, socks5_proxy, encoding, priority, send_type, sleep_ms,
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
        updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        send_mode=excluded.send_mode, direct_from_name=excluded.direct_from_name, direct_from_email=excluded.direct_from_email,
        direct_reply_to=excluded.direct_reply_to, direct_rate_per_minute=excluded.direct_rate_per_minute,
        relay_host=excluded.relay_host, relay_port=excluded.relay_port, relay_helo=excluded.relay_helo,
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
        cloak_base=excluded.cloak_base, updated_at=excluded.updated_at
    `).run(
      sendMode,
      text(body.directFromName || '', 'directFromName', 200),
      directFromEmail,
      directReplyTo,
      directRate,
      text(body.relayHost || '', 'relayHost', 253),
      relayPort,
      text(body.relayHelo || '', 'relayHelo', 253),
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
      Math.min(10000, Math.max(0, Number(body.maxPerHour ?? 30))),
      Math.min(100000, Math.max(0, Number(body.maxPerDay ?? 200))),
      body.warmupEnabled ? 1 : 0,
      text(body.warmupStartedAt || db.prepare('SELECT warmup_started_at FROM send_settings WHERE id = 1').get()?.warmup_started_at || '', 'warmupStartedAt', 40),
      body.linkCloak ? 1 : 0,
      text(body.cloakBase || '', 'cloakBase', 500),
      new Date().toISOString(),
    );
    return { sendSettings: publicSendSettings(db) };
  });

  app.post('/api/recipients/import', async (request) => {
    if (request.body?.consentConfirmed !== true) fail('Import requires explicit confirmation that every recipient opted in');
    const parsed = parseRecipientsCsv(request.body?.csv);
    const unique = [...new Map(parsed.records.map((record) => [record.email, record])).values()];
    const now = new Date().toISOString();
    transaction(db, () => {
      const statement = db.prepare(`
        INSERT INTO recipients (email, first_name, last_name, company, custom_json, consent_confirmed, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(email) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
          company = excluded.company, custom_json = excluded.custom_json, consent_confirmed = 1, updated_at = excluded.updated_at
      `);
      for (const record of unique) statement.run(record.email, record.firstName, record.lastName, record.company, JSON.stringify(record.custom), now, now);
    });
    return { imported: unique.length, duplicates: parsed.records.length - unique.length, errors: parsed.errors };
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
  ];

  async function mxInfo(domain) {
    try {
      const records = await resolveMx(domain);
      records.sort((a, b) => a.priority - b.priority);
      const exchange = records[0]?.exchange || '';
      const provider = MX_PROVIDERS.find(([re]) => re.test(exchange))?.[1] || 'Other/Custom';
      return { hasMx: true, mx: exchange, provider };
    } catch {
      return { hasMx: false, mx: '', provider: 'No MX' };
    }
  }

  app.post('/api/recipients/verify', async (request) => {
    const emails = Array.isArray(request.body?.emails) ? request.body.emails.slice(0, 500) : [];
    const domains = [...new Set(emails.map((e) => String(e).split('@')[1]?.toLowerCase()).filter(Boolean))];
    const mxCache = {};
    await Promise.all(domains.map(async (d) => { mxCache[d] = await mxInfo(d); }));
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
    return { results };
  });

  // Email sorter — classify stored recipient list by provider via MX
  app.post('/api/recipients/classify', async (request) => {
    const rows = db.prepare('SELECT id, email FROM recipients').all();
    const domains = [...new Set(rows.map((r) => r.email.split('@')[1]?.toLowerCase()).filter(Boolean))];
    const mxCache = {};
    const CONCURRENCY = 10;
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

  app.post('/api/campaigns', async (request) => {
    const campaign = campaignBody(request.body || {});
    const now = new Date().toISOString();
    const result = db.prepare("INSERT INTO campaigns (name, subject, preheader, html, text, attachments_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)").run(campaign.name, campaign.subject, campaign.preheader, campaign.html, campaign.text, JSON.stringify(campaign.attachments || []), now, now);
    return { id: Number(result.lastInsertRowid) };
  });

  app.put('/api/campaigns/:id', async (request) => {
    const id = Number(request.params.id);
    const existing = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(id);
    if (!existing) fail('Campaign not found', 404);
    if (existing.status !== 'draft') fail('Only draft campaigns can be edited');
    const campaign = campaignBody(request.body || {});
    db.prepare('UPDATE campaigns SET name = ?, subject = ?, preheader = ?, html = ?, text = ?, attachments_json = ?, updated_at = ? WHERE id = ?').run(campaign.name, campaign.subject, campaign.preheader, campaign.html, campaign.text, JSON.stringify(campaign.attachments || []), new Date().toISOString(), id);
    return { id };
  });

  app.post('/api/campaigns/:id/duplicate', async (request) => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(request.params.id));
    if (!campaign) fail('Campaign not found', 404);
    const now = new Date().toISOString();
    const result = db.prepare("INSERT INTO campaigns (name, subject, preheader, html, text, attachments_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)").run(`${campaign.name} copy`.slice(0, 120), campaign.subject, campaign.preheader || '', campaign.html, campaign.text, campaign.attachments_json || '[]', now, now);
    return { id: Number(result.lastInsertRowid) };
  });

  app.post('/api/preview', async (request) => mailer.preview(campaignBody(request.body || {})));

  app.post('/api/campaigns/:id/queue', async (request) => {
    const id = Number(request.params.id);
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) fail('Campaign not found', 404);
    if (campaign.status !== 'draft') fail('Only a draft campaign can be queued');
    const settings = publicSendSettings(db);
    if (settings.sendMode === 'smtp' && !db.prepare('SELECT 1 FROM smtp_settings WHERE id = 1').get() && !db.prepare('SELECT 1 FROM smtp_accounts LIMIT 1').get()) fail('Configure SMTP before queueing');
    if (settings.sendMode === 'relay' && !settings.relayHost) fail('Configure relay host before queueing');
    if ((settings.sendMode === 'direct' || settings.sendMode === 'socks5') && !settings.directFromEmail) fail('Configure direct sending from-email before queueing');
    if (settings.sendMode === 'graph' && (!settings.engineClientId || !settings.engineClientSecret || !settings.engineTenant)) fail('Configure Graph engine credentials before queueing');
    if (settings.sendMode === 'gmail' && (!settings.engineClientId || !settings.engineClientSecret || !settings.engineRefreshToken)) fail('Configure Gmail engine credentials before queueing');
    const recipients = db.prepare('SELECT id FROM recipients WHERE consent_confirmed = 1 AND suppressed = 0').all();
    if (!recipients.length) fail('No confirmed, unsuppressed recipients are available');
    let scheduledFor = null;
    if (request.body?.scheduledFor) {
      const timestamp = Date.parse(request.body.scheduledFor);
      if (!Number.isFinite(timestamp)) fail('Scheduled date is invalid');
      if (timestamp < Date.now() - 60000) fail('Scheduled date cannot be in the past');
      scheduledFor = new Date(timestamp).toISOString();
    }
    transaction(db, () => {
      const statement = db.prepare('INSERT INTO deliveries (campaign_id, recipient_id) VALUES (?, ?)');
      for (const recipient of recipients) statement.run(id, recipient.id);
      db.prepare('UPDATE campaigns SET status = ?, scheduled_for = ?, updated_at = ? WHERE id = ?').run(scheduledFor ? 'scheduled' : 'queued', scheduledFor, new Date().toISOString(), id);
    });
    worker.kick();
    return { id, queued: recipients.length, scheduledFor };
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
    suppress(request.body?.email, text(request.body?.reason, 'reason', 1000) || kind, kind);
    return { ok: true };
  });

  // 1x1 transparent GIF for open tracking
  const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

  app.get('/api/track/open', async (request, reply) => {
    const address = String(request.query?.e || '').toLowerCase();
    const token = String(request.query?.t || '');
    const campaignId = Number(request.query?.c) || null;
    if (address && tokensEqual(token, unsubscribeToken(address, config.unsubscribeSecret))) {
      try {
        db.prepare('INSERT INTO tracking_events (campaign_id, email, kind, created_at) VALUES (?, ?, ?, ?)').run(campaignId, address, 'open', new Date().toISOString());
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
        db.prepare('INSERT INTO tracking_events (campaign_id, email, kind, target, created_at) VALUES (?, ?, ?, ?, ?)').run(campaignId, address, 'click', target.slice(0, 2000), new Date().toISOString());
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
    return reply.type('text/html').send(unsubscribePage(`${address} has been unsubscribed.`));
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) request.log.error(error);
    reply.code(statusCode).send({ error: statusCode >= 500 ? 'Internal server error' : error.message });
  });

  const clientDist = resolve('client/dist');
  if (existsSync(clientDist)) await app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/') && existsSync(clientDist)) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'Not found' });
  });
  return app;
}
