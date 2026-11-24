import { randomUUID } from 'node:crypto';
import { resolveMx } from 'node:dns/promises';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { decryptSecret, unsubscribeToken } from './crypto.js';
import { applyEncoding, createPlaceholderContext, escapeHtml, htmlToText, renderTemplate } from './placeholders.js';
import { diagnoseRelay } from './smtpdiag.js';

const UPLOADS_DIR = fileURLToPath(new URL('../data/uploads/', import.meta.url));

function smtpRow(db) {
  return db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
}

function settingsRow(db) {
  return db.prepare('SELECT * FROM send_settings WHERE id = 1').get() || {};
}

function loadSmtp(db, config) {
  const row = smtpRow(db);
  if (!row) throw Object.assign(new Error('Configure SMTP before sending'), { statusCode: 400 });
  return {
    host: row.host,
    port: row.port,
    secure: Boolean(row.secure),
    username: row.username,
    password: decryptSecret(row.password_encrypted, config.credentialKey),
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    ratePerMinute: row.rate_per_minute,
  };
}

function loadSendSettings(db, config = null) {
  const row = settingsRow(db);
  let customHeaders = [];
  try { customHeaders = JSON.parse(row.custom_headers_json || '[]'); } catch {}
  let fromNames = [];
  try { fromNames = JSON.parse(row.from_names_json || '[]'); } catch {}
  let subjectsList = [];
  try { subjectsList = JSON.parse(row.subjects_json || '[]'); } catch {}
  return {
    sendMode: row.send_mode || 'smtp',
    directFromName: row.direct_from_name || '',
    directFromEmail: row.direct_from_email || '',
    directReplyTo: row.direct_reply_to || '',
    directRatePerMinute: row.direct_rate_per_minute || 10,
    relayHost: row.relay_host || '',
    relayPort: row.relay_port || 25,
    relaySecure: row.relay_secure ?? 0,
    relayUsername: row.relay_username || '',
    relayEhlo: row.relay_ehlo || '',
    socks5Proxy: row.socks5_proxy || '',
    encoding: row.encoding || 'base64',
    priority: row.priority || 3,
    sendType: row.send_type || 'to',
    sleepMs: row.sleep_ms || 0,
    encryptLetter: Boolean(row.encrypt_letter),
    encryptMode: row.encrypt_mode || 'unicode',
    fromNameEncrypt: Boolean(row.fromname_encrypt),
    subjectEncrypt: Boolean(row.subject_encrypt),
    customHeadersEnabled: Boolean(row.custom_headers_enabled),
    customHeaders,
    timezone: row.timezone || 'UTC',
    testEmailEnabled: Boolean(row.test_email_enabled),
    testEvery: row.test_every || 100,
    testDestination: row.test_destination || '',
    fromNames,
    subjectsList,
    redirectUrl: row.redirect_url || '',
    spoofFromName: row.spoof_from_name || '',
    spoofFromEmail: row.spoof_from_email || '',
    spoofReplyTo: row.spoof_reply_to || '',
    returnPath: row.return_path || '',
    msgidDomain: row.msgid_domain || '',
    xMailer: row.x_mailer || '',
    fakeReceived: Boolean(row.fake_received),
    dkimEnabled: Boolean(row.dkim_enabled),
    dkimDomain: row.dkim_domain || '',
    dkimSelector: row.dkim_selector || '',
    dkimKeyEncrypted: row.dkim_key_encrypted || '',
    textOnly: Boolean(row.text_only),
    trackOpens: Boolean(row.track_opens),
    trackClicks: Boolean(row.track_clicks),
    clickTrackerUrl: row.click_tracker_url || '',
    parallelSends: Math.min(30, Math.max(1, Number(row.parallel_sends) || 1)),
    htmlRandomize: Boolean(row.html_randomize),
    spamBypass: Boolean(row.spam_bypass),
    subjectB64: Boolean(row.subject_b64),
    fromnameB64: Boolean(row.fromname_b64),
    disclaimerText: row.disclaimer_text || '',
    engineClientId: row.engine_client_id || '',
    engineClientSecret: row.engine_client_secret_encrypted && config ? decryptSecret(row.engine_client_secret_encrypted, config.credentialKey) : '',
    engineTenant: row.engine_tenant || '',
    engineRefreshToken: row.engine_refresh_token_encrypted && config ? decryptSecret(row.engine_refresh_token_encrypted, config.credentialKey) : '',
    relayPassword: row.relay_password_encrypted && config ? decryptSecret(row.relay_password_encrypted, config.credentialKey) : '',
    engineSendAs: row.engine_send_as || '',
    attachFormats: (() => { try { return JSON.parse(row.attach_formats_json || '[]'); } catch { return []; } })(),
    imageRecompress: Boolean(row.image_recompress),
    sendDays: (() => { try { return JSON.parse(row.send_days_json || '[]'); } catch { return []; } })(),
    sendFromMin: row.send_from_min ?? 480,
    sendToMin: row.send_to_min ?? 1200,
    maxPerHour: row.max_per_hour ?? 30,
    maxPerDay: row.max_per_day ?? 200,
    warmupEnabled: Boolean(row.warmup_enabled),
    warmupStartedAt: row.warmup_started_at || '',
    linkCloak: Boolean(row.link_cloak),
    cloakBase: row.cloak_base || '',
  };
}

