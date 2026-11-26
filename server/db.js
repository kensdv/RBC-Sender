import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_AI_RULES } from './default-ai-rules.js';

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
      classification TEXT NOT NULL DEFAULT 'technical',
      suppression_action TEXT NOT NULL DEFAULT 'retained',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subject_variants (
      id INTEGER PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      opens INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      is_winner INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS subject_variants_campaign_idx ON subject_variants(campaign_id);
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
    CREATE TABLE IF NOT EXISTS integrations (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS disposable_domains (
      id INTEGER PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      added_at TEXT NOT NULL
    );
    PRAGMA user_version = 3;
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
  ensureColumn('max_per_hour', 'max_per_hour INTEGER NOT NULL DEFAULT 5000');
  ensureColumn('max_per_day', 'max_per_day INTEGER NOT NULL DEFAULT 50000');
  ensureColumn('warmup_enabled', 'warmup_enabled INTEGER NOT NULL DEFAULT 0');
  ensureColumn('warmup_started_at', "warmup_started_at TEXT NOT NULL DEFAULT ''");
  ensureColumn('link_cloak', 'link_cloak INTEGER NOT NULL DEFAULT 0');
  ensureColumn('cloak_base', "cloak_base TEXT NOT NULL DEFAULT ''");
  ensureColumn('relay_secure', 'relay_secure INTEGER NOT NULL DEFAULT 0');
  ensureColumn('relay_username', "relay_username TEXT NOT NULL DEFAULT ''");
  ensureColumn('relay_password_encrypted', "relay_password_encrypted TEXT NOT NULL DEFAULT ''");
  ensureColumn('relay_ehlo', "relay_ehlo TEXT NOT NULL DEFAULT ''");
  ensureColumn('engine_ms_rt_encrypted', "engine_ms_rt_encrypted TEXT NOT NULL DEFAULT ''");
  ensureColumn('engine_ms_send_as', "engine_ms_send_as TEXT NOT NULL DEFAULT ''");
  ensureColumn('api_provider', "api_provider TEXT NOT NULL DEFAULT ''");
  ensureColumn('api_key_encrypted', "api_key_encrypted TEXT NOT NULL DEFAULT ''");
  ensureColumn('api_user', "api_user TEXT NOT NULL DEFAULT ''");
  ensureColumn('api_domain', "api_domain TEXT NOT NULL DEFAULT ''");
  ensureColumn('api_url', "api_url TEXT NOT NULL DEFAULT ''");
  ensureColumn('ai_endpoint', "ai_endpoint TEXT NOT NULL DEFAULT ''");
  ensureColumn('ai_key_encrypted', "ai_key_encrypted TEXT NOT NULL DEFAULT ''");
  ensureColumn('ai_model', "ai_model TEXT NOT NULL DEFAULT ''");
  ensureColumn('ai_rules', "ai_rules TEXT NOT NULL DEFAULT ''");
  // Seed the operator's default ruleset once; a cleared field stays cleared.
  const rulesSeeded = db.prepare("SELECT value FROM integrations WHERE key = 'ai_rules_seeded'").get()?.value === '1';
  if (!rulesSeeded) {
    db.prepare("INSERT INTO send_settings (id, ai_rules) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET ai_rules = CASE WHEN ai_rules = '' THEN excluded.ai_rules ELSE ai_rules END").run(DEFAULT_AI_RULES);
    db.prepare("INSERT INTO integrations (key, value) VALUES ('ai_rules_seeded', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  }
  // Retired persona ruleset → RBC Helper (the seeded blob made the model sign as SMITH/LORD).
  const curRules = db.prepare("SELECT ai_rules FROM send_settings WHERE id = 1").get()?.ai_rules || '';
  if (/LORD's ORDER|\bSMITH\b|🫡/i.test(curRules)) {
    db.prepare('UPDATE send_settings SET ai_rules = ? WHERE id = 1').run(DEFAULT_AI_RULES);
  }
  // Retired provider models → current replacements (endpoint-gated so custom setups are untouched).
  const staleModels = [
    ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'api.groq.com'],
    ['deepseek/deepseek-chat-v3-0324:free', 'deepseek/deepseek-chat-v3-0324', 'deepseek/deepseek-chat-v3.1:free', 'openrouter.ai'],
    ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'generativelanguage.googleapis.com'],
  ];
  const fixModel = db.prepare("UPDATE send_settings SET ai_model = ? WHERE ai_model IN (?, ?) AND ai_endpoint LIKE '%' || ? || '%'");
  for (const [deadA, deadB, live, host] of staleModels) fixModel.run(live, deadA, deadB, host);
  const campaignCols = new Set(db.prepare('PRAGMA table_info(campaigns)').all().map((c) => c.name));
  if (!campaignCols.has('preheader')) db.exec("ALTER TABLE campaigns ADD COLUMN preheader TEXT NOT NULL DEFAULT ''");
  if (!campaignCols.has('attachments_json')) db.exec("ALTER TABLE campaigns ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'");
  if (!campaignCols.has('providers_json')) db.exec("ALTER TABLE campaigns ADD COLUMN providers_json TEXT NOT NULL DEFAULT '[]'");
  if (!campaignCols.has('paused')) db.exec("ALTER TABLE campaigns ADD COLUMN paused INTEGER NOT NULL DEFAULT 0");
  if (!campaignCols.has('send_time_optimization_enabled')) db.exec("ALTER TABLE campaigns ADD COLUMN send_time_optimization_enabled INTEGER NOT NULL DEFAULT 0");
  if (!campaignCols.has('lists_json')) db.exec("ALTER TABLE campaigns ADD COLUMN lists_json TEXT NOT NULL DEFAULT '[]'");
  if (!campaignCols.has('accounts_json')) db.exec("ALTER TABLE campaigns ADD COLUMN accounts_json TEXT NOT NULL DEFAULT '[]'");
  if (!campaignCols.has('accounts_random')) db.exec("ALTER TABLE campaigns ADD COLUMN accounts_random INTEGER NOT NULL DEFAULT 0");
  const recipientCols = new Set(db.prepare('PRAGMA table_info(recipients)').all().map((c) => c.name));
  if (!recipientCols.has('timezone_guessed')) db.exec("ALTER TABLE recipients ADD COLUMN timezone_guessed TEXT NOT NULL DEFAULT ''");
  if (!recipientCols.has('engagement_score')) db.exec("ALTER TABLE recipients ADD COLUMN engagement_score INTEGER NOT NULL DEFAULT 0");
  if (!recipientCols.has('last_engaged_at')) db.exec("ALTER TABLE recipients ADD COLUMN last_engaged_at TEXT NOT NULL DEFAULT ''");
  if (!recipientCols.has('engagement_events_json')) db.exec("ALTER TABLE recipients ADD COLUMN engagement_events_json TEXT NOT NULL DEFAULT '[]'");
  if (!recipientCols.has('bounce_count')) db.exec("ALTER TABLE recipients ADD COLUMN bounce_count INTEGER NOT NULL DEFAULT 0");
  if (!recipientCols.has('last_bounce_at')) db.exec("ALTER TABLE recipients ADD COLUMN last_bounce_at TEXT NOT NULL DEFAULT ''");
  if (!recipientCols.has('complaint_count')) db.exec("ALTER TABLE recipients ADD COLUMN complaint_count INTEGER NOT NULL DEFAULT 0");
  if (!recipientCols.has('last_complaint_at')) db.exec("ALTER TABLE recipients ADD COLUMN last_complaint_at TEXT NOT NULL DEFAULT ''");
  if (!recipientCols.has('valid_syntax')) db.exec("ALTER TABLE recipients ADD COLUMN valid_syntax INTEGER NOT NULL DEFAULT 1");
  if (!recipientCols.has('list_name')) db.exec("ALTER TABLE recipients ADD COLUMN list_name TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE INDEX IF NOT EXISTS idx_recipients_list ON recipients(list_name)');
  const acctCols = new Set(db.prepare('PRAGMA table_info(smtp_accounts)').all().map((c) => c.name));
  if (!acctCols.has('last_check')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN last_check TEXT");
  if (!acctCols.has('last_error')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN last_error TEXT NOT NULL DEFAULT ''");
  if (!acctCols.has('auth_type')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'password'");
  if (!acctCols.has('ms_client_id')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN ms_client_id TEXT NOT NULL DEFAULT ''");
  if (!acctCols.has('ms_rt_encrypted')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN ms_rt_encrypted TEXT NOT NULL DEFAULT ''");
  if (!acctCols.has('ms_tenant')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN ms_tenant TEXT NOT NULL DEFAULT 'common'");
  if (!acctCols.has('daily_quota')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN daily_quota INTEGER NOT NULL DEFAULT 0");
  if (!acctCols.has('sent_today')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN sent_today INTEGER NOT NULL DEFAULT 0");
  if (!acctCols.has('sent_date')) db.exec("ALTER TABLE smtp_accounts ADD COLUMN sent_date TEXT NOT NULL DEFAULT ''");
  const bounceCols = new Set(db.prepare('PRAGMA table_info(bounces)').all().map((c) => c.name));
  if (!bounceCols.has('classification')) db.exec("ALTER TABLE bounces ADD COLUMN classification TEXT NOT NULL DEFAULT ''");
  if (!bounceCols.has('suppression_action')) db.exec("ALTER TABLE bounces ADD COLUMN suppression_action TEXT NOT NULL DEFAULT ''");
  const deliveryCols = new Set(db.prepare('PRAGMA table_info(deliveries)').all().map((c) => c.name));
  if (!deliveryCols.has('variant_id')) db.exec("ALTER TABLE deliveries ADD COLUMN variant_id INTEGER");
  const variantCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subject_variants'").get();
  if (!variantCols) {
    db.exec(`
      CREATE TABLE subject_variants (
        id INTEGER PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        sent INTEGER NOT NULL DEFAULT 0,
        opens INTEGER NOT NULL DEFAULT 0,
        clicks INTEGER NOT NULL DEFAULT 0,
        is_winner INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX subject_variants_campaign_idx ON subject_variants(campaign_id);
    `);
  }
  const engagementCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='engagement_heatmap'").get();
  if (!engagementCols) {
    db.exec(`
      CREATE TABLE engagement_heatmap (
        id INTEGER PRIMARY KEY,
        campaign_id INTEGER NOT NULL,
        hour INTEGER NOT NULL,
        opens INTEGER NOT NULL DEFAULT 0,
        clicks INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE (campaign_id, hour)
      );
      CREATE INDEX engagement_heatmap_campaign_idx ON engagement_heatmap(campaign_id);
    `);
  }
  const analyticsCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='analytics_events'").get();
  if (!analyticsCols) {
    db.exec(`
      CREATE TABLE analytics_events (
        id INTEGER PRIMARY KEY,
        campaign_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        recipient_id INTEGER,
        occurred_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX analytics_events_idx ON analytics_events(campaign_id, occurred_at);
      CREATE INDEX analytics_kind_idx ON analytics_events(kind, occurred_at);
    `);
  }
  const repCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reputation_alerts'").get();
  if (!repCols) {
    db.exec(`
      CREATE TABLE reputation_alerts (
        id INTEGER PRIMARY KEY,
        target TEXT NOT NULL,
        source TEXT NOT NULL,
        listed_at TEXT NOT NULL,
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX reputation_alerts_idx ON reputation_alerts(target, source);
    `);
  }
  const disposableCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='disposable_domains'").get();
  if (!disposableCols) {
    db.exec(`
      CREATE TABLE disposable_domains (
        id INTEGER PRIMARY KEY,
        domain TEXT NOT NULL UNIQUE,
        added_at TEXT NOT NULL
      );
    `);
    db.exec(`INSERT INTO disposable_domains (domain, added_at) VALUES
      ('tempmail.org', CURRENT_TIMESTAMP),
      ('guerillamail.com', CURRENT_TIMESTAMP),
      ('mailinator.com', CURRENT_TIMESTAMP),
      ('10minutemail.com', CURRENT_TIMESTAMP),
      ('trashmail.com', CURRENT_TIMESTAMP),
      ('fakeinbox.com', CURRENT_TIMESTAMP),
      ('yopmail.com', CURRENT_TIMESTAMP),
      ('maildrop.cc', CURRENT_TIMESTAMP),
      ('dispostable.com', CURRENT_TIMESTAMP),
      ('getnada.com', CURRENT_TIMESTAMP)
    `);
  }
  const templateCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_templates'").get();
  if (!templateCols) {
    db.exec(`
      CREATE TABLE campaign_templates (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        preheader TEXT NOT NULL DEFAULT '',
        html TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        attachments_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );
    `);
  }
  const assetCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='asset_library'").get();
  if (!assetCols) {
    db.exec(`
      CREATE TABLE asset_library (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        data_url TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX asset_library_type_idx ON asset_library(type);
    `);
  }
  // campaigns.status CHECK predates the 'failed' state — rebuild the table once
  const campaignSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'campaigns'").get()?.sql || '';
  if (!campaignSql.includes("'failed'")) {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE campaigns_migrated (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          subject TEXT NOT NULL,
          preheader TEXT NOT NULL DEFAULT '',
          html TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL DEFAULT '',
          attachments_json TEXT NOT NULL DEFAULT '[]',
          providers_json TEXT NOT NULL DEFAULT '[]',
          paused INTEGER NOT NULL DEFAULT 0,
          send_time_optimization_enabled INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'scheduled', 'sending', 'completed', 'cancelled', 'failed')),
          scheduled_for TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO campaigns_migrated SELECT id, name, subject, preheader, html, text, COALESCE(attachments_json, '[]'), COALESCE(providers_json, '[]'), COALESCE(paused, 0), COALESCE(send_time_optimization_enabled, 0), status, scheduled_for, created_at, updated_at FROM campaigns;
        DROP TABLE campaigns;
        ALTER TABLE campaigns_migrated RENAME TO campaigns;
        COMMIT;
      `);
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
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
