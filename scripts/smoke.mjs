// scripts/smoke.mjs — headless boot test: logs in, walks every tab, collects errors
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const token = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DASHBOARD_TOKEN=')).split('=').slice(1).join('=').trim();

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 200)}`); });
const apiFails = [];
page.on('response', (r) => { if (r.status() >= 500) apiFails.push(`${r.status()} ${r.url().replace(BASE, '')}`); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  sessionStorage.setItem('mailerToken', t);
  localStorage.setItem('rbc_intro_seen', '1');
}, token);
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// walk every nav tab
const navLabels = await page.evaluate(() => [...document.querySelectorAll('.nav-item')].map((e) => e.textContent.trim()).filter((t) => !t.includes('LOGOUT') && !t.includes('PHOSPHOR') && !t.includes('OBSIDIAN')));
console.log('tabs found:', navLabels.length, navLabels.join(' | '));
for (const label of navLabels) {
  const clicked = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('.nav-item')].find((e) => e.textContent.trim() === t);
    if (el) { el.click(); return true; } return false;
  }, label);
  if (!clicked) { errors.push(`NAV MISS: ${label}`); continue; }
  await sleep(1400);
  const blank = await page.evaluate(() => document.querySelector('.content')?.innerText.trim().length || 0);
  if (blank < 10) errors.push(`BLANK PANE: ${label}`);
  console.log(`✓ ${label} (${blank} chars)`);
}

// theme toggle round-trip
await page.evaluate(() => { localStorage.setItem('rbc_theme', 'obsidian'); location.reload(); });
await new Promise((r) => setTimeout(r, 2500));
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
console.log('obsidian theme applied:', theme === 'obsidian');
// chat panel opens
await page.evaluate(() => (document.querySelector('.topbar-ai') || document.querySelector('.chat-fab'))?.click());
await sleep(800);
const chatOpen = await page.evaluate(() => !!document.querySelector('.chat-panel'));
console.log('chat panel opens:', chatOpen);

// mascot present on aiwriter
await page.evaluate(() => { [...document.querySelectorAll('.nav-item')].find((e) => e.textContent.includes('AI WRITER'))?.click(); });
await sleep(1200);
const mascot = await page.evaluate(() => !!document.querySelector('.rbc-mascot'));
console.log('mascot rendered:', mascot);

console.log('\n=== ERRORS ===');
errors.forEach((e) => console.log(' ✗', e));
apiFails.forEach((e) => console.log(' API5xx:', e));
console.log(errors.length + apiFails.length ? `${errors.length + apiFails.length} issue(s)` : 'CLEAN');
await browser.close();
