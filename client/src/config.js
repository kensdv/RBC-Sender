// Shared UI constants: defaults, navigation, SMTP presets, placeholders.

const emptyDraft = {
  name: '', subject: '', preheader: '', providers: [], lists: [],
  html: '<h1>Hello [Firstname]</h1>\n<p>Your account at ++rbc_domain1++ requires attention.</p>\n<p>Ref: ++rbc_number6++-++rbc_randstring++</p>',
  text: '',
  attachments: [],
};
const emptySmtp = { host: '', port: 587, secure: false, username: '', password: '', fromName: '', fromEmail: '', replyTo: '', ratePerMinute: 30 };
const emptyAccount = { label: '', host: '', port: 587, secure: false, username: '', password: '', refreshToken: '', fromName: '', fromEmail: '', replyTo: '', weight: 1, dailyQuota: 0 };
const emptySettings = {
  sendMode: 'smtp',
  directFromName: '', directFromEmail: '', directReplyTo: '', directRatePerMinute: 10,
  relayHost: '', relayPort: 25, socks5Proxy: '',
  encoding: 'base64', priority: 3, sendType: 'to', sleepMs: 0,
  encryptLetter: false, encryptMode: 'unicode', fromNameEncrypt: false, subjectEncrypt: false,
  customHeadersEnabled: false, customHeaders: [], timezone: 'UTC',
  testEmailEnabled: false, testEvery: 100, testDestination: '',
  fromNames: [], subjectsList: [], redirectUrl: '',
  spoofFromName: '', spoofFromEmail: '', spoofReplyTo: '', returnPath: '',
  msgidDomain: '', xMailer: '', fakeReceived: false,
  dkimEnabled: false, dkimDomain: '', dkimSelector: '', dkimConfigured: false, dkimPrivateKey: '', dkimPublicKey: '',
  textOnly: false, trackOpens: false, trackClicks: false, clickTrackerUrl: '',
  parallelSends: 1, htmlRandomize: false, spamBypass: false,
  subjectB64: false, fromnameB64: false, disclaimerText: '', disclaimerInPdf: false,
  engineClientId: '', engineClientSecret: '', engineTenant: '', engineRefreshToken: '', engineSendAs: '',
  engineMsRefreshToken: false, engineMsSendAs: '',
  attachFormats: [], imageRecompress: false,
  aiEndpoint: '', aiKey: '', aiModel: '', aiRules: '',
  apiProvider: 'sendgrid', apiKey: '', apiKeySet: false, apiUser: '', apiDomain: '', apiUrl: '',
  sendDays: [], sendFromMin: 480, sendToMin: 1200, scheduleEnabled: true, capsEnabled: false,
  relaySecure: 0, relayUsername: '', relayPassword: '', relayPasswordSet: false, relayEhlo: '',
  maxPerHour: 5000, maxPerDay: 50000, warmupEnabled: false, warmupStartedAt: '',
  linkCloak: false,
};

const INTRO_STEPS = [
  { title: 'Welcome to Rubicon Email Suite', desc: 'A self-hosted email suite with SMTP pools, direct-MX delivery, OAuth engines (Graph/Gmail API), anti-fingerprint tooling and live preview. This walkthrough takes 30 seconds.', tab: 'compose' },
  { title: '1 · Configure a send engine', desc: 'Open SETTINGS and pick a mode: SMTP (authenticated provider or account pool), DIRECT MX, RELAY/PROXY, GRAPH API, GMAIL API or HTTP API (SendGrid/SES/Mailgun+). The SMTP tab has presets for 19 providers and a credential guide.', tab: 'delivery' },
  { title: '2 · Import your list', desc: 'RECIPIENTS tab — paste CSV (email, first_name, last_name, company), confirm consent, import. VERIFY DNS checks MX/disposable/role addresses; SORT BY PROVIDER tags each mailbox.', tab: 'recipients' },
  { title: '3 · Compose the letter', desc: 'COMPOSE tab — subject, preheader, placeholders (++rbc_*++), three body modes plus a block editor, attachments, and a live preview streaming on the right with desktop/mobile toggle.', tab: 'compose' },
  { title: '4 · Delivery options', desc: 'SETTINGS tab — spoofed sender identity, DKIM signing, tracking pixel/click wrap, parallel sends (beast mode), HTML randomize, spam-word bypass, base64 subject, auto-attach formats.', tab: 'delivery' },
  { title: '5 · Send & monitor', desc: 'SEND NOW or schedule a campaign. The queue throttles per your rate settings, retries failures, and the history table shows live sent/failed/queued counts with CSV export.', tab: 'send' },
];