function pickRandom(arr, fallback) {
  const filtered = (arr || []).filter(Boolean);
  if (!filtered.length) return fallback;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

function buildPriorityHeaders(priority) {
  if (priority === 1) return { 'X-Priority': '1', 'X-MSMail-Priority': 'High', 'Importance': 'High' };
  if (priority === 2) return { 'X-Priority': '2', 'X-MSMail-Priority': 'High', 'Importance': 'Normal' };
  return {};
}

// Per-send HTML randomization — unique byte structure every email (anti-fingerprint)
function randomizeHtml(html) {
  if (!html) return html;
  let out = html;
  // random HTML comments between tags
  out = out.replace(/></g, () => `><!--${Math.random().toString(36).slice(2, 8)}--><`);
  // randomize attribute quote style is unsafe; instead jitter whitespace inside tags
  out = out.replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g, (m, tag, attrs) => {
    if (Math.random() < 0.5) return m;
    const pad = Math.random() < 0.3 ? ' ' : '';
    return `<${tag}${pad}${attrs}>`;
  });
  return out;
}

// ZWNJ/soft-hyphen spam-word bypass — breaks filter tokenization
const SPAM_WORDS = ['free','winner','claim','urgent','offer','discount','viagra','casino','loan','credit','act now','limited time','risk free','money back','click here','verify your','suspended','invoice','payment','account'];
function spamBypassText(text) {
  if (!text) return text;
  let out = String(text);
  for (const w of SPAM_WORDS) {
    const re = new RegExp(`\\b(${w.replace(/ /g, '\\s+')})\\b`, 'gi');
    out = out.replace(re, (m) => {
      // insert ZWNJ after a random interior letter
      const i = 1 + Math.floor(Math.random() * (m.length - 2));
      return m.slice(0, i) + '‌' + m.slice(i);
    });
  }
  return out;
}

function b64Word(str) {
  return `=?UTF-8?B?${Buffer.from(String(str), 'utf8').toString('base64')}?=`;
}

const X_MAILER_PRESETS = {
  gmail: 'Gmail',
  outlook: 'Microsoft Outlook 16.0',
  thunderbird: 'Mozilla Thunderbird',
  apple: 'Apple Mail',
};

function buildIdentityHeaders(settings, fromEmail, recipientEmail) {
  const headers = {};
  const fromDomain = fromEmail.split('@')[1] || 'localhost';
  const msgidDomain = settings.msgidDomain || fromDomain;
  const msgId = `<${randomUUID().replace(/-/g, '')}@${msgidDomain}>`;
  headers['Message-ID'] = msgId;
  headers['Date'] = new Date().toUTCString();
  if (settings.xMailer) {
    headers['X-Mailer'] = X_MAILER_PRESETS[settings.xMailer] || settings.xMailer;
  }
  if (settings.returnPath) headers['Return-Path'] = `<${settings.returnPath}>`;
  if (settings.fakeReceived) {
    const src = fromDomain;
    const rid = Math.random().toString(36).slice(2, 10);
    headers['Received'] = [
      `from ${src} (${src} [10.0.0.${Math.floor(Math.random() * 250) + 1}]) by ${msgidDomain} with ESMTP id ${rid} for <${recipientEmail}>; ${new Date().toUTCString()}`,
      `from ${src} [10.0.1.${Math.floor(Math.random() * 250) + 1}] (envelope-from <${fromEmail}>) by ${msgidDomain} with ESMTPA id ${rid}; ${new Date().toUTCString()}`,
    ];
  }
  return headers;
}

function dkimFor(settings, config) {
  if (!settings.dkimEnabled || !settings.dkimDomain || !settings.dkimSelector || !settings.dkimKeyEncrypted) return null;
  try {
    const privateKey = decryptSecret(settings.dkimKeyEncrypted, config.credentialKey);
    if (!privateKey) return null;
    return {
      domainName: settings.dkimDomain,
      keySelector: settings.dkimSelector,
      privateKey,
    };
  } catch {
    return null;
  }
}

function parseCustomHeaders(headerLines) {
  const result = {};
  for (const line of headerLines) {
    const idx = String(line).indexOf(':');
    if (idx > 0) {
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (name) result[name] = value;
    }
  }
  return result;
}

async function resolveMxHost(domain) {
  try {
    const records = await resolveMx(domain);
    if (!records.length) throw new Error('No MX records');
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch {
    return domain; // fall back to A record
  }
}

function transportFor(smtp, dkim = null, proxy = '') {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.password ? { auth: { user: smtp.username, pass: smtp.password } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    tls: { minVersion: 'TLSv1.2' },
    ...(proxy ? { proxy } : {}),
    ...(dkim ? { dkim } : {}),
  });
}

function directTransportFor(settings, mxHost = null, dkim = null) {
  const opts = {
    direct: !mxHost,
    ...(mxHost ? { host: mxHost, port: 25, secure: false, auth: false, tls: { rejectUnauthorized: false } } : {}),
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  };
  if (settings.socks5Proxy) {
    opts.proxy = settings.socks5Proxy; // e.g. socks5://user:pass@host:port
  }
  if (dkim) opts.dkim = dkim;
  return nodemailer.createTransport(opts);
}

