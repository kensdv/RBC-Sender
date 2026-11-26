// scripts/capture-dashboard.mjs — headless Edge → PNG stills + walkthrough/feature GIFs
// Run: node scripts/capture-dashboard.mjs   (server must be on :3000)
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GifCodec, BitmapImage, GifUtil, GifFrame } from 'gifwrap';
import sharp from 'sharp';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const OUT = resolve(process.cwd(), '../rubiconsenderpro/media');
const GIF_W = 800;
const GIF_H = 450;

const token = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DASHBOARD_TOKEN=')).split('=').slice(1).join('=').trim();

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate((t) => {
  sessionStorage.setItem('mailerToken', t);
  localStorage.setItem('rbc_intro_seen', '1');
  localStorage.setItem('rbc_theme', 'obsidian');
}, token);
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2500));

// mask the real egress IP in the sidebar before any capture
const maskIp = () => page.evaluate(() => {
  document.querySelectorAll('.sb-ip').forEach((el) => { el.textContent = '203.0.113.7'; });
}).catch(() => {});
await maskIp();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const written = [];
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  written.push(`${name}.png`);
};

// ── shared helpers ──
const codec = new GifCodec();

// click a sidebar nav item by visible label fragment; returns false if not found
const clickTab = (label) => page.evaluate((t) => {
  const el = [...document.querySelectorAll('.nav-item')].find((e) => e.textContent.toLowerCase().includes(t));
  if (el) { el.click(); return true; }
  return false;
}, label).catch(() => false);

// .content is the app scroll container — the window itself never scrolls (body overflow:hidden)
const scrollContent = (dy) => page.evaluate((d) => {
  const sc = document.querySelector('.content');
  if (sc && sc.scrollHeight > sc.clientHeight) sc.scrollTop += d;
  else window.scrollBy(0, d);
}, dy).catch(() => {});

const scrollTop = () => page.evaluate(() => {
  const sc = document.querySelector('.content');
  if (sc) sc.scrollTop = 0;
  window.scrollTo(0, 0);
}).catch(() => {});

// IP mask → screenshot → resize to 800×450 → append GifFrame
const grabFrame = async (frames, delayCs = 70) => {
  await maskIp();
  const buf = await page.screenshot({ type: 'png' });
  const img = await sharp(buf).resize(GIF_W, GIF_H).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  frames.push(new GifFrame(new BitmapImage({ data: img.data, width: img.info.width, height: img.info.height }), { delayCentisecs: delayCs }));
};

const encodeGif = async (frames, name) => {
  if (!frames.length) { console.warn(`  ! ${name}: no frames captured — skipped`); return; }
  GifUtil.quantizeWu(frames);
  const gif = await codec.encodeGif(frames, { loops: 0 });
  writeFileSync(`${OUT}/${name}`, gif.buffer);
  written.push(name);
  console.log(`  ✓ ${name} — ${frames.length} frames`);
};

// ── stills per tab (1600×900) ──
const tabs = { dashboard: 'dashboard', send: 'campaign', compose: 'letter', recipients: 'contacts', sorter: 'sorter', aiwriter: 'ai writer', analytics: 'analytics', smtp: 'smtp' };
for (const [name, label] of Object.entries(tabs)) {
  try {
    await clickTab(label);
    await sleep(1600);
    await maskIp();
    await shot(`shot-${name}`);
  } catch (e) {
    console.warn(`  ! shot-${name}.png failed: ${e.message}`);
  }
}

// ══ walkthrough.gif — hero montage: dashboard → campaign → letter (+scroll) → aiwriter → sorter ══
try {
  const frames = [];
  const tour = ['dashboard', 'campaign', 'letter', 'ai writer', 'sorter'];
  for (const t of tour) {
    if (!(await clickTab(t))) { console.warn(`  ! walkthrough: nav '${t}' not found — skipping tab`); continue; }
    await scrollTop();
    for (let i = 0; i < 3; i++) {
      await sleep(500);
      await grabFrame(frames);
    }
    if (t === 'letter') {
      // smooth scroll-down for motion variety — .content scrolls, window does not
      for (let i = 0; i < 4; i++) {
        await scrollContent(160);
        await sleep(250);
        await grabFrame(frames);
      }
      await scrollTop();
    }
  }
  await encodeGif(frames, 'walkthrough.gif');
} catch (e) {
  console.warn('  ! walkthrough.gif failed:', e.message);
}

