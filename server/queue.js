function recipientFromRow(row) {
  let custom = {};
  try { custom = JSON.parse(row.custom_json || '{}'); } catch {}
  return { id: row.recipient_id, email: row.email, firstName: row.first_name, lastName: row.last_name, company: row.company, custom };
}

function temporary(error) {
  return (error.responseCode >= 400 && error.responseCode < 500) || ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(error.code);
}

export function createWorker({ db, mailer, logger = console, emit = () => {} }) {
  let timer;
  let active = null;
  let stopped = true;
  let lastAttempt = 0;
  let sendCount = 0;
  const preflighted = new Set();

  function getSettings() {
    const smtp = db.prepare('SELECT rate_per_minute FROM smtp_settings WHERE id = 1').get();
    const poolRate = db.prepare('SELECT MAX(rate_per_minute) AS r FROM (SELECT 60 AS rate_per_minute FROM smtp_accounts WHERE enabled = 1)').get()?.r || 0;
    const ss = db.prepare(`SELECT send_mode, direct_rate_per_minute, sleep_ms, parallel_sends, test_email_enabled, test_every, test_destination,
      send_days_json, send_from_min, send_to_min, max_per_hour, max_per_day, warmup_enabled, warmup_started_at, timezone FROM send_settings WHERE id = 1`).get() || {};
    const mode = ss.send_mode || 'smtp';
    const ratePerMinute = mode === 'smtp'
      ? Math.max(smtp?.rate_per_minute || 30, poolRate || 0)
      : (ss.direct_rate_per_minute || 10);
    let sendDays = [];
    try { sendDays = JSON.parse(ss.send_days_json || '[]'); } catch {}
    return {
      sendMode: mode,
      ratePerMinute,
      sleepMs: ss.sleep_ms || 0,
      parallel: Math.min(30, Math.max(1, Number(ss.parallel_sends) || 1)),
      testEmailEnabled: Boolean(ss.test_email_enabled),
      testEvery: ss.test_every || 100,
      testDestination: ss.test_destination || '',
      timezone: ss.timezone || 'UTC',
      sendDays,
      sendFromMin: ss.send_from_min ?? 480,
      sendToMin: ss.send_to_min ?? 1200,
      maxPerHour: ss.max_per_hour ?? 30,
      maxPerDay: ss.max_per_day ?? 200,
      warmupEnabled: Boolean(ss.warmup_enabled),
      warmupStartedAt: ss.warmup_started_at || '',
      scheduleEnabled: db.prepare("SELECT value FROM integrations WHERE key = 'schedule_enabled'").get()?.value !== '0',
    };
  }

  // local weekday (1=Mon..7=Sun) and minute-of-day in the configured timezone
  function localClock(ctx, date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ctx.timezone || 'UTC', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
      }).formatToParts(date);
      const get = (t) => parts.find((p) => p.type === t)?.value;
      const wd = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')] || 1;
      const hour = Number(get('hour')) % 24;
      return { day: wd, minute: hour * 60 + Number(get('minute')) };
    } catch {
      const d = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      return { day: ((d.getDay() + 6) % 7) + 1, minute: d.getHours() * 60 + d.getMinutes() };
    }
  }

  function withinSchedule(ctx) {
    if (ctx.scheduleEnabled === false) return true;
    const { day, minute } = localClock(ctx);
    if (ctx.sendDays.length && !ctx.sendDays.includes(day)) return false;
    const from = ctx.sendFromMin, to = ctx.sendToMin;
    if (from === to) return true;
    return from < to ? (minute >= from && minute <= to) : (minute >= from || minute <= to);
  }

  function effectiveDailyCap(ctx) {
    let cap = ctx.maxPerDay;
    if (ctx.warmupEnabled) {
      const start = ctx.warmupStartedAt ? new Date(ctx.warmupStartedAt).getTime() : Date.now();
      const days = Math.max(0, Math.floor((Date.now() - start) / 86400000));
      cap = Math.min(cap || 5, 5 + days * 10);
    }
    return cap;
  }

  function completeCampaign(campaignId) {
    const remaining = db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE campaign_id = ? AND status IN ('queued', 'sending')").get(campaignId).count;
    if (remaining) return;
    const camp = db.prepare('SELECT id, name, subject, status FROM campaigns WHERE id = ?').get(campaignId);
    if (!camp || camp.status === 'completed' || camp.status === 'cancelled') return;
    const done = db.prepare("UPDATE campaigns SET status = 'completed', updated_at = ? WHERE id = ? AND status NOT IN ('completed', 'cancelled')").run(new Date().toISOString(), campaignId);
    if (!done.changes) return;
    const stats = db.prepare('SELECT status, COUNT(*) AS c FROM deliveries WHERE campaign_id = ? GROUP BY status').all(campaignId);
    emit('campaign_done', { campaignId, name: camp.name, subject: camp.subject, stats });
  }

  const ROW_SELECT = `
    SELECT d.id AS delivery_id, d.attempts, c.id AS campaign_id, c.name, c.subject, c.preheader, c.html, c.text, c.attachments_json,
      r.id AS recipient_id, r.email, r.first_name, r.last_name, r.company, r.custom_json
    FROM deliveries d
    JOIN campaigns c ON c.id = d.campaign_id
    JOIN recipients r ON r.id = d.recipient_id
    WHERE d.status = 'queued'
      AND c.status IN ('queued', 'scheduled', 'sending')
      AND (c.scheduled_for IS NULL OR c.scheduled_for <= ?)
      AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= ?)
      AND r.consent_confirmed = 1 AND r.suppressed = 0
    ORDER BY d.id`;

  function campaignPayload(row) {
    return { id: row.campaign_id, name: row.name, subject: row.subject, preheader: row.preheader, html: row.html, text: row.text, attachments: row.attachments_json };
  }

  async function sendOne(row, ctx) {
    const now = new Date().toISOString();
    const claimed = db.prepare("UPDATE deliveries SET status = 'sending', attempts = attempts + 1 WHERE id = ? AND status = 'queued'").run(row.delivery_id);
    if (!claimed.changes) return;
    const flipped = db.prepare("UPDATE campaigns SET status = 'sending', updated_at = ? WHERE id = ? AND status IN ('queued', 'scheduled')").run(now, row.campaign_id);
    if (flipped.changes) {
      const total = db.prepare('SELECT COUNT(*) AS count FROM deliveries WHERE campaign_id = ?').get(row.campaign_id).count;
      emit('campaign_start', { campaignId: row.campaign_id, name: row.name, subject: row.subject, total, engine: ctx.sendMode });
    }

    try {
      const total = db.prepare('SELECT COUNT(*) AS count FROM deliveries WHERE campaign_id = ?').get(row.campaign_id).count;
      const info = await mailer.send({
        campaign: campaignPayload(row),
        recipient: recipientFromRow(row),
        totalRecipients: total,
      });
      db.prepare("UPDATE deliveries SET status = 'sent', provider_message_id = ?, sent_at = ?, error = NULL WHERE id = ?").run(info.messageId || '', new Date().toISOString(), row.delivery_id);
      emit('send_ok', { campaignId: row.campaign_id, name: row.name, email: row.email });
      if (ctx.warmupEnabled) db.prepare("UPDATE send_settings SET warmup_started_at = ? WHERE id = 1 AND warmup_enabled = 1 AND warmup_started_at = ''").run(new Date().toISOString());
      sendCount++;

      // Test email: every N sends, also send a copy to test destination
      if (ctx.testEmailEnabled && ctx.testDestination && sendCount % ctx.testEvery === 0) {
        try {
          await mailer.send({
            campaign: campaignPayload(row),
            recipient: { id: 0, email: ctx.testDestination, firstName: 'Test', lastName: 'Monitor', company: 'Test', custom: {} },
            totalRecipients: total,
          });
        } catch (err) {
          logger.error(`Test email failed: ${err.message}`);
        }
      }
    } catch (error) {
      const retry = temporary(error) && row.attempts + 1 < 3;
      const nextAttempt = retry ? new Date(Date.now() + 2 ** row.attempts * 60000).toISOString() : null;
      db.prepare('UPDATE deliveries SET status = ?, next_attempt_at = ?, error = ? WHERE id = ?').run(retry ? 'queued' : 'failed', nextAttempt, String(error.message || error).slice(0, 1000), row.delivery_id);
      logger.error(`Delivery ${row.delivery_id}: ${error.message || error}`);
      emit('send_fail', { campaignId: row.campaign_id, name: row.name, email: row.email, error: String(error.message || error).slice(0, 200) });
    } finally {
      completeCampaign(row.campaign_id);
    }
  }

  async function processDue() {
    const ctx = getSettings();
    db.prepare("UPDATE deliveries SET status = 'suppressed' WHERE status = 'queued' AND recipient_id IN (SELECT id FROM recipients WHERE consent_confirmed = 0 OR suppressed = 1)").run();

    if (!withinSchedule(ctx)) return;
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    if (ctx.maxPerHour > 0) {
      const n = db.prepare("SELECT COUNT(*) AS c FROM deliveries WHERE status = 'sent' AND sent_at >= ?").get(hourAgo).c;
      if (n >= ctx.maxPerHour) return;
    }
    const dayCap = effectiveDailyCap(ctx);
    if (dayCap > 0) {
      const n = db.prepare("SELECT COUNT(*) AS c FROM deliveries WHERE status = 'sent' AND sent_at >= ?").get(dayAgo).c;
      if (n >= dayCap) return;
    }

    const slots = ctx.parallel;
    // per-slot gap so aggregate rate ≈ ratePerMinute × parallel connections
    const minGap = Math.ceil(60000 / ctx.ratePerMinute / slots) + ctx.sleepMs;
    const elapsed = Date.now() - lastAttempt;
    if (elapsed < minGap) return;

    const now = new Date().toISOString();
    let rows = db.prepare(`${ROW_SELECT} LIMIT ?`).all(now, now, slots);

    // Preflight: before a campaign's first send, verify every SMTP account.
    // Dead accounts are cooled down by verifyAll; if none are live the campaign
    // fails fast instead of burning deliveries.
    if (rows.length && ctx.sendMode === 'smtp' && typeof mailer.verifyAll === 'function') {
      const pending = [...new Set(rows.map((r) => r.campaign_id))].filter((id) => !preflighted.has(id));
      const deadCampaigns = new Set();
      for (const cid of pending) {
        preflighted.add(cid);
        const camp = rows.find((r) => r.campaign_id === cid);
        let live = 0;
        try {
          const res = await mailer.verifyAll();
          live = res.live;
          for (const a of res.results) {
            emit('smtp_check', { campaignId: cid, name: camp?.name, label: a.label, host: a.host, ok: a.ok, error: a.error });
          }
        } catch (err) {
          emit('smtp_check', { campaignId: cid, name: camp?.name, label: 'smtp pool', ok: false, error: String(err.message || err).slice(0, 200) });
        }
        if (!live) {
          deadCampaigns.add(cid);
          db.prepare("UPDATE campaigns SET status = 'failed', updated_at = ? WHERE id = ? AND status IN ('queued', 'scheduled', 'sending')").run(new Date().toISOString(), cid);
          emit('campaign_fail', { campaignId: cid, name: camp?.name, subject: camp?.subject, error: 'No live SMTP accounts — test them in the EMAIL tab' });
        }
      }
      if (deadCampaigns.size) {
        rows = rows.filter((r) => !deadCampaigns.has(r.campaign_id));
        for (const cid of deadCampaigns) completeCampaign(cid);
      }
    }

    if (!rows.length) {
      const activeCampaigns = db.prepare("SELECT id FROM campaigns WHERE status IN ('queued', 'scheduled', 'sending')").all();
      for (const campaign of activeCampaigns) completeCampaign(campaign.id);
      return;
    }

    lastAttempt = Date.now();
    await Promise.all(rows.map((row) => sendOne(row, ctx)));
  }

  function fmtMin(m) {
    const h = Math.floor(m / 60) % 24, mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // why queued deliveries aren't moving right now — null when the worker is ready to send
  function diagnose() {
    const ctx = getSettings();
    if (!withinSchedule(ctx)) {
      const days = ctx.sendDays.length ? ctx.sendDays.map((d) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d - 1] || d).join('/') : 'daily';
      return `paused — outside send window (${days} ${fmtMin(ctx.sendFromMin)}–${fmtMin(ctx.sendToMin)} ${ctx.timezone})`;
    }
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    if (ctx.maxPerHour > 0) {
      const n = db.prepare("SELECT COUNT(*) AS c FROM deliveries WHERE status = 'sent' AND sent_at >= ?").get(hourAgo).c;
      if (n >= ctx.maxPerHour) return `paused — hourly cap ${ctx.maxPerHour} reached`;
    }
    const dayCap = effectiveDailyCap(ctx);
    if (dayCap > 0) {
      const n = db.prepare("SELECT COUNT(*) AS c FROM deliveries WHERE status = 'sent' AND sent_at >= ?").get(dayAgo).c;
      if (n >= dayCap) return `paused — daily cap ${dayCap} reached`;
    }
    const next = db.prepare("SELECT MIN(next_attempt_at) AS n FROM deliveries WHERE status = 'queued' AND next_attempt_at IS NOT NULL").get().n;
    if (next && next > new Date().toISOString()) return `paused — retry backoff until ${new Date(next).toLocaleTimeString()}`;
    return null;
  }

  function tick() {
    if (stopped) return;
    if (active) return active;
    active = processDue().catch((error) => logger.error(error.message || error)).finally(() => { active = null; });
    return active;
  }

  return {
    start() {
      stopped = false;
      tick();
      timer = setInterval(tick, 1000);
      timer.unref();
    },
    kick: tick,
    diagnose,
    recheck(campaignId) { preflighted.delete(Number(campaignId)); },
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (active) await active;
    },
  };
}
