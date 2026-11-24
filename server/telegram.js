import { pushEvent, listEvents } from './events.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { escapeHtml } from './placeholders.js';

const TG_KEYS = new Set(['campaign_start', 'campaign_done', 'campaign_fail', 'open', 'bounce', 'unsubscribe']);

function getInt(db, key) {
  return db.prepare('SELECT value FROM integrations WHERE key = ?').get(key)?.value || '';
}
function setInt(db, key, value) {
  db.prepare('INSERT INTO integrations (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function telegramStatus(db, config) {
  const enc = getInt(db, 'telegram_bot_token');
  const chatId = getInt(db, 'telegram_chat_id');
  return { configured: Boolean(enc && chatId), chatId };
}

export function saveTelegram(db, config, { botToken, chatId }) {
  if (typeof botToken === 'string' && botToken.trim()) {
    setInt(db, 'telegram_bot_token', encryptSecret(botToken.trim(), config.credentialKey));
  }
  if (chatId !== undefined) setInt(db, 'telegram_chat_id', String(chatId || '').trim().slice(0, 64));
  return telegramStatus(db, config);
}

export async function sendTelegram(db, config, text, { notifyOnFail = true } = {}) {
  const enc = getInt(db, 'telegram_bot_token');
  const chatId = getInt(db, 'telegram_chat_id');
  if (!enc || !chatId) return { ok: false, error: 'Telegram not configured' };
  let token;
  try { token = decryptSecret(enc, config.credentialKey); } catch { return { ok: false, error: 'Token decrypt failed — check CREDENTIAL_KEY' }; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, error: j.description || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const DIV = '━━━━━━━━━━━━━━━━━━';
const clock = () => new Date().toLocaleString('en-GB', { hour12: false });
const e = escapeHtml;

function fmtStats(stats) {
  const map = {};
  for (const s of stats || []) map[s.status] = s.c;
  const sent = map.sent || 0, failed = map.failed || 0, queued = (map.queued || 0) + (map.sending || 0);
  const total = sent + failed + queued + (map.suppressed || 0);
  const rate = total ? Math.round((sent / total) * 100) : 0;
  return { sent, failed, queued, total, rate };
}

export function formatEvent(kind, d = {}) {
  switch (kind) {
    case 'campaign_start':
      return `🚀 <b>CAMPAIGN STARTED</b>\n${DIV}\n📛 <b>${e(d.name)}</b>\n📝 ${e(d.subject || '(no subject)')}\n👥 Recipients: <b>${d.total ?? '…'}</b>\n⚙️ Engine: ${e(d.engine || '—')}\n🕐 ${clock()}`;
    case 'campaign_queued':
      return `📥 <b>CAMPAIGN QUEUED</b>\n${DIV}\n📛 <b>${e(d.name)}</b>\n📝 ${e(d.subject || '(no subject)')}\n👥 Deliveries: <b>${d.total ?? '…'}</b>\n🕐 ${clock()}`;
    case 'campaign_done': {
      const s = fmtStats(d.stats);
      return `🏁 <b>CAMPAIGN FINISHED</b>\n${DIV}\n📛 <b>${e(d.name)}</b>\n✅ Sent: <b>${s.sent}</b>\n❌ Failed: <b>${s.failed}</b>\n⏳ Left: ${s.queued}\n📈 Success: <b>${s.rate}%</b>\n🕐 ${clock()}`;
    }
    case 'campaign_fail':
      return `⛔ <b>CAMPAIGN FAILED</b>\n${DIV}\n📛 <b>${e(d.name)}</b>\n📝 ${e(d.subject || '(no subject)')}\n❗ ${e(d.error || 'unknown error')}\n🕐 ${clock()}`;
    case 'open':
      return `👁️ <b>EMAIL OPENED</b>\n${DIV}\n📧 <code>${e(d.email)}</code>\n📛 ${e(d.name || `campaign #${d.campaignId ?? '?'}`)}\n🕐 ${clock()}`;
    case 'click':
      return `🔗 <b>LINK CLICKED</b>\n${DIV}\n📧 <code>${e(d.email)}</code>\n🎯 <code>${e(String(d.target || '').slice(0, 120))}</code>\n📛 ${e(d.name || '')}\n🕐 ${clock()}`;
    case 'bounce':
      return `⛔ <b>BOUNCE / SUPPRESSED</b>\n${DIV}\n📧 <code>${e(d.email)}</code>\n📋 ${e(d.reason || d.kind || 'bounce')}\n🕐 ${clock()}`;
    case 'unsubscribe':
      return `🚪 <b>UNSUBSCRIBED</b>\n${DIV}\n📧 <code>${e(d.email)}</code>\n🕐 ${clock()}`;
    default:
      return `${d.message || kind}`;
  }
}

// Single entry point: records the event for the live console AND relays
// important kinds to Telegram (fire-and-forget).
export function createEmitter({ db, config }) {
  return function emit(kind, data = {}) {
    pushEvent(kind, data);
    if (!TG_KEYS.has(kind)) return;
    const text = formatEvent(kind, data);
    sendTelegram(db, config, text).then((res) => {
      if (!res.ok) pushEvent('telegram_fail', { error: res.error });
    }).catch(() => {});
  };
}

export { listEvents };