// ══ aiwriter.gif — feature clip: typing a brief into the AI prompt ══
try {
  const frames = [];
  const prompt = 'Write a warm welcome email for new subscribers — under 120 words, one clear CTA.';
  if (await clickTab('ai writer')) {
    await sleep(1200);
    await scrollTop();
    const taFound = await page.evaluate(() => {
      const ta = document.querySelector('textarea.ai-prompt-input')
        || [...document.querySelectorAll('textarea')].find((e) => /brief the writer/i.test(e.placeholder || ''))
        || document.querySelector('.aw-left textarea');
      if (!ta) return false;
      ta.scrollIntoView({ block: 'center' });
      ta.focus();
      return true;
    }).catch(() => false);
    await grabFrame(frames);
    if (taFound) {
      // type in small chunks — React onChange fires on real key events; one frame per chunk
      for (let i = 0; i < prompt.length; i += 4) {
        await page.keyboard.type(prompt.slice(i, i + 4), { delay: 25 });
        await grabFrame(frames, 60);
      }
    } else {
      console.warn('  ! aiwriter: prompt textarea not found — capturing pane only');
      // click around the pane so the clip still shows interaction
      const box = await page.evaluate(() => {
        const pane = document.querySelector('.aw-left') || document.querySelector('.content');
        if (!pane) return null;
        const r = pane.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 3 };
      }).catch(() => null);
      if (box) await page.mouse.click(box.x, box.y).catch(() => {});
      for (let i = 0; i < 8; i++) { await sleep(400); await grabFrame(frames); }
    }
    // trailing frames on the finished brief
    for (let i = 0; i < 4; i++) { await sleep(450); await grabFrame(frames); }
  } else {
    console.warn("  ! aiwriter: nav 'ai writer' not found — skipping clip");
  }
  await encodeGif(frames, 'aiwriter.gif');
} catch (e) {
  console.warn('  ! aiwriter.gif failed:', e.message);
}

// ══ sorter.gif — feature clip: paste list → SORT LIST → live KPIs ══
try {
  const frames = [];
  const sample = [
    'john@gmail.com, jane@company.com',
    'info@domain.org; "Name" <user@outlook.com>',
    'admin@site.net, sales@yahoo.com, mike@hotmail.com',
    'john@gmail.com, not-an-email, bounceme@mailinator.com',
  ].join('\n');
  if (await clickTab('sorter')) {
    await sleep(1200);
    await scrollTop();
    const filled = await page.evaluate((list) => {
      const ta = document.querySelector('textarea.w-textarea.code-ta')
        || [...document.querySelectorAll('textarea')].find((e) => /anything goes|extracts the emails/i.test(e.placeholder || ''));
      if (!ta) return false;
      ta.scrollIntoView({ block: 'center' });
      // React-controlled input: use the native setter + bubbling input event
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, list);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, sample).catch(() => false);
    if (!filled) console.warn('  ! sorter: textarea not found — continuing anyway');
    await sleep(500);
    await grabFrame(frames);
    await sleep(400);
    await grabFrame(frames);
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /sort list/i.test(b.textContent) && !b.disabled);
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
    if (clicked) {
      // poll ~700ms until result KPIs render or ~40 frames elapse
      let done = false;
      for (let i = 0; i < 40 && !done; i++) {
        await sleep(700);
        await grabFrame(frames);
        done = await page.evaluate(() => !!document.querySelector('.kpi-row .kpi-card')).catch(() => false);
      }
      // hold on the results
      for (let i = 0; i < 4; i++) { await sleep(500); await grabFrame(frames, 90); }
    } else {
      console.warn('  ! sorter: SORT LIST button not found/enabled — capturing pane only');
      for (let i = 0; i < 6; i++) { await sleep(500); await grabFrame(frames); }
    }
  } else {
    console.warn("  ! sorter: nav 'sorter' not found — skipping clip");
  }
  await encodeGif(frames, 'sorter.gif');
} catch (e) {
  console.warn('  ! sorter.gif failed:', e.message);
}

// ══ dashboard-4k.png — 3840×2160 hero shot with marketing figures ══
try {
  await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
  await clickTab('dashboard');
  await sleep(2000);
  await scrollTop();
  await maskIp();
  await page.evaluate(() => {
    const figs = { 'TOTAL SENT': '5,400', 'FAILED': '329', 'IN QUEUE': '0', 'RECIPIENTS': '5,400', 'BOUNCES': '109' };
    document.querySelectorAll('.kpi-card').forEach((card) => {
      const lbl = card.querySelector('.kpi-lbl')?.textContent.trim();
      const val = card.querySelector('.kpi-val');
      if (val && figs[lbl] !== undefined) val.textContent = figs[lbl];
    });
  }).catch(() => {});
  await sleep(400);
  await maskIp();
  await page.screenshot({ path: `${OUT}/dashboard-4k.png` });
  written.push('dashboard-4k.png');
  console.log('  ✓ dashboard-4k.png — 3840×2160');
} catch (e) {
  console.warn('  ! dashboard-4k.png failed:', e.message);
}

await browser.close();
console.log('written:', written.join(', ') || '(nothing)');
console.log('done →', OUT);
