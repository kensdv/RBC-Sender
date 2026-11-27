import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.js';

const campaignColumns = [
  'lists_json', 'accounts_json', 'accounts_random', 'tiers_json',
  'attachments_json', 'providers_json', 'paused', 'send_time_optimization_enabled',
];

test('a fresh database can store the full campaign shape', (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const columns = new Set(db.prepare('PRAGMA table_info(campaigns)').all().map((c) => c.name));
  for (const name of campaignColumns) assert.ok(columns.has(name), `campaigns is missing ${name}`);

  const now = new Date().toISOString();
  const result = db.prepare(`INSERT INTO campaigns
    (name, subject, html, lists_json, accounts_json, accounts_random, tiers_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Fresh', 'Hello', '<p>Hi</p>', '["Leads"]', '[7]', 1, '["hot"]', now, now);
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid);
  assert.equal(row.lists_json, '["Leads"]');
  assert.equal(row.accounts_json, '[7]');
  assert.equal(row.accounts_random, 1);
  assert.equal(row.tiers_json, '["hot"]');
});

test('rebuilding an old campaigns table keeps later columns and rows', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'rbc-db-'));
  const file = join(dir, 'legacy.db');

  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE campaigns (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      preheader TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      providers_json TEXT NOT NULL DEFAULT '[]',
      lists_json TEXT NOT NULL DEFAULT '[]',
      accounts_json TEXT NOT NULL DEFAULT '[]',
      accounts_random INTEGER NOT NULL DEFAULT 0,
      tiers_json TEXT NOT NULL DEFAULT '[]',
      paused INTEGER NOT NULL DEFAULT 0,
      send_time_optimization_enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'scheduled', 'sending', 'completed', 'cancelled')),
      scheduled_for TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  legacy.prepare(`INSERT INTO campaigns
    (name, subject, html, lists_json, accounts_json, accounts_random, tiers_json, status, created_at, updated_at)
    VALUES ('Legacy', 'Subject', '<p>Old</p>', '["VIP"]', '[3]', 1, '["warm"]', 'draft', ?, ?)`)
    .run(now, now);
  legacy.close();

  const db = openDatabase(file);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const columns = new Set(db.prepare('PRAGMA table_info(campaigns)').all().map((c) => c.name));
  for (const name of campaignColumns) assert.ok(columns.has(name), `campaigns is missing ${name}`);

  const row = db.prepare('SELECT * FROM campaigns WHERE name = ?').get('Legacy');
  assert.equal(row.lists_json, '["VIP"]');
  assert.equal(row.accounts_json, '[3]');
  assert.equal(row.accounts_random, 1);
  assert.equal(row.tiers_json, '["warm"]');
});
