import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path) {
  const databasePath = path === ':memory:' ? path : resolve(path);
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      custom_json TEXT NOT NULL DEFAULT '{}',
      consent_confirmed INTEGER NOT NULL DEFAULT 0,
      suppressed INTEGER NOT NULL DEFAULT 0,
      suppression_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS smtp_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      secure INTEGER NOT NULL,
      username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      from_name TEXT NOT NULL,
      from_email TEXT NOT NULL,
      reply_to TEXT NOT NULL DEFAULT '',
      rate_per_minute INTEGER NOT NULL DEFAULT 30,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      preheader TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'scheduled', 'sending', 'completed', 'cancelled')),
      scheduled_for TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled', 'suppressed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      error TEXT,
      provider_message_id TEXT,
      sent_at TEXT,
      UNIQUE (campaign_id, recipient_id)
    );
    CREATE INDEX IF NOT EXISTS deliveries_queue_idx ON deliveries(status, next_attempt_at);
    CREATE TABLE IF NOT EXISTS bounces (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE,
      kind TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS send_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      send_mode TEXT NOT NULL DEFAULT 'smtp',
      direct_from_name TEXT NOT NULL DEFAULT '',
      direct_from_email TEXT NOT NULL DEFAULT '',
      direct_reply_to TEXT NOT NULL DEFAULT '',
      direct_rate_per_minute INTEGER NOT NULL DEFAULT 10,
      relay_host TEXT NOT NULL DEFAULT '',
      relay_port INTEGER NOT NULL DEFAULT 25,
      relay_helo TEXT NOT NULL DEFAULT '',
      socks5_proxy TEXT NOT NULL DEFAULT '',
      encoding TEXT NOT NULL DEFAULT 'base64',
      priority INTEGER NOT NULL DEFAULT 3,
      send_type TEXT NOT NULL DEFAULT 'to',
      sleep_ms INTEGER NOT NULL DEFAULT 0,
      encrypt_letter INTEGER NOT NULL DEFAULT 0,
      encrypt_mode TEXT NOT NULL DEFAULT 'unicode',
      fromname_encrypt INTEGER NOT NULL DEFAULT 0,
      subject_encrypt INTEGER NOT NULL DEFAULT 0,
      custom_headers_enabled INTEGER NOT NULL DEFAULT 0,
      custom_headers_json TEXT NOT NULL DEFAULT '[]',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      test_email_enabled INTEGER NOT NULL DEFAULT 0,
      test_every INTEGER NOT NULL DEFAULT 100,
      test_destination TEXT NOT NULL DEFAULT '',
      from_names_json TEXT NOT NULL DEFAULT '[]',
      subjects_json TEXT NOT NULL DEFAULT '[]',
      redirect_url TEXT NOT NULL DEFAULT '',
      spoof_from_name TEXT NOT NULL DEFAULT '',
      spoof_from_email TEXT NOT NULL DEFAULT '',
      spoof_reply_to TEXT NOT NULL DEFAULT '',
      return_path TEXT NOT NULL DEFAULT '',
      msgid_domain TEXT NOT NULL DEFAULT '',
      x_mailer TEXT NOT NULL DEFAULT '',
      fake_received INTEGER NOT NULL DEFAULT 0,
      dkim_enabled INTEGER NOT NULL DEFAULT 0,
      dkim_domain TEXT NOT NULL DEFAULT '',
      dkim_selector TEXT NOT NULL DEFAULT '',
      dkim_key_encrypted TEXT NOT NULL DEFAULT '',
      text_only INTEGER NOT NULL DEFAULT 0,
      track_opens INTEGER NOT NULL DEFAULT 0,
      track_clicks INTEGER NOT NULL DEFAULT 0,
      click_tracker_url TEXT NOT NULL DEFAULT '',
      parallel_sends INTEGER NOT NULL DEFAULT 1,
      html_randomize INTEGER NOT NULL DEFAULT 0,
      spam_bypass INTEGER NOT NULL DEFAULT 0,
      subject_b64 INTEGER NOT NULL DEFAULT 0,
      fromname_b64 INTEGER NOT NULL DEFAULT 0,
      disclaimer_text TEXT NOT NULL DEFAULT '',
      engine_client_id TEXT NOT NULL DEFAULT '',
      engine_client_secret_encrypted TEXT NOT NULL DEFAULT '',
      engine_tenant TEXT NOT NULL DEFAULT '',
      engine_refresh_token_encrypted TEXT NOT NULL DEFAULT '',
      engine_send_as TEXT NOT NULL DEFAULT '',
      attach_formats_json TEXT NOT NULL DEFAULT '[]',
      image_recompress INTEGER NOT NULL DEFAULT 0,
      send_days_json TEXT NOT NULL DEFAULT '[]',
      send_from_min INTEGER NOT NULL DEFAULT 480,
      send_to_min INTEGER NOT NULL DEFAULT 1200,
      max_per_hour INTEGER NOT NULL DEFAULT 30,
      max_per_day INTEGER NOT NULL DEFAULT 200,
      warmup_enabled INTEGER NOT NULL DEFAULT 0,
      warmup_started_at TEXT NOT NULL DEFAULT '',
      link_cloak INTEGER NOT NULL DEFAULT 0,
      cloak_base TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS smtp_accounts (
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 587,
      secure INTEGER NOT NULL DEFAULT 0,
      username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      from_name TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL,
      reply_to TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      weight INTEGER NOT NULL DEFAULT 1,
      fails INTEGER NOT NULL DEFAULT 0,
      cooldown_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracking_events (
      id INTEGER PRIMARY KEY,
      campaign_id INTEGER,
      email TEXT NOT NULL COLLATE NOCASE,
      kind TEXT NOT NULL,
      target TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tracking_events_idx ON tracking_events(email, kind);
    PRAGMA user_version = 2;
  `);
  const cols = new Set(db.prepare('PRAGMA table_info(send_settings)').all().map((c) => c.name));
  const ensureColumn = (name, ddl) => {
    if (!cols.has(name)) db.exec(`ALTER TABLE send_settings ADD COLUMN ${ddl}`);
  };
  ensureColumn('spoof_from_name', "spoof_from_name TEXT NOT NULL DEFAULT ''");
  ensureColumn('spoof_from_email', "spoof_from_email TEXT NOT NULL DEFAULT ''");
  ensureColumn('spoof_reply_to', "spoof_reply_to TEXT NOT NULL DEFAULT ''");
  ensureColumn('return_path', "return_path TEXT NOT NULL DEFAULT ''");
  ensureColumn('msgid_domain', "msgid_domain TEXT NOT NULL DEFAULT ''");
  ensureColumn('x_mailer', "x_mailer TEXT NOT NULL DEFAULT ''");
  ensureColumn('fake_received', 'fake_received INTEGER NOT NULL DEFAULT 0');
  ensureColumn('dkim_enabled', 'dkim_enabled INTEGER NOT NULL DEFAULT 0');
  ensureColumn('dkim_domain', "dkim_domain TEXT NOT NULL DEFAULT ''");
  ensureColumn('dkim_selector', "dkim_selector TEXT NOT NULL DEFAULT ''");
  ensureColumn('dkim_key_encrypted', "dkim_key_encrypted TEXT NOT NULL DEFAULT ''");
  ensureColumn('text_only', 'text_only INTEGER NOT NULL DEFAULT 0');
  ensureColumn('track_opens', 'track_opens INTEGER NOT NULL DEFAULT 0');
  ensureColumn('track_clicks', 'track_clicks INTEGER NOT NULL DEFAULT 0');
  ensureColumn('click_tracker_url', "click_tracker_url TEXT NOT NULL DEFAULT ''");
  ensureColumn('parallel_sends', 'parallel_sends INTEGER NOT NULL DEFAULT 1');
  ensureColumn('html_randomize', 'html_randomize INTEGER NOT NULL DEFAULT 0');
  ensureColumn('spam_bypass', 'spam_bypass INTEGER NOT NULL DEFAULT 0');
  ensureColumn('subject_b64', 'subject_b64 INTEGER NOT NULL DEFAULT 0');
  ensureColumn('fromname_b64', 'fromname_b64 INTEGER NOT NULL DEFAULT 0');
  ensureColumn('disclaimer_text', "disclaimer_text TEXT NOT NULL DEFAULT ''");
  ensureColumn('engine_client_id', "engine_client_id TEXT NOT NULL DEFAULT ''");
  ensureColumn('engine_client_secret_encrypted', "engine_client_secret_encrypted TEXT NOT NULL DEFAULT ''");
  ensureColumn('engine_tenant', "engine_tenant TEXT NOT NULL DEFAULT ''");
  ensureColumn('engine_refresh_token_encrypted', "engine_refresh_token_encrypted TEXT NOT NULL DEFAULT ''");
  ensureColumn('engine_send_as', "engine_send_as TEXT NOT NULL DEFAULT ''");
  ensureColumn('attach_formats_json', "attach_formats_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('image_recompress', 'image_recompress INTEGER NOT NULL DEFAULT 0');
  ensureColumn('send_days_json', "send_days_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('send_from_min', 'send_from_min INTEGER NOT NULL DEFAULT 480');
  ensureColumn('send_to_min', 'send_to_min INTEGER NOT NULL DEFAULT 1200');
  ensureColumn('max_per_hour', 'max_per_hour INTEGER NOT NULL DEFAULT 30');
  ensureColumn('max_per_day', 'max_per_day INTEGER NOT NULL DEFAULT 200');
  ensureColumn('warmup_enabled', 'warmup_enabled INTEGER NOT NULL DEFAULT 0');
  ensureColumn('warmup_started_at', "warmup_started_at TEXT NOT NULL DEFAULT ''");
  ensureColumn('link_cloak', 'link_cloak INTEGER NOT NULL DEFAULT 0');
  ensureColumn('cloak_base', "cloak_base TEXT NOT NULL DEFAULT ''");
  const campaignCols = new Set(db.prepare('PRAGMA table_info(campaigns)').all().map((c) => c.name));
  if (!campaignCols.has('preheader')) db.exec("ALTER TABLE campaigns ADD COLUMN preheader TEXT NOT NULL DEFAULT ''");
  if (!campaignCols.has('attachments_json')) db.exec("ALTER TABLE campaigns ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'");
  return db;
}

export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