const BLOCK_SNIPPETS = [
  ['H1', '<h1 style="font-size:28px;margin:16px 0 8px">Heading</h1>'],
  ['H2', '<h2 style="font-size:22px;margin:14px 0 6px">Subheading</h2>'],
  ['TEXT', '<p style="margin:8px 0;line-height:1.6">Paragraph text goes here.</p>'],
  ['BUTTON', '<p style="margin:16px 0"><a href="https://" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Click here</a></p>'],
  ['IMAGE', '<p style="margin:12px 0"><img src="https://" alt="" style="max-width:100%;height:auto"></p>'],
  ['DIVIDER', '<hr style="border:none;border-top:1px solid #dddddd;margin:24px 0">'],
  ['SPACER', '<div style="height:24px"></div>'],
  ['COLS', '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0"><tr><td width="50%" valign="top" style="padding-right:8px">Left column</td><td width="50%" valign="top" style="padding-left:8px">Right column</td></tr></table>'],
  ['QUOTE', '<blockquote style="border-left:4px solid #16a34a;margin:12px 0;padding:4px 16px;color:#555555">Quote text</blockquote>'],
  ['LIST', '<ul style="margin:8px 0;padding-left:24px"><li>Item one</li><li>Item two</li></ul>'],
  ['CENTER', '<p style="text-align:center;margin:12px 0">Centered text</p>'],
  ['SMALL', '<p style="font-size:12px;color:#888888;margin:8px 0">Small print / footer text</p>'],
  ['CALENDAR', '<p style="margin:12px 0"><a href="webcal://" style="color:#2563eb">Add to calendar</a></p>'],
];

const SMTP_PRESETS = {
  gmail:      { label: 'Gmail',                host: 'smtp.gmail.com',                 port: 587, secure: false },
  gmailrelay: { label: 'Google SMTP Relay',    host: 'smtp-relay.gmail.com',          port: 587, secure: false },
  outlook:    { label: 'Outlook / Hotmail',     host: 'smtp-mail.outlook.com',          port: 587, secure: false },
  yahoo:      { label: 'Yahoo',                host: 'smtp.mail.yahoo.com',            port: 465, secure: true },
  icloud:     { label: 'iCloud',               host: 'smtp.mail.me.com',               port: 587, secure: false },
  zoho:       { label: 'Zoho Mail',            host: 'smtp.zoho.com',                  port: 587, secure: false },
  sendgrid:   { label: 'SendGrid',             host: 'smtp.sendgrid.net',              port: 587, secure: false },
  mailgun:    { label: 'Mailgun',              host: 'smtp.mailgun.org',               port: 587, secure: false },
  brevo:      { label: 'Brevo',                host: 'smtp-relay.brevo.com',           port: 587, secure: false },
  ses:        { label: 'AWS SES',              host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false },
  postmark:   { label: 'Postmark',             host: 'smtp.postmarkapp.com',           port: 587, secure: false },
  sparkpost:  { label: 'SparkPost',            host: 'smtp.sparkpostmail.com',         port: 587, secure: false },
  elastic:    { label: 'Elastic Email',        host: 'smtp.elasticemail.com',          port: 2525, secure: false },
  mandrill:   { label: 'Mandrill',             host: 'smtp.mandrillapp.com',           port: 587, secure: false },
  fastmail:   { label: 'Fastmail',             host: 'smtp.fastmail.com',              port: 587, secure: false },
  proton:     { label: 'ProtonMail',           host: 'smtp.protonmail.ch',             port: 587, secure: false },
  yandex:     { label: 'Yandex',               host: 'smtp.yandex.com',                port: 465, secure: true },
  mailru:     { label: 'Mail.ru',              host: 'smtp.mail.ru',                   port: 465, secure: true },
  aol:        { label: 'AOL',                  host: 'smtp.aol.com',                   port: 587, secure: false },
  gmx:        { label: 'GMX',                  host: 'mail.gmx.com',                   port: 587, secure: false },
};

