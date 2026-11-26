import { faker } from '@faker-js/faker';

const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

export function htmlToText(html = '') {
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  return String(html)
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp);|&#39;/g, (entity) => entities[entity])
    .replace(/&#(\d+);/g, (_, code) => Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- unicode lookalike encoding (inbox bypass) encoding (inbox bypass) ---
const UNICODE_MAP = {
  a:'ａ',b:'ᖯ',c:'ｃ',d:'ｄ',e:'ｅ',f:'ｆ',g:'ｇ',h:'ｈ',i:'ｉ',j:'ｊ',
  k:'ｋ',l:'ｌ',m:'ｍ',n:'ｎ',o:'ｏ',p:'ｐ',q:'ｑ',r:'ｒ',s:'ｓ',t:'ｔ',
  u:'ｕ',v:'ｖ',w:'ｗ',x:'ｘ',y:'ｙ',z:'ｚ',
  A:'Ａ',B:'Ｂ',C:'Ｃ',D:'Ｄ',E:'Ｅ',F:'Ｆ',G:'Ｇ',H:'Ｈ',I:'Ｉ',J:'Ｊ',
  K:'Ｋ',L:'Ｌ',M:'Ｍ',N:'Ｎ',O:'Ｏ',P:'Ｐ',Q:'Ｑ',R:'Ｒ',S:'Ｓ',T:'Ｔ',
  U:'Ｕ',V:'Ｖ',W:'Ｗ',X:'Ｘ',Y:'Ｙ',Z:'Ｚ',
  '0':'０','1':'１','2':'２','3':'３','4':'４',
  '5':'５','6':'６','7':'７','8':'８','9':'９',
  ':':'：',',':'，','.':'．','#':'＃',' ':'\u00a0',
};

export function encodeUnicode(text) {
  return String(text ?? '').split('').map(c => UNICODE_MAP[c] || c).join('');
}

export function encodeHtmlEntities(text) {
  return String(text ?? '').split('').map(c => `&#${c.charCodeAt(0)};`).join('');
}

export function applyEncoding(text, mode) {
  if (!text) return text;
  if (mode === 'unicode') return encodeUnicode(text);
  if (mode === 'html_entities') return encodeHtmlEntities(text);
  return text;
}

// --- Random generators ---
function randNum(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randChar(n) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randString(n = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function maskMiddle(value) {
  if (!value) return value;
  const half = Math.floor(value.length / 2);
  return value.slice(0, half) + '*'.repeat(Math.max(1, half));
}

function secretEmail(email) {
  const [local = '', domain = ''] = email.split('@');
  const half = Math.floor(local.length / 2);
  return local.slice(0, Math.max(1, half)) + '*'.repeat(Math.max(1, half)) + '@' + domain;
}

const BROWSERS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.6099.110 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Safari/17.3',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120.0.2210.133',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
];
const OS_LIST = ['Windows NT 10.0; Win64; x64', 'Macintosh; Intel Mac OS X 14_2', 'X11; Linux x86_64', 'iPhone; CPU iPhone OS 17_2 like Mac OS X', 'Linux; Android 14'];
const COUNTRIES = ['United States','United Kingdom','Canada','Australia','Germany','France','Netherlands','Singapore','Japan','Brazil','India','South Africa'];

// --- Faker-based data generation ---
export function createFakerData() {
  const phone = faker.phone.number();
  const uname = faker.internet.username ? faker.internet.username() : faker.internet.userName();
  const iban = (() => { try { return faker.finance.iban(); } catch { return randString(20).toUpperCase(); } })();
  const isbn = (() => { try { return faker.commerce.isbn({ variant: 10 }); } catch { return randNum(10); } })();
  return {
    '++rbc_data_company++': faker.company.name(),
    '++rbc_data_name++': faker.person.fullName(),
    '++rbc_data_phone++': phone,
    '++rbc_data_secret_phone++': maskMiddle(phone.replace(/\D/g, '')).slice(0, 12),
    '++rbc_data_email++': faker.internet.email(),
    '++rbc_data_uuid++': faker.string.uuid(),
    '++rbc_data_site++': faker.internet.domainName(),
    '++rbc_data_fname++': faker.person.firstName(),
    '++rbc_data_lname++': faker.person.lastName(),
    '++rbc_data_postcode++': faker.location.zipCode(),
    '++rbc_data_country++': faker.location.country(),
    '++rbc_data_state++': faker.location.state(),
    '++rbc_data_city++': faker.location.city(),
    '++rbc_data_addrs++': faker.location.streetAddress(true),
    '++rbc_data_street++': faker.location.street ? faker.location.street() : faker.location.streetAddress(),
    '++rbc_data_cc++': faker.finance.creditCardNumber(),
    '++rbc_data_expr++': faker.date.future({ years: 4 }).toLocaleDateString('en-US', { month: '2-digit', year: '2-digit' }),
    '++rbc_data_ctype++': faker.finance.creditCardIssuer ? faker.finance.creditCardIssuer() : faker.helpers.arrayElement(['Visa','Mastercard','Amex','Discover']),
    '++rbc_data_uname++': uname,
    '++rbc_data_secret_uname++': maskMiddle(uname),
    '++rbc_data_staddrs++': faker.location.streetAddress(),
    '++rbc_data_iban++': iban,
    '++rbc_data_freedomain++': faker.helpers.arrayElement(['gmail.com','yahoo.com','hotmail.com','outlook.com','protonmail.com']),
    '++rbc_data_isbn10++': isbn,
    '++rbc_data_sha1++': faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' }),
    '++rbc_data_md5++': faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' }),
    '++rbc_data_sha256++': faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
    '++rbc_data_ua++': faker.internet.userAgent(),
  };
}

export function createPlaceholderContext({ recipient, subject = '', totalRecipients = 0, unsubscribeUrl = '', now = new Date(), randomId = '', redirectUrl = '' }) {
  const email = recipient.email || '';
  const [localPart = '', domainPart = ''] = email.split('@');
  const firstName = recipient.firstName || '';
  const lastName = recipient.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || localPart;
  const domainNoTld = domainPart.includes('.') ? domainPart.slice(0, domainPart.lastIndexOf('.')) : domainPart;
  const domainCapFirst = domainPart ? domainPart.charAt(0).toUpperCase() + domainPart.slice(1) : '';
  const domainLabel = domainPart.includes('.') ? domainPart.slice(0, domainPart.indexOf('.')) : domainPart;
  const domainLabelCap = domainLabel.charAt(0).toUpperCase() + domainLabel.slice(1);

  // Per-email random values (consistent within one email, different across emails)
  const randStringVal = randString(10);
  const randCountry = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  const randBrowser = BROWSERS[Math.floor(Math.random() * BROWSERS.length)];
  const randOs = OS_LIST[Math.floor(Math.random() * OS_LIST.length)];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = now.toLocaleDateString('en-US');
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const values = {
    email,
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    company: recipient.company || '',
    domain: domainPart,
    unsubscribe_url: unsubscribeUrl,
    date: dateStr,
    time: timeStr,
    random_id: randomId,
  };

  const fields = new Map([
    // Standard bracket placeholders
    ['EMail', email], ['Email', email], ['E-mail Address', email], ['~EMail~', email],
    ['Firstname', firstName], ['FirstName', firstName], ['Vorname', firstName],
    ['Lastname', lastName], ['LastName', lastName], ['Surname', lastName], ['Nachname', lastName],
    ['Name', fullName], ['Company', values.company], ['~ID~', String(recipient.id || '')],
    ['~SUBJECT~', subject], ['EMail_LocalPart', localPart], ['EMail_DomainPart', domainPart],
    ['EMail_DomainPartNoTLD', domainNoTld], ['Mail_Empfänger_Anzahl', String(totalRecipients)],
    ['AbmeldeLink', unsubscribeUrl], ['Datum_kurz', dateStr],
    ['Datum_lang', now.toLocaleDateString('en-US', { dateStyle: 'full' })],
    ['Uhrzeit_kurz', timeStr], ['Uhrzeit_lang', now.toLocaleTimeString('en-US')],
  ]);

  for (const [key, value] of Object.entries(values)) fields.set(key, value);
  for (const [key, value] of Object.entries(recipient.custom || {})) {
    if (!fields.has(key)) fields.set(key, String(value ?? ''));
  }

  const lowerFields = new Map();
  for (const [key, value] of fields) lowerFields.set(key.toLowerCase(), value);

  // ++tag++ map — generated once per email render
  const fakerData = createFakerData();
  const rbcMap = {
    '++rbc_email++': email,
    '++rbc_email64++': Buffer.from(email).toString('base64'),
    '++rbc_domain++': domainPart,
    '++rbc_domain1++': domainLabelCap,
    '++rbc_user++': localPart,
    '++rbc_secret_email++': secretEmail(email),
    '++rbc_smtp++': email,
    '++rbc_smtp_user++': localPart,
    '++rbc_date++': dateStr,
    '++rbc_time++': timeStr,
    '++rbc_year++': String(new Date().getFullYear()),
    '++rbc_id++': randNum(8),
    '++rbc_short++': redirectUrl || '',
    '++rbc_url++': redirectUrl || '',
    '++rbc_link++': redirectUrl || '',
    '++rbc_country++': randCountry,
    '++rbc_browser++': randBrowser,
    '++rbc_os++': randOs,
    '++rbc_randstring++': randStringVal,
    '++rbc_number1++': randNum(1),
    '++rbc_number2++': randNum(2),
    '++rbc_number3++': randNum(3),
    '++rbc_number4++': randNum(4),
    '++rbc_number5++': randNum(5),
    '++rbc_number6++': randNum(6),
    '++rbc_number7++': randNum(7),
    '++rbc_number8++': randNum(8),
    '++rbc_number9++': randNum(9),
    '++rbc_number10++': randNum(10),
    '++rbc_char1++': randChar(1),
    '++rbc_char2++': randChar(2),
    '++rbc_char3++': randChar(3),
    '++rbc_char4++': randChar(4),
    '++rbc_char5++': randChar(5),
    '++rbc_char6++': randChar(6),
    '++rbc_char7++': randChar(7),
    '++rbc_char8++': randChar(8),
    '++rbc_char9++': randChar(9),
    '++rbc_char10++': randChar(10),
    ...fakerData,
  };

  return { fields, lowerFields, rbcMap };
}

export function renderTemplate(template, context, format = 'html') {
  const encode = format === 'html' ? escapeHtml : (value) => String(value ?? '');
  let result = String(template || '');

  // 1. ++tag++ replacements (literal, no HTML escaping on the keys — values are encoded)
  //    rbc_* is canonical; legacy w3ll_* aliases still resolve for old drafts
  for (const [tag, value] of Object.entries(context.rbcMap || {})) {
    result = result.split(tag).join(encode(value));
    const legacy = tag.replace('++rbc_', '++w3ll_');
    if (legacy !== tag) result = result.split(legacy).join(encode(value));
  }

  // 2. Standard [bracket] replacements
  result = result.replace(/\[([^\]\r\n]{1,100})\]/g, (match, key) => {
    const value = context.fields.get(key);
    return value === undefined ? match : encode(value);
  });

  // 3. {{mustache}} replacements
  result = result.replace(/\{\{\s*([a-zA-Z0-9_.~-]+)\s*\}\}/g, (match, key) => {
    const value = context.lowerFields.get(key.toLowerCase());
    return value === undefined ? match : encode(value);
  });

  return result;
}