function relayTransportFor(settings, dkim = null) {
  // relaySecure: 0 = auto STARTTLS (default), 1 = implicit TLS/SSL, 2 = plaintext
  const secure = settings.relaySecure === 1;
  const plain = settings.relaySecure === 2;
  const ehloName = settings.relayEhlo || (settings.directFromEmail || '').split('@')[1] || '';
  return nodemailer.createTransport({
    host: settings.relayHost,
    port: settings.relayPort,
    secure,
    ...(settings.relayUsername || settings.relayPassword
      ? { auth: { user: settings.relayUsername || '', pass: settings.relayPassword || '' } }
      : {}),
    ignoreTLS: plain,
    ...(ehloName ? { name: ehloName } : {}),
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    ...(dkim ? { dkim } : {}),
  });
}

export function publicSmtp(db) {
  const row = smtpRow(db);
  if (!row) return { configured: false, host: '', port: 587, secure: false, username: '', fromName: '', fromEmail: '', replyTo: '', ratePerMinute: 30 };
  return {
    configured: true,
    host: row.host,
    port: row.port,
    secure: Boolean(row.secure),
    username: row.username,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    ratePerMinute: row.rate_per_minute,
  };
}

export function publicSendSettings(db) {
  const row = settingsRow(db);
  let customHeaders = [];
  try { customHeaders = JSON.parse(row.custom_headers_json || '[]'); } catch {}
  let fromNames = [];
  try { fromNames = JSON.parse(row.from_names_json || '[]'); } catch {}
  let subjectsList = [];
  try { subjectsList = JSON.parse(row.subjects_json || '[]'); } catch {}
  let scheduleEnabled = true;
  try { scheduleEnabled = db.prepare("SELECT value FROM integrations WHERE key = 'schedule_enabled'").get()?.value !== '0'; } catch {}
  return {
    sendMode: row.send_mode || 'smtp',
    scheduleEnabled,
    directFromName: row.direct_from_name || '',
    directFromEmail: row.direct_from_email || '',
    directReplyTo: row.direct_reply_to || '',
    directRatePerMinute: row.direct_rate_per_minute || 10,
    relayHost: row.relay_host || '',
    relayPort: row.relay_port || 25,
    relaySecure: row.relay_secure ?? 0,
    relayUsername: row.relay_username || '',
    relayEhlo: row.relay_ehlo || '',
    socks5Proxy: row.socks5_proxy || '',
    encoding: row.encoding || 'base64',
    priority: row.priority || 3,
    sendType: row.send_type || 'to',
    sleepMs: row.sleep_ms || 0,
    encryptLetter: Boolean(row.encrypt_letter),
    encryptMode: row.encrypt_mode || 'unicode',
    fromNameEncrypt: Boolean(row.fromname_encrypt),
    subjectEncrypt: Boolean(row.subject_encrypt),
    customHeadersEnabled: Boolean(row.custom_headers_enabled),
    customHeaders,
    timezone: row.timezone || 'UTC',
    testEmailEnabled: Boolean(row.test_email_enabled),
    testEvery: row.test_every || 100,
    testDestination: row.test_destination || '',
    fromNames,
    subjectsList,
    redirectUrl: row.redirect_url || '',
    spoofFromName: row.spoof_from_name || '',
    spoofFromEmail: row.spoof_from_email || '',
    spoofReplyTo: row.spoof_reply_to || '',
    returnPath: row.return_path || '',
    msgidDomain: row.msgid_domain || '',
    xMailer: row.x_mailer || '',
    fakeReceived: Boolean(row.fake_received),
    dkimEnabled: Boolean(row.dkim_enabled),
    dkimDomain: row.dkim_domain || '',
    dkimSelector: row.dkim_selector || '',
    dkimConfigured: Boolean(row.dkim_key_encrypted),
    textOnly: Boolean(row.text_only),
    trackOpens: Boolean(row.track_opens),
    trackClicks: Boolean(row.track_clicks),
    clickTrackerUrl: row.click_tracker_url || '',
    parallelSends: Math.min(30, Math.max(1, Number(row.parallel_sends) || 1)),
    htmlRandomize: Boolean(row.html_randomize),
    spamBypass: Boolean(row.spam_bypass),
    subjectB64: Boolean(row.subject_b64),
    fromnameB64: Boolean(row.fromname_b64),
    disclaimerText: row.disclaimer_text || '',
    engineClientId: row.engine_client_id || '',
    engineClientSecret: Boolean(row.engine_client_secret_encrypted),
    engineTenant: row.engine_tenant || '',
    engineRefreshToken: Boolean(row.engine_refresh_token_encrypted),
    relayPasswordSet: Boolean(row.relay_password_encrypted),
    engineSendAs: row.engine_send_as || '',
    attachFormats: (() => { try { return JSON.parse(row.attach_formats_json || '[]'); } catch { return []; } })(),
    imageRecompress: Boolean(row.image_recompress),
    sendDays: (() => { try { return JSON.parse(row.send_days_json || '[]'); } catch { return []; } })(),
    sendFromMin: row.send_from_min ?? 480,
    sendToMin: row.send_to_min ?? 1200,
    maxPerHour: row.max_per_hour ?? 30,
    maxPerDay: row.max_per_day ?? 200,
    warmupEnabled: Boolean(row.warmup_enabled),
    warmupStartedAt: row.warmup_started_at || '',
    linkCloak: Boolean(row.link_cloak),
    cloakBase: row.cloak_base || '',
  };
}