const SMTP_GUIDES = [
  {
    title: 'Gmail / Google Workspace',
    body: 'Server smtp.gmail.com · port 587 (STARTTLS) · user: your full email address · password: a 16-letter "app password" (Google Account → Security → 2-Step Verification → App passwords). Your normal Gmail password won\'t work.',
    apply: { host: 'smtp.gmail.com', port: 587, secure: false },
  },
  {
    title: 'Microsoft 365 / Outlook',
    body: 'Server smtp.office365.com · port 587 (STARTTLS) · user: your full email address · password: your account password, or an app password if you use two-step verification. Whoever manages your Microsoft 365 must have "Authenticated SMTP" turned on for your mailbox.',
    apply: { host: 'smtp.office365.com', port: 587, secure: false },
  },
  {
    title: 'Your hosting email (cPanel, HostGator…)',
    body: 'Server mail.yourdomain.com (or the one your hosting gives you) · port 465 (SSL/TLS) or 587 (STARTTLS) · user: the full mailbox address · password: that mailbox\'s password (the same as webmail).',
    apply: { host: '', port: 465, secure: true },
  },
  {
    title: 'Google Workspace without a password (SMTP relay)',
    body: 'If your company uses Google Workspace, you can send through your account\'s "SMTP relay" with no username or password: Google authorizes it by this server\'s IP address. In admin.google.com → Apps → Google Workspace → Gmail → Routing → "SMTP relay service" → Configure: allowed senders "Only addresses in my domains", tick "Only accept mail from the specified IP addresses" and add this server\'s IP, do NOT tick "Require SMTP Authentication", tick "Require TLS encryption". Then type your address in "From Email" below.',
    apply: { host: 'smtp-relay.gmail.com', port: 587, secure: false, relay: true },
  },
];

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const m = i * 15;
  const h24 = Math.floor(m / 60), mm = m % 60;
  const h12 = h24 % 12 || 12;
  const ap = h24 < 12 ? 'AM' : 'PM';
  return { value: m, label: `${h12}:${String(mm).padStart(2, '0')} ${ap}` };
});

const DAY_LABELS = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
const fmtMin = (m) => `${String(Math.floor((m ?? 0) / 60)).padStart(2, '0')}:${String((m ?? 0) % 60).padStart(2, '0')}`;


