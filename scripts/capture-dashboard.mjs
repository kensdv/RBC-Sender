// scripts/capture-dashboard.mjs — headless Edge walkthrough → PNG stills + GIF
// Run: node scripts/capture-dashboard.mjs   (server must be on :3000)
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GifCodec, BitmapImage, GifUtil, GifFrame } from 'gifwrap';
import sharp from 'sharp';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const OUT = resolve(process.cwd(), '../rubiconsenderpro/media');

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
});
await maskIp();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ── stills per tab ──
const tabs = { dashboard: 'dashboard', send: 'campaign', compose: 'letter', recipients: 'contacts', sorter: 'sorter', aiwriter: 'ai writer', analytics: 'analytics', smtp: 'smtp' };
for (const [name, label] of Object.entries(tabs)) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll('.nav-item')].find((e) => e.textContent.toLowerCase().includes(t));
    if (el) el.click();
  }, label);
  await sleep(1600);
  await maskIp();
  await shot(`shot-${name}`);
}

// ── gif frames: click through 4 tabs, 3 frames each ──
const codec = new GifCodec();
const gifTabs = ['dashboard', 'campaign', 'sorter', 'ai writer'];
const frames = [];
for (const t of gifTabs) {
  await page.evaluate((tab) => {
    const el = [...document.querySelectorAll('.nav-item')].find((e) => e.textContent.toLowerCase().includes(tab));
    if (el) el.click();
  }, t);
  for (let i = 0; i < 3; i++) {
    await sleep(700);
    await maskIp();
    const buf = await page.screenshot({ type: 'png' });
    const img = await sharp(buf).resize(800, 450).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bm = new BitmapImage({ data: img.data, width: img.info.width, height: img.info.height });
    frames.push(new GifFrame(bm, { delayCentisecs: 70 }));
  }
}
GifUtil.quantizeWu(frames);
const gif = await codec.encodeGif(frames, { loops: 0 });
writeFileSync(`${OUT}/walkthrough.gif`, gif.buffer);

await browser.close();
console.log('done →', OUT);