// ── SMTP account pool ──────────────────────────────────────────────
let smtpCursor = 0;

function loadSmtpPool(db, config) {
  const now = new Date().toISOString();
  const rows = db.prepare('SELECT * FROM smtp_accounts WHERE enabled = 1').all()
    .filter((r) => !r.cooldown_until || r.cooldown_until <= now);
  if (rows.length) {
    return rows.map((r) => ({
      id: r.id,
      host: r.host, port: r.port, secure: Boolean(r.secure),
      username: r.username,
      password: decryptSecret(r.password_encrypted, config.credentialKey),
      fromName: r.from_name, fromEmail: r.from_email, replyTo: r.reply_to,
      ratePerMinute: 60,
    }));
  }
  // legacy single-account fallback
  try { return [loadSmtp(db, config)]; } catch { return []; }
}

function markAccountResult(db, accountId, ok) {
  if (!accountId) return;
  if (ok) {
    db.prepare('UPDATE smtp_accounts SET fails = 0, cooldown_until = NULL WHERE id = ?').run(accountId);
  } else {
    db.prepare(`UPDATE smtp_accounts SET fails = fails + 1,
      cooldown_until = ? WHERE id = ?`).run(new Date(Date.now() + 5 * 60000).toISOString(), accountId);
  }
}

// ── OAuth engine tokens (graph / gmail) ────────────────────────────
const tokenCache = {};

async function graphAccessToken(settings) {
  const key = 'graph';
  if (tokenCache[key] && tokenCache[key].exp > Date.now()) return tokenCache[key].token;
  if (!settings.engineClientId || !settings.engineClientSecret || !settings.engineTenant) {
    throw Object.assign(new Error('Graph engine not configured — set client id, secret and tenant'), { statusCode: 400 });
  }
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(settings.engineTenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.engineClientId,
      client_secret: settings.engineClientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Graph token failed: ${data.error_description || data.error || res.status}`);
  tokenCache[key] = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache[key].token;
}

async function gmailAccessToken(settings) {
  const key = 'gmail';
  if (tokenCache[key] && tokenCache[key].exp > Date.now()) return tokenCache[key].token;
  if (!settings.engineClientId || !settings.engineClientSecret || !settings.engineRefreshToken) {
    throw Object.assign(new Error('Gmail engine not configured — set client id, secret and refresh token'), { statusCode: 400 });
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.engineClientId,
      client_secret: settings.engineClientSecret,
      refresh_token: settings.engineRefreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail token failed: ${data.error_description || data.error || res.status}`);
  tokenCache[key] = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache[key].token;
}

const GRAPH_BLOCKED_HEADERS = new Set(['from', 'to', 'cc', 'bcc', 'subject', 'mime-version', 'content-type', 'content-transfer-encoding', 'date', 'message-id', 'return-path', 'received', 'reply-to']);

async function sendViaGraph({ settings, message, recipient, fromName, fromEmail, replyTo, attachments }) {
  const token = await graphAccessToken(settings);
  const sender = settings.engineSendAs || fromEmail;
  if (!sender) throw Object.assign(new Error('Graph send-as address not configured'), { statusCode: 400 });

  const toName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ');
  const addr = { emailAddress: { name: toName, address: recipient.email } };
  const fromAddr = { emailAddress: { name: fromName, address: sender } };
  const payload = { message: { subject: message.subject } };

  if (message.html) {
    payload.message.body = { contentType: 'HTML', content: message.html };
  } else {
    payload.message.body = { contentType: 'Text', content: message.text || '' };
  }

  const sendType = settings.sendType || 'to';
  if (sendType === 'cc') { payload.message.toRecipients = [fromAddr]; payload.message.ccRecipients = [addr]; }
  else if (sendType === 'bcc') { payload.message.toRecipients = [fromAddr]; payload.message.bccRecipients = [addr]; }
  else { payload.message.toRecipients = [addr]; }
  if (replyTo) payload.message.replyTo = [{ emailAddress: { address: replyTo } }];

  const headers = Object.entries(message.extraHeaders || {})
    .filter(([k]) => !GRAPH_BLOCKED_HEADERS.has(k.toLowerCase()))
    .slice(0, 20)
    .map(([name, value]) => ({ name, value: String(value).slice(0, 500) }));
  if (headers.length) payload.message.internetMessageHeaders = headers;

  if (attachments.length) {
    payload.message.attachments = attachments.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: (a.content || readFileSync(a.path)).toString('base64'),
    }));
  }

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Graph sendMail failed ${res.status}: ${data.error?.message || res.statusText}`);
  }
  return { messageId: '', response: 'graph-sendMail' };
}

async function rawRfc822(mailOpts) {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  try {
    const info = await transporter.sendMail(mailOpts);
    return info.message; // Buffer when buffer:true
  } finally {
    transporter.close();
  }
}

async function sendViaGmail({ mailOpts, settings }) {
  const token = await gmailAccessToken(settings);
  const raw = await rawRfc822(mailOpts);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: raw.toString('base64url') }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail send failed ${res.status}: ${data.error?.message || res.statusText}`);
  return { messageId: data.id || '', response: 'gmail-api' };
}