const PLACEHOLDER_GROUPS = [
  {
    label: 'RECIPIENT', color: 'green',
    items: [
      { tag: '[Firstname]', tip: 'First name' },
      { tag: '[Lastname]', tip: 'Last name' },
      { tag: '[Name]', tip: 'Full name' },
      { tag: '[Company]', tip: 'Company' },
      { tag: '[~EMail~]', tip: 'Email address' },
      { tag: '[EMail_LocalPart]', tip: 'Local part (before @)' },
      { tag: '[EMail_DomainPart]', tip: 'Domain (after @)' },
      { tag: '++rbc_user++', tip: 'Email username' },
      { tag: '++rbc_domain++', tip: 'Full domain' },
      { tag: '++rbc_domain1++', tip: 'Domain label capitalized' },
      { tag: '++rbc_secret_email++', tip: 'Email with middle masked' },
    ],
  },
  {
    label: 'CAMPAIGN', color: 'cyan',
    items: [
      { tag: '[~SUBJECT~]', tip: 'Email subject' },
      { tag: '[AbmeldeLink]', tip: 'Unsubscribe URL' },
      { tag: '++rbc_url++', tip: 'Cloaked tracking link (google.com)' },
      { tag: '++rbc_link++', tip: 'Raw tracking link' },
      { tag: '++rbc_short++', tip: 'Redirect link' },
      { tag: '{{unsubscribe_url}}', tip: 'Unsubscribe URL (mustache)' },
    ],
  },
  {
    label: 'DATE / TIME', color: 'yellow',
    items: [
      { tag: '++rbc_date++', tip: 'Current date' },
      { tag: '++rbc_time++', tip: 'Current time' },
      { tag: '{{date}}', tip: 'Date (mustache)' },
      { tag: '{{time}}', tip: 'Time (mustache)' },
    ],
  },
  {
    label: 'RANDOM', color: 'orange',
    items: [
      { tag: '++rbc_randstring++', tip: 'Random 10-char string' },
      { tag: '{{random_id}}', tip: 'UUID' },
      { tag: '++rbc_number3++', tip: '3-digit number' },
      { tag: '++rbc_number4++', tip: '4-digit number' },
      { tag: '++rbc_number5++', tip: '5-digit number' },
      { tag: '++rbc_number6++', tip: '6-digit number' },
      { tag: '++rbc_char3++', tip: '3 random chars' },
      { tag: '++rbc_char5++', tip: '5 random chars' },
      { tag: '++rbc_char8++', tip: '8 random chars' },
    ],
  },
  {
    label: 'SYSTEM', color: 'purple',
    items: [
      { tag: '++rbc_browser++', tip: 'Random browser UA' },
      { tag: '++rbc_os++', tip: 'Random OS string' },
      { tag: '++rbc_country++', tip: 'Random country name' },
    ],
  },
  {
    label: 'IDENTITY', color: 'green',
    items: [
      { tag: '++rbc_data_fname++', tip: 'Fake first name' },
      { tag: '++rbc_data_lname++', tip: 'Fake last name' },
      { tag: '++rbc_data_name++', tip: 'Fake full name' },
      { tag: '++rbc_data_email++', tip: 'Fake email' },
      { tag: '++rbc_data_uname++', tip: 'Fake username' },
      { tag: '++rbc_data_secret_uname++', tip: 'Masked username' },
      { tag: '++rbc_data_phone++', tip: 'Fake phone' },
      { tag: '++rbc_data_secret_phone++', tip: 'Masked phone' },
      { tag: '++rbc_data_company++', tip: 'Fake company' },
      { tag: '++rbc_data_uuid++', tip: 'Fake UUID' },
    ],
  },
  {
    label: 'LOCATION', color: 'cyan',
    items: [
      { tag: '++rbc_data_country++', tip: 'Fake country' },
      { tag: '++rbc_data_city++', tip: 'Fake city' },
      { tag: '++rbc_data_state++', tip: 'Fake state' },
      { tag: '++rbc_data_postcode++', tip: 'Fake postcode' },
      { tag: '++rbc_data_addrs++', tip: 'Full fake address' },
      { tag: '++rbc_data_street++', tip: 'Fake street' },
    ],
  },
  {
    label: 'FINANCE', color: 'yellow',
    items: [
      { tag: '++rbc_data_cc++', tip: 'Fake CC number' },
      { tag: '++rbc_data_expr++', tip: 'Fake expiry date' },
      { tag: '++rbc_data_ctype++', tip: 'Fake card type' },
      { tag: '++rbc_data_iban++', tip: 'Fake IBAN' },
    ],
  },
  {
    label: 'HASH / MISC', color: 'orange',
    items: [
      { tag: '++rbc_data_md5++', tip: 'Fake MD5' },
      { tag: '++rbc_data_sha1++', tip: 'Fake SHA1' },
      { tag: '++rbc_data_sha256++', tip: 'Fake SHA256' },
      { tag: '++rbc_data_ua++', tip: 'Fake user agent' },
      { tag: '++rbc_data_site++', tip: 'Fake domain' },
    ],
  },
];


const NAV_ITEMS = [
  { id: 'dashboard',  label: 'DASHBOARD',   icon: 'dashboard' },
  { id: 'send',       label: 'CAMPAIGN',    icon: 'send' },
  { id: 'compose',    label: 'LETTER',      icon: 'compose' },
  { id: 'aiwriter',   label: 'AI WRITER',   icon: 'aiwriter' },
  { id: 'recipients', label: 'CONTACTS',    icon: 'recipients' },
  { id: 'sorter',     label: 'SORTER',      icon: 'sorter' },
  { id: 'smtp',       label: 'SMTP',        icon: 'smtp' },
  { id: 'delivery',   label: 'SETTINGS',    icon: 'delivery' },
  { id: 'schedule',   label: 'SCHEDULE',    icon: 'schedule' },
  { id: 'bounces',    label: 'BOUNCES',     icon: 'bounces' },
  { id: 'analytics',  label: 'ANALYTICS',   icon: 'analytics' },
  { id: 'help',       label: 'HELP',        icon: 'help' },
];


const BLOCK_TYPES = [
  { id: 'header', label: 'HEADER', icon: 'H' },
  { id: 'image', label: 'IMAGE', icon: 'I' },
  { id: 'text', label: 'TEXT', icon: 'T' },
  { id: 'button', label: 'BUTTON', icon: 'B' },
  { id: 'divider', label: 'DIVIDER', icon: '—' },
  { id: 'social', label: 'SOCIAL', icon: 'S' },
  { id: 'footer', label: 'FOOTER', icon: 'F' },
];


export { emptyDraft, emptySmtp, emptyAccount, emptySettings, INTRO_STEPS, BLOCK_SNIPPETS, SMTP_PRESETS, SMTP_GUIDES, TIME_OPTIONS, DAY_LABELS, fmtMin, PLACEHOLDER_GROUPS, NAV_ITEMS, BLOCK_TYPES };