// ── Attachment format converters (HTML → EML/DOCX/PDF/ICS) ─────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, name]));
    offset += 30 + name.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cenBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cenBuf, eocd]);
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function docxBuffer(title, text) {
  const paras = String(text || title || ' ').split(/\n+/).filter((l) => l.trim()).slice(0, 500)
    .map((l) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(l)}</w:t></w:r></w:p>`).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr/></w:body></w:document>`;
  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: Buffer.from(document) },
  ]);
}

function pdfEscape(s) {
  return String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e\n]/g, '?').slice(0, 180);
}

function pdfBuffer(title, text) {
  const lines = String(text || title || ' ').split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
  let stream = 'BT /F1 11 Tf 50 780 Td 14 TL\n';
  for (const l of lines) stream += `(${pdfEscape(l)}) Tj T*\n`;
  stream += 'ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function icsBuffer({ subject, text, email }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(Date.now() + 86400000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n').slice(0, 500);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RBC Sender//EN', 'BEGIN:VEVENT',
    `UID:${randomUUID()}@rbc`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, `DTEND:${start}`,
    `SUMMARY:${esc(subject)}`, `DESCRIPTION:${esc(text)}`, `ORGANIZER;CN=Sender:mailto:${email || 'noreply@localhost'}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return Buffer.from(ics, 'utf8');
}

function emlBuffer({ subject, html, text }) {
  const boundary = `----rbc${randomUUID().slice(0, 8)}`;
  const head = [
    `From: sender@localhost`, `To: recipient`, `Subject: ${subject || ''}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
  ].join('\r\n');
  const body = [
    `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', '', text || '',
    `--${boundary}`, 'Content-Type: text/html; charset=utf-8', '', html || '',
    `--${boundary}--`, '',
  ].join('\r\n');
  return Buffer.from(head + body, 'utf8');
}

const ATTACH_FORMATS = {
  eml:  { ext: 'eml',  type: 'message/rfc822',             build: (ctx) => emlBuffer(ctx) },
  docx: { ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', build: (ctx) => docxBuffer(ctx.subject, ctx.text || ctx.html) },
  pdf:  { ext: 'pdf',  type: 'application/pdf',            build: (ctx) => pdfBuffer(ctx.subject, ctx.text || ctx.html) },
  ics:  { ext: 'ics',  type: 'text/calendar',              build: (ctx) => icsBuffer(ctx) },
};

// Build the full attachment list: generated format converters + uploaded files
async function buildAttachments({ campaign, message, settings, recipient }) {
  const out = [];
  const base = String(campaign.name || 'letter').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'letter';
  for (const fmt of settings.attachFormats || []) {
    const def = ATTACH_FORMATS[fmt];
    if (!def) continue;
    try {
      const buf = def.build({ subject: campaign.subject, html: message.html, text: message.text, email: recipient.email });
      out.push({ filename: `${base}.${def.ext}`, contentType: def.type, content: buf });
    } catch {}
  }
  try {
    const raw = typeof campaign.attachments === 'string' ? JSON.parse(campaign.attachments || '[]') : (campaign.attachments || []);
    const list = Array.isArray(raw) ? raw.slice(0, 10) : [];
    for (const a of list) {
      const p = resolve(UPLOADS_DIR, String(a.path || ''));
      if (!(p.startsWith(UPLOADS_DIR) && existsSync(p))) continue;
      const ct = String(a.contentType || 'application/octet-stream');
      const fname = String(a.filename || basename(p)).slice(0, 200);
      if (settings.imageRecompress && ct.startsWith('image/')) {
        try {
          const buf = await recompressImage(p, ct);
          out.push({ filename: fname.replace(/\.\w+$/, '') + '.jpg', contentType: 'image/jpeg', content: buf });
          continue;
        } catch {}
      }
      out.push({ filename: fname, path: p, contentType: ct });
    }
  } catch {}
  return out.slice(0, 20);
}

// ── Image recompression + fake EXIF + hash padding ────────────────
async function recompressImage(filePath, contentType) {
  const { Jimp } = await import('jimp');
  const img = await Jimp.read(filePath);
  if (img.bitmap.width > 1600 || img.bitmap.height > 1600) {
    img.scaleToFit({ w: 1600, h: 1600 });
  }
  let buf = await img.getBuffer('image/jpeg', { quality: 82 });
  // fake EXIF APP1 segment after SOI
  const exif = Buffer.from([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  buf = Buffer.concat([exif, buf.subarray(2)]);
  // hash padding — random tail bytes after EOI (decoders ignore)
  const pad = Buffer.alloc(64 + Math.floor(Math.random() * 448));
  for (let i = 0; i < pad.length; i++) pad[i] = Math.floor(Math.random() * 256);
  return Buffer.concat([buf, pad]);
}

export function createMailer({ db, config }) {
  function unsubscribeUrl(email) {
    const normalized = email.toLowerCase();
    const token = unsubscribeToken(normalized, config.unsubscribeSecret);
    return `${config.publicBaseUrl}/api/unsubscribe?email=${encodeURIComponent(normalized)}&token=${encodeURIComponent(token)}`;
  }

  function trackPixel(campaignId, email) {
    const normalized = email.toLowerCase();
    const token = unsubscribeToken(normalized, config.unsubscribeSecret);
    return `${config.publicBaseUrl}/api/track/open?e=${encodeURIComponent(normalized)}&t=${encodeURIComponent(token)}&c=${campaignId}`;
  }

  function trackClick(campaignId, email, targetUrl) {
    const normalized = email.toLowerCase();
    const token = unsubscribeToken(normalized, config.unsubscribeSecret);
    const enc = Buffer.from(targetUrl).toString('base64url');
    return `${config.publicBaseUrl}/api/track/click?u=${enc}&e=${encodeURIComponent(normalized)}&t=${encodeURIComponent(token)}&c=${campaignId}`;
  }

  function unescapeUrl(url) {
    return String(url).replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  function wrapLinks(html, campaignId, email, settings) {
    if (!settings.trackClicks) return html;
    const base = (settings.clickTrackerUrl || `${config.publicBaseUrl}/api/track/click`).replace(/\/+$/, '');
    return html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url) => {
      if (url.includes(config.publicBaseUrl)) return m;
      const tracked = `${base}?u=${Buffer.from(unescapeUrl(url)).toString('base64url')}&e=${encodeURIComponent(email.toLowerCase())}&t=${unsubscribeToken(email.toLowerCase(), config.unsubscribeSecret)}&c=${campaignId}`;
      return `href="${escapeHtml(tracked)}"`;
    });
  }

  // Cloak outbound links behind google.com/url so the visible href is a google domain
  function cloakLinks(html, base) {
    const cloakBase = (base || '').trim() || 'https://www.google.com/url?q=';
    const sep = cloakBase.includes('?') ? '&' : '?';
    return html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url) => {
      const target = unescapeUrl(url);
      if (cloakBase === 'https://www.google.com/url?q=') {
        return `href="https://www.google.com/url?q=${encodeURIComponent(target)}"`;
      }
      return `href="${cloakBase}${sep}u=${encodeURIComponent(target)}"`;
    });
  }

  function injectPreheader(html, preheader) {
    if (!preheader) return html;
    const pad = '\u00a0'.repeat(Math.max(0, 90 - preheader.length));
    const hidden = `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader + pad)}</div>`;
    // insert right after <body...> if present, else prepend
    const bodyMatch = html.match(/<body[^>]*>/i);
    if (bodyMatch) {
      const idx = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
      return html.slice(0, idx) + hidden + html.slice(idx);
    }
    return hidden + html;
  }

  function render({ campaign, recipient, totalRecipients, settings }) {
    const url = unsubscribeUrl(recipient.email);
    const linkPool = (settings.redirectUrl || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const context = createPlaceholderContext({
      recipient,
      subject: campaign.subject,
      totalRecipients,
      unsubscribeUrl: url,
      randomId: randomUUID(),
      redirectUrl: linkPool.length ? pickRandom(linkPool) : '',
    });

    // Pick subject: from pool if set, else campaign subject
    let subjectRaw = pickRandom(settings.subjectsList, campaign.subject);
    // Render subject template with placeholders
    subjectRaw = renderTemplate(subjectRaw, context, 'text');
    // Apply subject encoding: base64 encoded-word or obfuscation
    let subject = subjectRaw;
    if (settings.subjectB64) subject = b64Word(subjectRaw);
    else if (settings.subjectEncrypt) subject = applyEncoding(subjectRaw, settings.encryptMode);
    if (settings.spamBypass) subject = spamBypassText(subject);

    // Preheader with placeholders
    const preheaderRaw = campaign.preheader ? renderTemplate(campaign.preheader, context, 'text') : '';

    let renderedHtml = renderTemplate(campaign.html, context, 'html');
    // Apply letter encryption to HTML body
    if (settings.encryptLetter) {
      renderedHtml = applyEncoding(renderedHtml, settings.encryptMode);
    }
    // Inject preheader
    renderedHtml = injectPreheader(renderedHtml, preheaderRaw);
    // Wrap links for click tracking
    const cid = campaign.id || 0;
    if (settings.trackClicks) {
      renderedHtml = wrapLinks(renderedHtml, cid, recipient.email, settings);
    }
    // Cloak last so the visible href is google.com (unsubscribe footer is appended after this)
    if (settings.linkCloak) {
      renderedHtml = cloakLinks(renderedHtml, settings.cloakBase);
    }
    // Tracking pixel before unsubscribe footer
    const pixel = settings.trackOpens
      ? `<img src="${escapeHtml(trackPixel(cid, recipient.email))}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
      : '';
    // Disclaimer block (appended before unsubscribe footer)
    const disclaimerHtml = settings.disclaimerText
      ? `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-family:Arial,sans-serif;font-size:11px;color:#888">${renderTemplate(settings.disclaimerText, context, 'html')}</div>`
      : '';
    const html = renderedHtml.trim()
      ? renderedHtml + pixel + disclaimerHtml + `<hr><p style="font-family:Arial,sans-serif;font-size:12px;color:#666"><a href="${escapeHtml(url)}">Unsubscribe</a></p>`
      : undefined;

    const disclaimerText = settings.disclaimerText
      ? `\n\n--\n${renderTemplate(settings.disclaimerText, context, 'text')}`
      : '';
    let renderedText = campaign.text ? renderTemplate(campaign.text, context, 'text') : htmlToText(renderedHtml);
    if (settings.spamBypass) renderedText = spamBypassText(renderedText);
    const finalHtml = html && settings.htmlRandomize ? randomizeHtml(html) : html;
    return { subject, html: finalHtml, text: `${renderedText}${disclaimerText}\n\nUnsubscribe: ${url}`, unsubscribeUrl: url };
  }

  function buildFrom(settings, smtp) {
    const mode = settings.sendMode;
    let fromName, fromEmail, replyTo;
    if (mode === 'smtp') {
      fromName = pickRandom(settings.fromNames, smtp?.fromName || '');
      fromEmail = smtp?.fromEmail || '';
      replyTo = smtp?.replyTo || '';
    } else {
      fromName = pickRandom(settings.fromNames, settings.directFromName);
      fromEmail = settings.directFromEmail;
      replyTo = settings.directReplyTo;
    }
    // Spoofing overrides — apply to all modes
    if (settings.spoofFromName) fromName = settings.spoofFromName;
    if (settings.spoofFromEmail) fromEmail = settings.spoofFromEmail;
    if (settings.spoofReplyTo) replyTo = settings.spoofReplyTo;
    // Auto-drop Reply-To when it matches From ( Titan v3.5.0 behavior )
    if (replyTo && fromEmail && replyTo.toLowerCase() === fromEmail.toLowerCase()) replyTo = '';
    if (settings.fromNameEncrypt) fromName = applyEncoding(fromName, settings.encryptMode);
    else if (settings.fromnameB64) fromName = b64Word(fromName);
    return { fromName, fromEmail, replyTo };
  }

  async function getTransport(settings, smtp, recipientEmail, dkim = null) {
    const mode = settings.sendMode;
    if (mode === 'smtp') return transportFor(smtp, dkim, settings.socks5Proxy);
    if (mode === 'relay') return relayTransportFor(settings, dkim);
    if (mode === 'direct') {
      // Direct to MX
      const domain = recipientEmail.split('@')[1] || '';
      const mxHost = await resolveMxHost(domain);
      return directTransportFor(settings, mxHost, dkim);
    }
    if (mode === 'socks5') {
      // Direct via SOCKS5 proxy - nodemailer uses proxy option with socks package
      const domain = recipientEmail.split('@')[1] || '';
      const mxHost = await resolveMxHost(domain);
      return directTransportFor(settings, mxHost, dkim);
    }
    return transportFor(smtp, dkim); // fallback
  }

  return {
    // Test every enabled SMTP account. Dead ones get cooled down for 6h so the
    // send pool drops them automatically; a later successful check revives them.
    async verifyAll() {
      const now = new Date().toISOString();
      const deadUntil = new Date(Date.now() + 6 * 3600000).toISOString();
      let rows = db.prepare('SELECT * FROM smtp_accounts WHERE enabled = 1').all();
      if (!rows.length && smtpRow(db)) {
        const legacy = smtpRow(db);
        rows = [{ id: 0, label: 'Legacy SMTP', host: legacy.host, port: legacy.port, secure: legacy.secure, username: legacy.username, password_encrypted: legacy.password_encrypted, from_name: legacy.from_name, from_email: legacy.from_email, reply_to: legacy.reply_to || '' }];
      }
      const results = [];
      for (const r of rows) {
        const label = r.label || r.username || `account ${r.id}`;
        let transporter = null;
        try {
          transporter = transportFor({
            host: r.host, port: r.port, secure: Boolean(r.secure),
            username: r.username, password: decryptSecret(r.password_encrypted, config.credentialKey),
          });
          await transporter.verify();
          if (r.id) db.prepare("UPDATE smtp_accounts SET fails = 0, cooldown_until = NULL, last_check = ?, last_error = '' WHERE id = ?").run(now, r.id);
          results.push({ id: r.id, label, host: r.host, ok: true, error: '' });
        } catch (err) {
          const msg = String(err.message || err).slice(0, 300);
          if (r.id) db.prepare('UPDATE smtp_accounts SET fails = fails + 1, cooldown_until = ?, last_check = ?, last_error = ? WHERE id = ?').run(deadUntil, now, msg, r.id);
          results.push({ id: r.id, label, host: r.host, ok: false, error: msg });
        } finally {
          try { transporter?.close(); } catch {}
        }
      }
      // relay mode: verify the configured relay host too
      const ss = loadSendSettings(db, config);
      if (ss.sendMode === 'relay' && ss.relayHost) {
        let transporter = null;
        try {
          transporter = relayTransportFor(ss);
          await transporter.verify();
          results.push({ id: -1, label: 'Relay', host: `${ss.relayHost}:${ss.relayPort}`, ok: true, error: '' });
        } catch (err) {
          results.push({ id: -1, label: 'Relay', host: `${ss.relayHost}:${ss.relayPort}`, ok: false, error: String(err.message || err).slice(0, 300) });
        } finally {
          try { transporter?.close(); } catch {}
        }
      }
      return { results, live: results.filter((r) => r.ok).length, total: results.length };
    },

    async relayDiag(testTo = '') {
      const s = loadSendSettings(db, config);
      if (!s.relayHost) throw Object.assign(new Error('Relay host not configured'), { statusCode: 400 });
      return diagnoseRelay({
        host: s.relayHost, port: s.relayPort, security: s.relaySecure,
        username: s.relayUsername, password: s.relayPassword, ehlo: s.relayEhlo,
        from: s.directFromEmail, testTo,
      });
    },

    async verifyRelay() {
      const settings = loadSendSettings(db, config);
      if (!settings.relayHost) throw Object.assign(new Error('Relay host not configured'), { statusCode: 400 });
      const transporter = relayTransportFor(settings);
      const start = Date.now();
      try {
        await transporter.verify();
        return { ok: true, ms: Date.now() - start, host: `${settings.relayHost}:${settings.relayPort}` };
      } finally {
        transporter.close();
      }
    },

    async verify() {
      const pool = loadSmtpPool(db, config);
      if (!pool.length) throw Object.assign(new Error('No SMTP account configured'), { statusCode: 400 });
      const transporter = transportFor(pool[0]);
      try {
        await transporter.verify();
        return { ok: true };
      } finally {
        transporter.close();
      }
    },

    preview(campaign) {
      const settings = loadSendSettings(db, config);
      return render({
        campaign,
        recipient: { id: 0, email: 'preview@example.com', firstName: 'Alex', lastName: 'Morgan', company: 'Example Ltd', custom: {} },
        totalRecipients: 1,
        settings,
      });
    },

    async send({ campaign, recipient, totalRecipients }) {
      const settings = loadSendSettings(db, config);
      const mode = settings.sendMode;
      const message = render({ campaign, recipient, totalRecipients, settings });
      const dkim = dkimFor(settings, config);
      const attachments = await buildAttachments({ campaign, message, settings, recipient });

      const buildHeaders = (fromEmail) => ({
        'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        ...buildPriorityHeaders(settings.priority),
        ...buildIdentityHeaders(settings, fromEmail, recipient.email),
        ...(settings.customHeadersEnabled ? parseCustomHeaders(settings.customHeaders) : {}),
      });

      const buildMailOpts = ({ fromName, fromEmail, replyTo }) => {
        const toName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ');
        const toAddress = { name: toName, address: recipient.email };
        const mailOpts = {
          from: { name: fromName, address: fromEmail },
          subject: message.subject,
          text: message.text,
          headers: buildHeaders(fromEmail),
          encoding: settings.encoding,
          ...(replyTo ? { replyTo } : {}),
          ...(settings.textOnly ? {} : { html: message.html }),
        };
        if (attachments.length) mailOpts.attachments = attachments;
        const sendType = settings.sendType || 'to';
        if (sendType === 'cc') { mailOpts.to = fromEmail; mailOpts.cc = toAddress; }
        else if (sendType === 'bcc') { mailOpts.to = fromEmail; mailOpts.bcc = toAddress; }
        else { mailOpts.to = toAddress; }
        return mailOpts;
      };

      // ── OAuth API engines ──
      if (mode === 'graph') {
        const { fromName, fromEmail, replyTo } = buildFrom(settings, null);
        if (!fromEmail && !settings.engineSendAs) throw new Error('Configure a from/direct email for Graph engine');
        return sendViaGraph({
          settings, recipient, fromName, fromEmail, replyTo, attachments,
          message: { ...message, extraHeaders: buildHeaders(fromEmail || settings.engineSendAs) },
        });
      }
      if (mode === 'gmail') {
        const { fromName, fromEmail, replyTo } = buildFrom(settings, null);
        const sender = settings.engineSendAs || fromEmail;
        if (!sender) throw new Error('Configure a from/direct email or Gmail send-as for Gmail engine');
        const mailOpts = buildMailOpts({ fromName, fromEmail: sender, replyTo });
        return sendViaGmail({ mailOpts, settings });
      }

      // ── SMTP pool with round-robin + failover ──
      const pool = mode === 'smtp' ? loadSmtpPool(db, config) : [null];
      if (mode === 'smtp' && !pool.length) {
        throw Object.assign(new Error('Configure at least one SMTP account'), { statusCode: 400 });
      }
      // rotate starting point
      const order = pool.length > 1 ? [...pool.slice(smtpCursor % pool.length), ...pool.slice(0, smtpCursor % pool.length)] : pool;
      smtpCursor += pool.length > 1 ? 1 : 0;

      let lastError = null;
      for (const acct of order) {
        try {
          const { fromName, fromEmail, replyTo } = buildFrom(settings, acct);
          if (!fromEmail) throw new Error(`No from email configured for mode: ${mode}`);
          const mailOpts = buildMailOpts({ fromName, fromEmail, replyTo });
          const transporter = await getTransport(settings, acct, recipient.email, dkim);
          try {
            const info = await transporter.sendMail(mailOpts);
            markAccountResult(db, acct?.id, true);
            return info;
          } catch (err) {
            markAccountResult(db, acct?.id, false);
            lastError = err;
            if (mode !== 'smtp') throw err;
          } finally {
            transporter.close();
          }
        } catch (err) {
          if (mode !== 'smtp') throw err;
          lastError = err;
        }
      }
      throw lastError || new Error('All SMTP accounts failed');
    },

    getSendSettings(db_) {
      return publicSendSettings(db_ || db);
    },

    getEffectiveRatePerMinute() {
      const settings = loadSendSettings(db, config);
      if (settings.sendMode !== 'smtp') return settings.directRatePerMinute || 10;
      const pool = loadSmtpPool(db, config);
      return pool.length ? Math.max(...pool.map((a) => a.ratePerMinute || 60)) : 30;
    },

    getSleepMs() {
      return loadSendSettings(db, config).sleepMs || 0;
    },

    getTestEmailSettings() {
      const s = loadSendSettings(db, config);
      return { enabled: s.testEmailEnabled, every: s.testEvery, destination: s.testDestination };
    },
  };
}
