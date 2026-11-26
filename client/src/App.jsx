import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

function ChromosomeBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    // ── Neon galaxy: static stars + slow nebula glow pulses ──
    const STAR_COUNT = 400;
    const NEBULA_COUNT = 6;

    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.3 + Math.random() * 1.4,
      alpha: 0.2 + Math.random() * 0.8,
      cyan: Math.random() < 0.2,
      pulse: Math.random() * Math.PI * 2,
      pulseSpd: 0.008 + Math.random() * 0.012,
    }));

    const nebulas = Array.from({ length: NEBULA_COUNT }, () => ({
      cx: Math.random() * window.innerWidth,
      cy: Math.random() * window.innerHeight,
      r: 120 + Math.random() * 200,
      alpha: 0.06 + Math.random() * 0.12,
      pulse: Math.random() * Math.PI * 2,
      pulseSpd: 0.003 + Math.random() * 0.006,
      col: ['0,255,65', '0,220,255', '68,255,136', '0,150,255'][Math.floor(Math.random() * 4)],
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Deep dark base
      ctx.fillStyle = '#020402';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Nebula clouds — slow pulsing radial gradients
      for (const n of nebulas) {
        n.pulse += n.pulseSpd;
        const amp = 0.7 + 0.3 * Math.sin(n.pulse);
        const g = ctx.createRadialGradient(n.cx, n.cy, 0, n.cx, n.cy, n.r * amp);
        g.addColorStop(0,   `rgba(${n.col},${n.alpha * amp})`);
        g.addColorStop(0.5, `rgba(${n.col},${n.alpha * 0.4 * amp})`);
        g.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n.cx, n.cy, n.r * amp, 0, Math.PI * 2); ctx.fill();
      }

      // Stars — static positions, pulsing brightness
      for (const s of stars) {
        s.pulse += s.pulseSpd;
        const a = s.alpha * (0.6 + 0.4 * Math.sin(s.pulse));
        const col = s.cyan ? '0,220,255' : '0,255,65';
        ctx.fillStyle = `rgba(${col},${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        // Occasional bright cross for larger stars
        if (s.r > 1 && Math.random() < 0.01) {
          ctx.strokeStyle = `rgba(${col},${a * 0.8})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(s.x - s.r * 3, s.y); ctx.lineTo(s.x + s.r * 3, s.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s.x, s.y - s.r * 3); ctx.lineTo(s.x, s.y + s.r * 3); ctx.stroke();
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
}

const emptyDraft = {
  name: '', subject: '', preheader: '', providers: [],
  html: '<h1>Hello [Firstname]</h1>\n<p>Your account at ++rbc_domain1++ requires attention.</p>\n<p>Ref: ++rbc_number6++-++rbc_randstring++</p>',
  text: '',
  attachments: [],
};
const emptySmtp = { host: '', port: 587, secure: false, username: '', password: '', fromName: '', fromEmail: '', replyTo: '', ratePerMinute: 30 };
const emptyAccount = { label: '', host: '', port: 587, secure: false, username: '', password: '', fromName: '', fromEmail: '', replyTo: '', weight: 1 };
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
  dkimEnabled: false, dkimDomain: '', dkimSelector: '', dkimConfigured: false, dkimPrivateKey: '',
  textOnly: false, trackOpens: false, trackClicks: false, clickTrackerUrl: '',
  parallelSends: 1, htmlRandomize: false, spamBypass: false,
  subjectB64: false, fromnameB64: false, disclaimerText: '',
  engineClientId: '', engineClientSecret: '', engineTenant: '', engineRefreshToken: '', engineSendAs: '',
  engineMsRefreshToken: false, engineMsSendAs: '',
  attachFormats: [], imageRecompress: false,
  sendDays: [], sendFromMin: 480, sendToMin: 1200, scheduleEnabled: true, capsEnabled: false,
  relaySecure: 0, relayUsername: '', relayPassword: '', relayPasswordSet: false, relayEhlo: '',
  maxPerHour: 5000, maxPerDay: 50000, warmupEnabled: false, warmupStartedAt: '',
  linkCloak: false,
};

const INTRO_STEPS = [
  { title: 'Welcome to RBC Sender', desc: 'A self-hosted mailer with SMTP pools, direct-MX delivery, OAuth engines (Graph/Gmail API), anti-fingerprint tooling and live preview. This walkthrough takes 30 seconds.', tab: 'compose' },
  { title: '1 · Configure a send engine', desc: 'Open SETTINGS and pick a mode: SMTP (authenticated provider or account pool), DIRECT MX, RELAY/PROXY, GRAPH API or GMAIL API. The SMTP tab has presets for 19 providers and a credential guide.', tab: 'settings' },
  { title: '2 · Import your list', desc: 'RECIPIENTS tab — paste CSV (email, first_name, last_name, company), confirm consent, import. VERIFY DNS checks MX/disposable/role addresses; SORT BY PROVIDER tags each mailbox.', tab: 'recipients' },
  { title: '3 · Compose the letter', desc: 'COMPOSE tab — subject, preheader, placeholders (++rbc_*++), three body modes plus a block editor, attachments, and a live preview streaming on the right with desktop/mobile toggle.', tab: 'compose' },
  { title: '4 · Delivery options', desc: 'SETTINGS tab — spoofed sender identity, DKIM signing, tracking pixel/click wrap, parallel sends (beast mode), HTML randomize, spam-word bypass, base64 subject, auto-attach formats.', tab: 'settings' },
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
function RbcLogo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rbcg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00ff41" /><stop offset="1" stopColor="#00ffff" />
        </linearGradient>
      </defs>
      <path d="M24 2 42 12v24L24 46 6 36V12L24 2Z" fill="url(#rbcg)" opacity="0.14" stroke="url(#rbcg)" strokeWidth="2" />
      <path d="M14 20.5 24 27l10-6.5V32a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2v-11.5Z" fill="none" stroke="#eafff6" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="m14 20.5 10 6.5 10-6.5-10-6.5-10 6.5Z" fill="#eafff6" />
      <path d="M31 14.5c2.5.4 4.5 2.4 4.9 4.9M33.5 10.5c4 .7 7.3 4 8 8" stroke="#00e5a0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const DAY_LABELS = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
const fmtMin = (m) => `${String(Math.floor((m ?? 0) / 60)).padStart(2, '0')}:${String((m ?? 0) % 60).padStart(2, '0')}`;

const LETTER_TEMPLATES = [
  {
    label: '— premium templates —',
    subject: '', html: '', text: '',
  },
  {
    label: 'Welcome / Onboarding',
    subject: 'Welcome aboard, [Firstname] — your account is ready',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:32px 28px;border-radius:12px 12px 0 0">
    <div style="color:#ffffff;font-size:22px;font-weight:700">Welcome, [Firstname]</div>
    <div style="color:#93c5fd;font-size:13px;margin-top:6px">Your account at [Company] is ready</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 12px 12px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Your workspace is live. Everything you need to get started is below — most teams are up and running in under ten minutes.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:#2563eb;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Get started</a></td></tr></table>
    <p style="font-size:13px;color:#6b7280;line-height:1.7;margin:0">If the button doesn't work, copy this link: ++rbc_url++</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:12px;color:#9ca3af;margin:0">Questions? Just reply to this email — a real person reads it.</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nYour account is ready. Get started: ++rbc_url++\n\nQuestions? Just reply.`,
  },

  {
    label: 'Invoice / Receipt',
    subject: 'Your invoice from [Company] — ref ++rbc_number6++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px;border-bottom:2px solid #111827">
    <div style="font-size:20px;font-weight:800">[Company]</div>
    <div style="font-size:13px;color:#6b7280">Invoice</div>
  </div>
  <div style="padding:28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:24px">
      <tr><td style="color:#6b7280;padding:6px 0">Bill to</td><td style="text-align:right;font-weight:600">[Firstname] [Lastname]<br><span style="color:#6b7280;font-weight:400">[~EMail~]</span></td></tr>
      <tr><td style="color:#6b7280;padding:6px 0">Invoice #</td><td style="text-align:right">++rbc_number6++-++rbc_randstring++</td></tr>
      <tr><td style="color:#6b7280;padding:6px 0">Date</td><td style="text-align:right">++rbc_date++</td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;font-size:14px">
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-weight:600">Description</td><td style="padding:10px 14px;font-weight:600;text-align:right">Amount</td></tr>
      <tr><td style="padding:12px 14px">Professional services</td><td style="padding:12px 14px;text-align:right">$1,250.00</td></tr>
      <tr><td style="padding:12px 14px">Add-ons</td><td style="padding:12px 14px;text-align:right">$350.00</td></tr>
      <tr style="border-top:2px solid #111827"><td style="padding:12px 14px;font-weight:700">Total due</td><td style="padding:12px 14px;text-align:right;font-weight:800;font-size:16px">$1,600.00</td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto"><tr><td style="background:#111827;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Pay now</a></td></tr></table>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">Questions about this invoice? Reply to this email.</p>
  </div>
</div>`,
    text: `Invoice ++rbc_number6++-++rbc_randstring++\n\nBill to: [Firstname] [Lastname] <[~EMail~]>\nProfessional services: $1,250.00\nAdd-ons: $350.00\nTOTAL DUE: $1,600.00\nPay: ++rbc_url++`,
  },
  {
    label: 'Follow-up / Bump',
    subject: 'Re: [Firstname] — quick follow-up',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Bumping this to the top of your inbox — just in case it got buried.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">The short version: we can have this done for you by <strong>++rbc_date++</strong>, and there's still room in this month's schedule.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 24px">Want me to lock in a slot? Reply YES and I'll send the details.</p>
    <p style="font-size:13px;color:#6b7280;margin:0">— The [Company] team</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nBumping this — short version: we can have it done by ++rbc_date++. Reply YES and I'll send details.\n\n— [Company]`,
  },
  {
    label: 'Newsletter',
    subject: 'Your digest — [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="background:#0f172a;padding:28px;text-align:center;border-radius:12px 12px 0 0">
    <div style="color:#ffffff;font-size:22px;font-weight:800">[Company] Digest</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px">++rbc_date++ · for [Firstname]</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 28px;border-radius:0 0 12px 12px">
    <div style="margin-bottom:24px"><div style="font-size:17px;font-weight:700;margin-bottom:6px">Story one headline</div><p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0">Two or three sentences of teaser copy that makes the reader click through to the full piece.</p><a href="++rbc_url++" style="font-size:13px;color:#2563eb">Read more →</a></div>
    <div style="margin-bottom:24px"><div style="font-size:17px;font-weight:700;margin-bottom:6px">Story two headline</div><p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0">Second item summary goes here, kept short and punchy.</p><a href="++rbc_url++" style="font-size:13px;color:#2563eb">Read more →</a></div>
    <div><div style="font-size:17px;font-weight:700;margin-bottom:6px">Story three headline</div><p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0">Third item summary. Vary the topics to keep it fresh.</p><a href="++rbc_url++" style="font-size:13px;color:#2563eb">Read more →</a></div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0"><a href="++rbc_url++" style="color:#9ca3af">View in browser</a> · <a href="[AbmeldeLink]" style="color:#9ca3af">Unsubscribe</a></p>
  </div>
</div>`,
    text: `[Company] Digest — ++rbc_date++\n\n1. Story one headline — ++rbc_url++\n2. Story two headline — ++rbc_url++\n3. Story three headline — ++rbc_url++\n\nUnsubscribe: [AbmeldeLink]`,
  },
  {
    label: 'RFQ / Quote Request',
    subject: 'Request for quotation — [Firstname] / [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px;border-bottom:2px solid #0f766e">
    <div style="font-size:20px;font-weight:800;color:#0f766e">Request for Quotation</div>
    <div style="font-size:13px;color:#6b7280;margin-top:4px">Ref RFQ-++rbc_number6++ · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Dear [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">We are sourcing proposals for an upcoming project and your company came recommended. Could you share your best pricing and lead time for the scope below?</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;font-size:14px;margin:16px 0">
      <tr style="background:#f0fdfa"><td style="padding:10px 14px;font-weight:600">Item</td><td style="padding:10px 14px;font-weight:600">Qty</td><td style="padding:10px 14px;font-weight:600;text-align:right">Target date</td></tr>
      <tr><td style="padding:12px 14px">Item description one</td><td style="padding:12px 14px">10</td><td style="padding:12px 14px;text-align:right">++rbc_date++</td></tr>
      <tr><td style="padding:12px 14px">Item description two</td><td style="padding:12px 14px">5</td><td style="padding:12px 14px;text-align:right">++rbc_date++</td></tr>
    </table>
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px">Please reply with your quotation, payment terms and any questions — we'd like to decide by end of week.</p>
    <p style="font-size:13px;color:#6b7280;margin:0">Regards,<br><strong>[Name]</strong><br>[Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Dear [Firstname],\n\nRequest for quotation — Ref RFQ-++rbc_number6++ (++rbc_date++)\n\nScope:\n- Item one ×10\n- Item two ×5\n\nPlease reply with pricing, terms and lead time.`,
  },
  {
    label: 'Meeting Request',
    subject: 'Quick call? — [Firstname] / [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">I'd love to set up 20 minutes to walk you through what we're doing at [Company] — I think there's a real fit with what you're building.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px">Does <strong>++rbc_date++</strong> work? I'm flexible Thursday and Friday afternoon if not.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:#0f766e;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Pick a time</a></td></tr></table>
    <p style="font-size:13px;color:#6b7280;margin:0">Or just reply with a couple of slots that suit you.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:13px;color:#6b7280;margin:0">[Name] · [Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\n20-minute call about [Company]? Does ++rbc_date++ work — or reply with slots.\n\n[Name] · [~EMail~]`,
  },
  {
    label: 'Payment Reminder',
    subject: 'Friendly reminder — invoice ++rbc_number6++ due ++rbc_date++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Just a friendly nudge — invoice <strong>++rbc_number6++-++rbc_randstring++</strong> for <strong>$1,600.00</strong> is due <strong>++rbc_date++</strong>.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px">If it's already been taken care of, ignore this — and thanks again for the business.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#111827;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Pay invoice</a></td></tr></table>
    <p style="font-size:13px;color:#6b7280;margin:20px 0 0">Questions? Reply here or call us directly.</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nReminder: invoice ++rbc_number6++-++rbc_randstring++ ($1,600.00) due ++rbc_date++.\nPay: ++rbc_url++`,
  },
  {
    label: 'Proposal / Estimate',
    subject: 'Your proposal from [Company] — [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="background:linear-gradient(135deg,#111827,#312e81);padding:30px 28px;border-radius:12px 12px 0 0">
    <div style="color:#ffffff;font-size:20px;font-weight:800">Proposal for [Firstname]</div>
    <div style="color:#a5b4fc;font-size:13px;margin-top:6px">Prepared by [Company] · valid until ++rbc_date++</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 12px 12px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Attached is our proposal covering the scope we discussed. Here's the headline:</p>
    <div style="background:#f9fafb;border-left:4px solid #4f46e5;padding:16px 20px;margin:0 0 20px;font-size:14px;line-height:1.7">
      <strong>Investment:</strong> $4,800 one-time<br>
      <strong>Timeline:</strong> 3 weeks from kickoff<br>
      <strong>Includes:</strong> setup, training, 30-day support
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#4f46e5;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Review proposal</a></td></tr></table>
    <p style="font-size:13px;color:#6b7280;margin:20px 0 0">Happy to jump on a call and walk through any of it.</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nProposal from [Company] — Investment $4,800, 3-week timeline.\nReview: ++rbc_url++`,
  },
  {
    label: 'Appointment Confirmation',
    subject: 'Confirmed: your appointment ++rbc_date++ ++rbc_time++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px;text-align:center">
    <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:26px">✓</div>
    <div style="font-size:20px;font-weight:800;margin-bottom:4px">You're booked, [Firstname]</div>
    <div style="font-size:14px;color:#6b7280">Appointment confirmed</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin:0 28px 28px;text-align:center">
    <div style="font-size:24px;font-weight:800;color:#0f766e">++rbc_date++</div>
    <div style="font-size:15px;color:#4b5563;margin-top:4px">++rbc_time++</div>
    <div style="font-size:13px;color:#9ca3af;margin-top:8px">with the [Company] team</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto 0"><tr><td style="background:#0f766e;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:11px 26px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px">Add to calendar</a></td></tr></table>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0 28px 24px">Need to reschedule? Just reply to this email.</p>
</div>`,
    text: `Confirmed, [Firstname] — appointment ++rbc_date++ at ++rbc_time++ with [Company].\nReschedule: reply to this email.`,
  },
  {
    label: 'Order Confirmation',
    subject: 'Order confirmed — ref ++rbc_number6++',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:32px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:19px;font-weight:bold">[Company]</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Order confirmation</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.8;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.8;margin:0 0 16px">Thanks for your order. We've received it and it's being processed — you'll get a shipping update once it leaves our warehouse.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ddd;font-size:13px;margin:18px 0">
      <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold">Order ref</td><td style="padding:8px 12px;text-align:right">++rbc_number6++-++rbc_randstring++</td></tr>
      <tr><td style="padding:8px 12px">Placed</td><td style="padding:8px 12px;text-align:right">++rbc_date++ ++rbc_time++</td></tr>
      <tr><td style="padding:8px 12px">Ships to</td><td style="padding:8px 12px;text-align:right">[Firstname] [Lastname]</td></tr>
    </table>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0">Questions about the order? Just reply — it comes straight to us.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nOrder confirmed — ref ++rbc_number6++-++rbc_randstring++ (placed ++rbc_date++).\nYou'll get a shipping update shortly.`,
  },
  {
    label: 'Shipping / Delivery Notice',
    subject: 'Your shipment is on its way — ref ++rbc_number6++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:2px solid #444">
    <div style="font-size:18px;font-weight:bold">Shipment update</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Ref ++rbc_number6++-++rbc_randstring++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Good news — your package shipped today and is out for delivery. Expected arrival: <strong>++rbc_date++</strong>.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Track it here: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0">Someone needs to be available to sign, or you can redirect delivery from the tracking page.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Company] Customer Service · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nYour shipment (ref ++rbc_number6++-++rbc_randstring++) shipped today — expected ++rbc_date++.\nTrack: ++rbc_url++`,
  },
  {
    label: 'Service Recovery / Apology',
    subject: 'Sorry about ++rbc_date++ — and what we are doing about it',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">I'm writing personally about the delay you experienced. There's no good excuse — we missed our own deadline and that's on us.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Here's what we've done: the job is now assigned to a senior team member, you'll get daily updates until it's done, and I've applied a credit to your account for the inconvenience.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">If you'd rather talk it through, call me directly — my number is below. I want to make this right.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">[Name]<br><span style="color:#777;font-size:13px">[Company] · [~EMail~]</span></p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nSorry about the delay — we missed our deadline and that's on us.\nThe job is reassigned, you'll get daily updates, and I've credited your account.\nCall me directly if you'd rather talk: [Name] · [~EMail~]`,
  },
  {
    label: 'Contract / Agreement',
    subject: 'Agreement for signature — [Company] / [Firstname]',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:18px;font-weight:bold">Service Agreement</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Between [Company] and [Firstname] [Lastname] · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.8;margin:0 0 14px">Dear [Firstname],</p>
    <p style="font-size:14px;line-height:1.8;margin:0 0 14px">Please find the agreement for the work we discussed. Key terms are summarized below — the full document is attached.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ddd;font-size:13px;margin:18px 0">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee"><strong>Scope</strong></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">As discussed</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee"><strong>Term</strong></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">12 months</td></tr>
      <tr><td style="padding:8px 12px"><strong>Fee</strong></td><td style="padding:8px 12px;text-align:right">Per attached schedule</td></tr>
    </table>
    <p style="font-size:14px;line-height:1.8;margin:0 0 20px">You can review and sign electronically here: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:14px;line-height:1.8;margin:0">Let me know if any clause needs clarification before you sign.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Name] · [Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Dear [Firstname],\n\nService agreement attached — scope as discussed, 12-month term, fee per schedule.\nReview & sign: ++rbc_url++`,
  },
  {
    label: 'Partnership / Intro',
    subject: 'Quick intro — [Company] × [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">I came across [Company] while researching partners in your space — what you're doing with ++rbc_domain1++ caught my eye.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">We help companies like yours with [short description of offering]. I think there's a clean fit — happy to send a one-pager if useful.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Worth a 15-minute call next week? I can work around your schedule.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">Best,<br><strong>[Name]</strong><br><span style="color:#777;font-size:13px">[Company] · [~EMail~]</span></p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nCame across [Company] — liked what you're doing. We help with [offering]; think there's a fit.\nWorth 15 minutes next week?\n\n[Name] · [~EMail~]`,
  },
  {
    label: 'Review / Testimonial Request',
    subject: 'How did we do? — [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Your project wrapped up recently and I'd genuinely value your honest feedback — good or bad.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">It takes about two minutes: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0">If anything fell short, tell me directly — I'd rather hear it from you than find out later.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Name] · [Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nHow did we do? Honest feedback welcome — takes 2 min: ++rbc_url++`,
  },

  {
    label: 'Event Invitation',
    subject: 'You are invited — [event name], ++rbc_date++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="background:#1f2937;padding:34px 28px;text-align:center">
    <div style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:.5px">You're invited</div>
    <div style="color:#d1d5db;font-size:14px;margin-top:6px">[event name] · hosted by [Company]</div>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:28px;text-align:center">
    <div style="font-size:26px;font-weight:bold;margin-bottom:4px">++rbc_date++</div>
    <div style="font-size:15px;color:#444">++rbc_time++</div>
    <div style="font-size:13px;color:#777;margin:8px 0 24px">[venue or video link]</div>
    <a href="++rbc_url++" style="display:inline-block;background:#1f2937;color:#fff;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:14px">RSVP</a>
    <p style="font-size:12px;color:#999;margin:24px 0 0">Hi [Firstname] — spots are limited, RSVP by ++rbc_date++.</p>
  </div>
</div>`,
    text: `You're invited — [event name]\n\n++rbc_date++ at ++rbc_time++ · [venue]\nRSVP: ++rbc_url++`,
  },
  {
    label: 'Holiday / Office Hours',
    subject: 'Office hours over the holidays — [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Quick heads-up on our holiday schedule so nothing catches you off guard:</p>
    <ul style="font-size:14px;line-height:1.9;color:#333;padding-left:20px;margin:0 0 18px">
      <li><strong>++rbc_date++ – ++rbc_date++:</strong> office closed, limited email monitoring</li>
      <li><strong>++rbc_date++ onwards:</strong> full service resumes</li>
      <li>Urgent issues: reply with URGENT in the subject and it gets escalated</li>
    </ul>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Anything that can't wait, send it now and we'll pick it up first thing back.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">Happy holidays,<br><strong>The [Company] team</strong></p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nHoliday hours: closed ++rbc_date++ – ++rbc_date++. Full service resumes ++rbc_date++.\nUrgent? Reply with URGENT in subject.\n\n— [Company]`,
  },
  {
    label: 'Account Statement',
    subject: 'Your statement — ++rbc_date++ · [Company]',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:18px;font-weight:bold">Account statement</div>
    <div style="font-size:12px;color:#777;margin-top:2px">[Firstname] [Lastname] · [~EMail~] · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:20px">
      <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold">Date</td><td style="padding:8px 12px;font-weight:bold">Description</td><td style="padding:8px 12px;font-weight:bold;text-align:right">Amount</td></tr>
      <tr><td style="padding:8px 12px">++rbc_date++</td><td style="padding:8px 12px">Service charge</td><td style="padding:8px 12px;text-align:right">$120.00</td></tr>
      <tr><td style="padding:8px 12px">++rbc_date++</td><td style="padding:8px 12px">Add-on service</td><td style="padding:8px 12px;text-align:right">$85.00</td></tr>
      <tr style="border-top:2px solid #222"><td colspan="2" style="padding:8px 12px;font-weight:bold">Balance due</td><td style="padding:8px 12px;text-align:right;font-weight:bold">$205.00</td></tr>
    </table>
    <p style="font-size:14px;line-height:1.7;margin:0">View the full statement online: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Company] Billing · [~EMail~]</p>
  </div>
</div>`,
    text: `Statement — ++rbc_date++\n\nService charge $120.00\nAdd-on $85.00\nBalance due: $205.00\nFull statement: ++rbc_url++`,
  },
  {
    label: 'Price Quote / Estimate',
    subject: 'Quote for [Firstname] — valid until ++rbc_date++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:2px solid #2c5282">
    <div style="font-size:18px;font-weight:bold;color:#2c5282">Quotation</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Prepared for [Firstname] [Lastname] · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px">As requested, here's our pricing for the work discussed:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ddd;font-size:13px;margin:16px 0">
      <tr style="background:#ebf2fa"><td style="padding:9px 12px;font-weight:bold">Item</td><td style="padding:9px 12px;font-weight:bold;text-align:right">Price</td></tr>
      <tr><td style="padding:9px 12px">Line item one — description</td><td style="padding:9px 12px;text-align:right">$450.00</td></tr>
      <tr><td style="padding:9px 12px">Line item two — description</td><td style="padding:9px 12px;text-align:right">$780.00</td></tr>
      <tr><td style="padding:9px 12px">Line item three — description</td><td style="padding:9px 12px;text-align:right">$320.00</td></tr>
      <tr style="border-top:2px solid #2c5282"><td style="padding:9px 12px;font-weight:bold">Total</td><td style="padding:9px 12px;text-align:right;font-weight:bold">$1,550.00</td></tr>
    </table>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 18px">Valid until ++rbc_date++. Payment terms: 50% upfront, balance on completion.</p>
    <a href="++rbc_url++" style="display:inline-block;background:#2c5282;color:#fff;padding:11px 28px;text-decoration:none;font-weight:bold;font-size:13px">Accept quote</a>
    <p style="font-size:13px;color:#555;margin:18px 0 0">Questions on any line? Reply and I'll walk you through it.</p>
  </div>
</div>`,
    text: `Quote for [Firstname] — valid until ++rbc_date++\n\nItem one $450 · Item two $780 · Item three $320\nTOTAL: $1,550.00\nAccept: ++rbc_url++`,
  },
  {
    label: 'Thank You Note',
    subject: 'Thank you — [Firstname]',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#222">
  <div style="padding:36px 32px">
    <p style="font-size:15px;line-height:1.9;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 16px">I just wanted to say thank you. The way you handled [recent thing] made a real difference on our end — it doesn't go unnoticed.</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 24px">We're lucky to work with people like you. Looking forward to the next project.</p>
    <p style="font-size:15px;line-height:1.9;margin:0">Warmly,<br><strong>[Name]</strong><br><span style="color:#777;font-size:13px">[Company] · [~EMail~]</span></p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nThank you — the way you handled things recently made a real difference.\nLooking forward to next time.\n\n[Name] · [~EMail~]`,
  },
  {
    label: 'NDA / Confidentiality',
    subject: 'NDA for review — [Company] / [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:18px;font-weight:bold">Non-Disclosure Agreement</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Mutual NDA · prepared ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Dear [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Ahead of our discussions, I've attached a mutual NDA covering the information we'll share. It's a standard two-way agreement — nothing unusual.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Please review and sign at your convenience: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a>. Happy to adjust any terms if your legal team has preferences.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">Best,<br><strong>[Name]</strong><br><span style="color:#777;font-size:13px">[Company] · [~EMail~]</span></p>
  </div>
</div>`,
    text: `Dear [Firstname],\n\nMutual NDA attached ahead of our discussions — standard two-way terms.\nReview & sign: ++rbc_url++`,
  },
  {
    label: 'Reference / Recommendation',
    subject: 'Reference for [Firstname] [Lastname]',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:36px 32px">
    <p style="font-size:14px;line-height:1.9;margin:0 0 16px">To whom it may concern,</p>
    <p style="font-size:14px;line-height:1.9;margin:0 0 16px">I am writing to recommend [Firstname] [Lastname], who worked with us at [Company] as [role] from ++rbc_date++ to ++rbc_date++.</p>
    <p style="font-size:14px;line-height:1.9;margin:0 0 16px">During that time [Firstname] consistently [key strength]. What stood out most was [specific example]. I would hire them again without hesitation.</p>
    <p style="font-size:14px;line-height:1.9;margin:0 0 24px">Please feel free to contact me with any questions.</p>
    <p style="font-size:14px;line-height:1.9;margin:0">Sincerely,<br><strong>[Name]</strong><br>[Title], [Company]<br>[~EMail~]</p>
  </div>
</div>`,
    text: `To whom it may concern,\n\nI recommend [Firstname] [Lastname] ([role], ++rbc_date++ – ++rbc_date++). Consistently strong on [strength]; standout example: [example]. Would rehire without hesitation.\n\n[Name] · [~EMail~]`,
  },
  {
    label: 'Deadline / Action Notice',
    subject: 'Action needed by ++rbc_date++ — [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">This is a reminder that we need [the thing — e.g. signed agreement, updated details, payment] from you by <strong>++rbc_date++</strong> to keep everything on schedule.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">It takes about five minutes: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0">If the deadline is a problem, let me know and we'll find another option — just don't let it slip silently.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Name] · [Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nNeed [item] from you by ++rbc_date++ to stay on schedule.\nTakes 5 min: ++rbc_url++\nIssues? Just reply.`,
  },
  {
    label: 'Job Application Follow-up',
    subject: 'Following up — application for [position]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Dear Hiring Manager,</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">I applied for the [position] role on ++rbc_date++ (ref ++rbc_number6++) and wanted to follow up on my application.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">I've attached my updated CV and portfolio. I'm particularly drawn to [specific reason related to company], and I'd welcome the chance to discuss how my experience with [relevant skill] could contribute.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Happy to make time for a call at your convenience.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">Thank you for your consideration,<br><strong>[Firstname] [Lastname]</strong><br><span style="color:#777;font-size:13px">[~EMail~] · [portfolio/LinkedIn]</span></p>
  </div>
</div>`,
    text: `Dear Hiring Manager,\n\nFollowing up on my application for [position] (ref ++rbc_number6++, applied ++rbc_date++). CV + portfolio attached. Drawn to [reason]; happy to discuss [skill].\n\n[Firstname] [Lastname] · [~EMail~]`,
  },
  {
    label: 'Product Update',
    subject: 'What we shipped this month — [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:18px;font-weight:bold">Product update</div>
    <div style="font-size:12px;color:#777;margin-top:2px">[Company] · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 18px">Quick roundup of what changed since last month — mostly things you asked for:</p>
    <ul style="font-size:14px;line-height:1.9;color:#333;padding-left:20px;margin:0 0 18px">
      <li><strong>Faster exports</strong> — reports now generate in seconds, not minutes</li>
      <li><strong>Bulk edits</strong> — update multiple records at once</li>
      <li><strong>Fixed</strong> the sync issue a few of you flagged</li>
    </ul>
    <p style="font-size:14px;line-height:1.7;margin:0 0 18px">Full changelog: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:13px;color:#555;margin:0">Something missing? Reply and tell us — it goes straight to the roadmap.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Company] Product Team · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nThis month: faster exports, bulk edits, and the sync fix you flagged.\nChangelog: ++rbc_url++`,
  },


];

const escapeHtmlText = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainPreviewDoc = (text) => `<!doctype html><html><body style="margin:0;background:#f4f4f5"><div style="max-width:600px;margin:24px auto;background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:32px;font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.7;color:#27272a;white-space:pre-wrap">${escapeHtmlText(text)}</div></body></html>`;

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
  { id: 'dashboard',  label: 'DASHBOARD',   icon: '◈' },
  { id: 'compose',    label: 'LETTER',      icon: '✉' },
  { id: 'recipients', label: 'MAIL LIST',   icon: '☰' },
  { id: 'smtp',       label: 'EMAIL',       icon: '⚙' },
  { id: 'delivery',   label: 'SETTINGS',    icon: '⚡' },
  { id: 'schedule',   label: 'SCHEDULE',    icon: '◷' },
  { id: 'bounces',    label: 'BOUNCES',     icon: '⚠' },
  { id: 'send',       label: 'SEND',        icon: '▶' },
];

const EVENT_STYLE = {
  send_ok:          { icon: '✓', color: 'var(--green)',  label: 'SENT' },
  send_fail:        { icon: '✗', color: 'var(--red)',    label: 'FAIL' },
  campaign_start:   { icon: '▶', color: 'var(--cyan)',   label: 'START' },
  campaign_queued:  { icon: '⇩', color: 'var(--cyan)',   label: 'QUEUE' },
  campaign_done:    { icon: '■', color: 'var(--purple)', label: 'DONE' },
  open:             { icon: '◉', color: 'var(--yellow)', label: 'OPEN' },
  click:            { icon: '↗', color: 'var(--cyan)',   label: 'CLICK' },
  bounce:           { icon: '⛔', color: 'var(--red)',    label: 'BOUNCE' },
  unsubscribe:      { icon: '⊘', color: 'var(--orange)', label: 'UNSUB' },
  telegram_fail:    { icon: '⚠', color: 'var(--orange)', label: 'TG-ERR' },
  smtp_check:       { icon: '⇄', color: 'var(--cyan)',   label: 'SMTP' },
  campaign_fail:    { icon: '✗', color: 'var(--red)',    label: 'FAIL' },
  info:             { icon: '·', color: 'var(--txt-dim)', label: 'INFO' },
};

function eventLine(ev) {
  switch (ev.kind) {
    case 'send_ok':         return `${ev.email}`;
    case 'send_fail':       return `${ev.email} — ${ev.error || 'failed'}`;
    case 'campaign_start':  return `${ev.name} — "${ev.subject || '(no subject)'}" · ${ev.total ?? '?'} recipients · ${ev.engine || ''}`;
    case 'campaign_queued': return `${ev.name} — "${ev.subject || '(no subject)'}" · ${ev.total ?? '?'} queued${ev.scheduledFor ? ' · scheduled ' + new Date(ev.scheduledFor).toLocaleString() : ''}`;
    case 'smtp_check':      return `${ev.ok ? '✓' : '✗'} ${ev.label || 'smtp'}${ev.host ? ' @ ' + ev.host : ''}${ev.ok ? '' : ' — ' + (ev.error || 'failed')}`;
    case 'campaign_fail':   return `${ev.name} FAILED — ${ev.error || 'error'}`;
    case 'campaign_done': {
      const s = {};
      for (const r of ev.stats || []) s[r.status] = r.c;
      return `${ev.name} — sent ${s.sent || 0} · failed ${s.failed || 0} · left ${(s.queued || 0) + (s.sending || 0)}`;
    }
    case 'open':            return `${ev.email} opened ${ev.name ? `“${ev.name}”` : ''}`;
    case 'click':           return `${ev.email} → ${String(ev.target || '').slice(0, 80)}`;
    case 'bounce':          return `${ev.email} — ${ev.reason || ev.kind}`;
    case 'unsubscribe':     return `${ev.email} unsubscribed`;
    case 'telegram_fail':   return `telegram: ${ev.error}`;
    default:                return ev.message || ev.kind;
  }
}

function LiveConsole({ events }) {
  const ref = useRef(null);
  const list = (events || []).slice(-100);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length]);
  return (
    <div className="console" ref={ref}>
      {list.length === 0 && <div className="console-empty">[ AWAITING EVENTS — SENDS, OPENS, CLICKS, BOUNCES STREAM HERE ]</div>}
      {list.map((ev, i) => {
        const st = EVENT_STYLE[ev.kind] || EVENT_STYLE.info;
        return (
          <div key={i} className="console-line">
            <span className="console-ts">{new Date(ev.ts).toLocaleTimeString('en-GB', { hour12: false })}</span>
            <span className="console-ico" style={{ color: st.color }}>{st.icon}</span>
            <span className="console-tag" style={{ color: st.color }}>{st.label}</span>
            <span className="console-msg">{eventLine(ev)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('mailerToken') || '');
  const [loginToken, setLoginToken] = useState('');
  const [state, setState] = useState(null);
  const [netInfo, setNetInfo] = useState(null);
  const [tgToken, setTgToken] = useState('');
  const [tgChat, setTgChat] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedId, setSelectedId] = useState(null);
  const [smtp, setSmtp] = useState(emptySmtp);
  const [acctForm, setAcctForm] = useState(emptyAccount);
  const [editingAcct, setEditingAcct] = useState(null);
  const [settings, setSettings] = useState(emptySettings);
  const [csv, setCsv] = useState('email,first_name,last_name,company\nalex@example.com,Alex,Morgan,Example Ltd');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [preview, setPreview] = useState(null);
  const [verifyResults, setVerifyResults] = useState(null);
  const [extraRecipients, setExtraRecipients] = useState([]);
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [versionInfo, setVersionInfo] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [relayTest, setRelayTest] = useState({ state: 'idle' });
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem('rbc_intro_seen'));
  const [introStep, setIntroStep] = useState(0);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('ok');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [bodyMode, setBodyMode] = useState('html');
  const [extraTemplates, setExtraTemplates] = useState([]);
  const htmlRef = useRef(null);
  const pasteRef = useRef(null);
  const textRef = useRef(null);

  async function refresh(activeToken = token) {
    const next = await api(activeToken, '/api/state');
    setState(next);
    setSmtp({ ...emptySmtp, ...next.smtp, password: '' });
    if (next.sendSettings) setSettings({ ...emptySettings, ...next.sendSettings });
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('gmail') === 'connected') {
      showNotice(`Google account connected${q.get('email') ? ` — ${q.get('email')}` : ''}. Refresh token stored.`);
      window.history.replaceState({}, '', window.location.pathname);
      refresh(token).catch(() => {});
    } else if (q.get('gmail') === 'error') {
      showNotice(`Google connect failed: ${q.get('msg') || 'unknown'}`, 'err');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (q.get('graph') === 'connected') {
      showNotice(`Microsoft account connected${q.get('email') ? ` — ${q.get('email')}` : ''}. Delegated refresh token stored.`);
      window.history.replaceState({}, '', window.location.pathname);
      refresh(token).catch(() => {});
    } else if (q.get('graph') === 'error') {
      showNotice(`Microsoft connect failed: ${q.get('msg') || 'unknown'}`, 'err');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [token]);

  useEffect(() => {
    if (token) refresh(token).catch((err) => {
      if (err.status === 401) { sessionStorage.removeItem('mailerToken'); setToken(''); }
      showNotice(err.message, 'err');
    });
  }, [token]);

  useEffect(() => {
    if (state?.telegram?.chatId && !tgChat) setTgChat(state.telegram.chatId);
  }, [state?.telegram?.chatId]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = () => api(token, '/api/netinfo').then((n) => { if (alive) setNetInfo(n); }).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const check = () => api(token, '/api/update/check')
      .then((r) => {
        if (!alive) return;
        setVersionInfo({ version: r.version, commit: r.local });
        if (!r.upToDate && r.remote) setUpdateInfo(r);
      })
      .catch(() => {});
    check();
    const iv = setInterval(check, 60 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  useEffect(() => {
    if (tab !== 'compose' || extraTemplates.length) return;
    import('./letterTemplates.js').then((m) => setExtraTemplates(m.EXTRA_TEMPLATES || [])).catch(() => {});
  }, [tab, extraTemplates.length]);

  useEffect(() => {
    if (!token || (tab !== 'send' && tab !== 'dashboard')) return;
    const iv = setInterval(() => refresh(token).catch(() => {}), 3000);
    return () => clearInterval(iv);
  }, [token, tab]);

  // Strip <style>/<script> and neutralize absolute positioning from pasted HTML
  function sanitizePastedHtml(html) {
    try {
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
      const root = doc.body.firstElementChild;
      if (!root) return '';
      root.querySelectorAll('style,script,link,meta,title,iframe,object,embed').forEach((n) => n.remove());
      root.querySelectorAll('*').forEach((el) => {
        if (el.style.position && el.style.position !== 'static') el.style.position = 'static';
        el.removeAttribute('width');
        el.removeAttribute('height');
      });
      return root.innerHTML;
    } catch {
      return html;
    }
  }

  // Live preview — debounced stream to rhs pane
  useEffect(() => {
    if (!token || tab !== 'compose') return;
    if (!draft.html.trim() && !draft.text.trim()) { setPreview(null); return; }
    const t = setTimeout(() => {
      api(token, '/api/preview', { method: 'POST', body: { ...draft, subject: draft.subject || '(no subject)' } })
        .then(setPreview)
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [draft, token, tab]);

  // Sync paste area innerHTML only when draft.html changed from OUTSIDE the editor.
  // lastEditorHtml tracks what the contenteditable itself last produced, so
  // keystrokes don't retrigger a DOM reset mid-typing.
  const lastEditorHtml = useRef('');
  useEffect(() => {
    if ((bodyMode !== 'paste' && bodyMode !== 'blocks') || !pasteRef.current) return;
    if (!draft.html) {
      if (pasteRef.current.innerHTML) pasteRef.current.innerHTML = '';
      lastEditorHtml.current = '';
      return;
    }
    if (draft.html === lastEditorHtml.current) return;
    const clean = sanitizePastedHtml(draft.html);
    pasteRef.current.innerHTML = clean;
    lastEditorHtml.current = pasteRef.current.innerHTML;
  }, [bodyMode, draft.html, selectedId]);

  // Auto-dismiss notices after 3s
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  function showNotice(msg, type = 'ok') { setNotice(msg); setNoticeType(type); }

  // In-app dialog system — replaces window.confirm / window.prompt
  function uiConfirm(message, { title = 'CONFIRM', danger = false, confirmLabel = 'CONFIRM' } = {}) {
    return new Promise((resolve) => setDialog({ kind: 'confirm', title, message, danger, confirmLabel, value: '', resolve }));
  }
  function uiPrompt(message, { title = 'INPUT', placeholder = '', confirmLabel = 'OK' } = {}) {
    return new Promise((resolve) => setDialog({ kind: 'prompt', title, message, placeholder, confirmLabel, value: '', resolve }));
  }
  function settleDialog(result) {
    if (!dialog) return;
    const value = dialog.kind === 'prompt' ? (result ? dialog.value : null) : Boolean(result);
    dialog.resolve(value);
    setDialog(null);
  }

  async function run(action) {
    setBusy(true); setNotice('');
    try { await action(); }
    catch (err) { showNotice(err.message, 'err'); }
    finally { setBusy(false); }
  }

  async function applyUpdate() {
    setUpdating(true);
    setUpdateInfo(null);
    try {
      await api(token, '/api/update/apply', { method: 'POST' });
    } catch (err) {
      setUpdating(false);
      showNotice(`Update failed: ${err.message}`, 'err');
    }
  }

  function login(e) {
    e.preventDefault();
    sessionStorage.setItem('mailerToken', loginToken);
    setToken(loginToken);
  }

  function logout() { sessionStorage.removeItem('mailerToken'); setToken(''); setState(null); }
  function updateDraft(k, v) { setDraft((c) => ({ ...c, [k]: v })); }
  function updateSettings(k, v) { setSettings((c) => ({ ...c, [k]: v })); }

  function execEditPaste(cmd, val = null) {
    pasteRef.current.focus();
    document.execCommand(cmd, false, val);
    lastEditorHtml.current = pasteRef.current.innerHTML;
    updateDraft('html', lastEditorHtml.current);
  }

  // Textarea modes: wrap the current selection in the textarea
  function wrapSelection(field, ref, transform) {
    const ta = ref.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = (draft[field] || '').slice(s, e);
    const rep = transform(sel);
    const next = (draft[field] || '').slice(0, s) + rep + (draft[field] || '').slice(e);
    updateDraft(field, next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s;
      ta.selectionEnd = s + rep.length;
    });
  }

  const FONT_SIZE_PX = { 1: '12px', 2: '13px', 3: '14px', 4: '16px', 5: '18px', 6: '24px', 7: '32px' };

  async function execEdit(cmd, val = null) {
    if (bodyMode === 'paste' || bodyMode === 'blocks') {
      if (cmd === 'createLink') {
        const url = await uiPrompt('Link URL', { title: 'INSERT LINK', placeholder: 'https://...' });
        if (url) execEditPaste('createLink', url);
        return;
      }
      execEditPaste(cmd, val);
      return;
    }

    const isText = bodyMode === 'text';
    const field = isText ? 'text' : 'html';
    const ref = isText ? textRef : htmlRef;

    const wrapHtml = (tag, style = '') => (sel) =>
      `<${tag}${style ? ` style="${style}"` : ''}>${sel || 'text'}</${tag}>`;

    switch (cmd) {
      case 'bold': return wrapSelection(field, ref, isText ? (s) => `**${s || 'bold'}**` : wrapHtml('b'));
      case 'italic': return wrapSelection(field, ref, isText ? (s) => `*${s || 'italic'}*` : wrapHtml('i'));
      case 'underline': return wrapSelection(field, ref, isText ? (s) => `__${s || 'underline'}__` : wrapHtml('u'));
      case 'strikeThrough': return wrapSelection(field, ref, isText ? (s) => `~~${s || 'strike'}~~` : wrapHtml('s'));
      case 'createLink': {
        const url = await uiPrompt('Link URL', { title: 'INSERT LINK', placeholder: 'https://...' });
        if (!url) return;
        if (isText) return wrapSelection(field, ref, (s) => `[${s || 'link'}](${url})`);
        return wrapSelection(field, ref, (s) => `<a href="${url}">${s || 'link'}</a>`);
      }
      case 'unlink':
        return wrapSelection(field, ref, isText
          ? (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          : (s) => s.replace(/<\/?a[^>]*>/gi, ''));
      case 'foreColor':
        if (isText) return;
        return wrapSelection(field, ref, wrapHtml('span', `color:${val}`));
      case 'hiliteColor':
        if (isText) return;
        return wrapSelection(field, ref, wrapHtml('span', `background-color:${val}`));
      case 'insertUnorderedList':
        return wrapSelection(field, ref, isText
          ? (s) => s.split('\n').map((l) => (l.trim() ? `- ${l}` : l)).join('\n')
          : (s) => `<ul>${(s || 'item').split('\n').map((l) => `<li>${l.trim() || 'item'}</li>`).join('')}</ul>`);
      case 'insertOrderedList':
        return wrapSelection(field, ref, isText
          ? (s) => s.split('\n').map((l, i) => (l.trim() ? `${i + 1}. ${l}` : l)).join('\n')
          : (s) => `<ol>${(s || 'item').split('\n').map((l) => `<li>${l.trim() || 'item'}</li>`).join('')}</ol>`);
      case 'removeFormat':
        return wrapSelection(field, ref, isText
          ? (s) => s.replace(/\*\*|__|~~|\[([^\]]*)\]\([^)]*\)/g, (m, g) => g || '')
          : (s) => s.replace(/<[^>]+>/g, ''));
      case 'justifyLeft': case 'justifyCenter': case 'justifyRight': {
        if (isText) return;
        const align = { justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right' }[cmd];
        return wrapSelection(field, ref, wrapHtml('div', `text-align:${align}`));
      }
      case 'formatBlock': {
        if (isText) return;
        const tag = String(val).replace(/[<>]/g, '') || 'p';
        return wrapSelection(field, ref, wrapHtml(tag));
      }
      case 'fontSize': {
        if (isText) return;
        const px = FONT_SIZE_PX[val] || '16px';
        return wrapSelection(field, ref, wrapHtml('span', `font-size:${px}`));
      }
      default: return;
    }
  }

  function insertPlaceholder(val) {
    if ((bodyMode === 'paste' || bodyMode === 'blocks') && pasteRef.current) {
      pasteRef.current.focus();
      document.execCommand('insertText', false, val);
      lastEditorHtml.current = pasteRef.current.innerHTML;
      updateDraft('html', lastEditorHtml.current);
      return;
    }
    const ta = bodyMode === 'text' ? textRef.current : htmlRef.current;
    const field = bodyMode === 'text' ? 'text' : 'html';
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const current = draft[field] || '';
    updateDraft(field, current.slice(0, s) + val + current.slice(e));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + val.length, s + val.length); });
  }

  async function saveDraft() {
    let id = selectedId;
    if (id) {
      await api(token, `/api/campaigns/${id}`, { method: 'PUT', body: draft });
    } else {
      const r = await api(token, '/api/campaigns', { method: 'POST', body: draft });
      id = r.id; setSelectedId(id);
    }
    await refresh(); return id;
  }

  function queue(schedule = false) {
    return run(async () => {
      const id = await saveDraft();
      const body = schedule ? { scheduledFor: new Date(scheduledFor).toISOString() } : {};
      const r = await api(token, `/api/campaigns/${id}/queue`, { method: 'POST', body });
      showNotice(`${r.queued} recipients queued.`);
      setSelectedId(null); setDraft(emptyDraft); setPreview(null);
      await refresh(); setTab('send');
    });
  }

  function editCampaign(c) {
    if (!['draft', 'failed', 'scheduled'].includes(c.status)) return;
    setSelectedId(c.id);
    setDraft({ name: c.name, subject: c.subject, preheader: c.preheader || '', html: c.html, text: c.text, attachments: c.attachments || [], providers: c.providers || [] });
    setTab('compose');
  }

  async function exportCampaign(id) {
    const res = await fetch(`/api/campaigns/${id}/export`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Export failed'); }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = `campaign-${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function saveSettings() {
    return run(async () => {
      await api(token, '/api/settings', { method: 'PUT', body: { ...settings } });
      showNotice('Settings saved.');
      await refresh();
    });
  }

  // ── totals across all campaigns ──
  const totals = (state?.campaigns || []).reduce(
    (acc, c) => ({ sent: acc.sent + c.sent, failed: acc.failed + c.failed, queued: acc.queued + c.queued }),
    { sent: 0, failed: 0, queued: 0 }
  );

  // ── LOGIN ──
  if (!token) {
    return (
      <>
      <ChromosomeBackground />
      <div className="login-wrap">
        <div className="login-box">
          <div className="login-brand">
            <RbcLogo size={72} />
            <div className="login-wordmark">RBC<span>SENDER</span></div>
          </div>
          <p className="login-sub">[ SECURE CHANNEL — AUTHORIZED PERSONNEL ONLY ]</p>
          <form onSubmit={login} className="login-form">
            <label className="field-label">ACCESS TOKEN</label>
            <input className="w-input" type="password" value={loginToken} onChange={(e) => setLoginToken(e.target.value)} required autoFocus placeholder="Enter token..." />
            <button className="btn-primary" type="submit">[ ACCESS ]</button>
          </form>
          {notice && <p className="login-err">[ ERROR ] {notice}</p>}
          <p className="login-made">made with ❤️ @fuckmonad</p>
        </div>
      </div>
      </>
    );
  }

  const sendMode = settings.sendMode || 'smtp';
  const draftEmpty = !draft.html.trim() && !draft.text.trim();
  const canQueue = !draftEmpty && draft.subject.trim().length > 0;

  return (
    <>
    <ChromosomeBackground />
    <div className="layout">

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <RbcLogo size={34} />
          <div>
            <span className="sb-wordmark">RBC<span>SENDER</span></span>
            {versionInfo && (
              <div className="sb-ver">
                v{versionInfo.version}{versionInfo.commit ? ` · ${versionInfo.commit.slice(0, 7)}` : ''}
              </div>
            )}
          </div>
        </div>

        <div className="sb-stats">
          <div className="stat-row"><span className="stat-lbl">MODE</span><span className="stat-val mode-val">{sendMode.toUpperCase()}</span></div>
          <div className="stat-row"><span className="stat-lbl">LIST</span><span className="stat-val">{state?.confirmed || 0}</span></div>
          <div className="stat-row"><span className="stat-lbl">SENT</span><span className="stat-val sent-val">{totals.sent}</span></div>
          <div className="stat-row"><span className="stat-lbl">FAIL</span><span className="stat-val fail-val">{totals.failed}</span></div>
          <div className="stat-row"><span className="stat-lbl">QUEUE</span><span className="stat-val queue-val">{totals.queued}</span></div>
        </div>

        <nav className="sb-nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button className="nav-item logout-btn" onClick={logout}>✕ LOGOUT</button>

        <div className="sb-net">
          <div className="sb-net-title">SERVER</div>
          <div className="sb-net-row">
            <span className="stat-lbl">IP</span>
            <button className="sb-ip" title="Click to copy — use for SMTP relay / IP whitelists"
              onClick={() => { if (netInfo?.publicIp) { navigator.clipboard.writeText(netInfo.publicIp); showNotice('IP copied.'); } }}>
              {netInfo?.publicIp || '…'}
            </button>
          </div>
          <div className="sb-net-row">
            <span className="stat-lbl">PORT 25</span>
            <span className={`stat-val ${netInfo?.port25?.open ? 'sent-val' : 'fail-val'}`}>
              {netInfo ? (netInfo.port25.open ? 'OPEN' : `BLOCKED (${netInfo.port25.reason || 'filtered'})`) : '…'}
            </span>
          </div>
          <div className="sb-net-hint">click IP to copy · for relay whitelists</div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main-wrap">

        {/* top bar */}
        <div className="topbar">
          <span className="topbar-title">
            {NAV_ITEMS.find((n) => n.id === tab)?.icon}&nbsp;
            {NAV_ITEMS.find((n) => n.id === tab)?.label}
          </span>
          {notice && (
            <div className={`notice-bar ${noticeType === 'err' ? 'notice-err' : ''}`}>
              {noticeType === 'err' ? '[ ERR ] ' : '[ OK ] '}{notice}
              <button onClick={() => setNotice('')}>✕</button>
            </div>
          )}
          {busy && <span className="busy-dot">●</span>}
        </div>

        <div className="content">
          {!state ? (
            <div className="loading">[ LOADING... ]</div>
          ) : (
            <>

              {/* ══ LETTER / COMPOSE ══ */}
              {tab === 'compose' && (
                <div className="compose-layout">
                  <div className="pane">
                    <div className="pane-head">
                      <span>{selectedId ? `EDIT DRAFT #${selectedId}` : 'NEW LETTER'}</span>
                      <button className="btn-sm" disabled={busy} onClick={() => run(async () => { await saveDraft(); showNotice('Draft saved.'); })}>[ SAVE ]</button>
                    </div>

                    <label className="field-label">CAMPAIGN NAME</label>
                    <input className="w-input" value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} placeholder="Campaign name" />

                    <label className="field-label">SUBJECT</label>
                    <input className="w-input" value={draft.subject} onChange={(e) => updateDraft('subject', e.target.value)} placeholder="Subject line — placeholders work here" />

                    <label className="field-label">PREHEADER <span className="dim">(inbox preview text)</span></label>
                    <input className="w-input" value={draft.preheader} onChange={(e) => updateDraft('preheader', e.target.value)} placeholder="Preview text recipients see next to the subject..." />

                    {/* AUDIENCE TARGETING */}
                    {(() => {
                      const counts = {};
                      for (const r of state.recipients) {
                        if (!r.consentConfirmed || r.suppressed) continue;
                        const p = r.custom?.provider || 'Unclassified';
                        counts[p] = (counts[p] || 0) + 1;
                      }
                      const providers = Object.keys(counts).sort();
                      const selected = draft.providers || [];
                      const eligible = providers.filter((p) => !selected.length || selected.includes(p)).reduce((n, p) => n + counts[p], 0);
                      const toggleProvider = (p) => {
                        const next = selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p];
                        updateDraft('providers', next);
                      };
                      return (
                        <div className="audience-block">
                          <label className="field-label">AUDIENCE <span className="dim">({eligible} of {state.recipients.length} eligible — blank = all providers)</span></label>
                          <div className="provider-chips">
                            {providers.length === 0 && <span className="dim">no classified recipients — run SORT BY PROVIDER in RECIPIENTS</span>}
                            {providers.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className={`prov-chip ${selected.includes(p) ? 'prov-chip-on' : ''}`}
                                onClick={() => toggleProvider(p)}
                              >{p} <span className="prov-count">{counts[p]}</span></button>
                            ))}
                            {selected.length > 0 && (
                              <button type="button" className="prov-chip prov-chip-clear" onClick={() => updateDraft('providers', [])}>ALL</button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* PLACEHOLDER DROPDOWN */}
                    <div className="ph-dropdown-wrap">
                      <label className="field-label">INSERT PLACEHOLDER</label>
                      <select
                        className="w-select ph-select"
                        value=""
                        onChange={(e) => { if (e.target.value) insertPlaceholder(e.target.value); }}
                      >
                        <option value="">— select a placeholder to insert —</option>
                        {PLACEHOLDER_GROUPS.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.items.map(({ tag, tip }) => (
                              <option key={tag} value={tag}>{tag} — {tip}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* LETTER TEMPLATE */}
                    <div style={{ marginBottom: 10 }}>
                      <label className="field-label">LETTER TEMPLATE <span className="dim">(loads subject + body — placeholders render per recipient)</span></label>
                      <select className="w-select" value="" onChange={(e) => {
                        const all = [...LETTER_TEMPLATES, ...extraTemplates];
                        const t = all[Number(e.target.value)];
                        if (!t || !t.html) { e.target.value = ''; return; }
                        setDraft({ ...draft, name: draft.name || t.label.replace(/^✉\s*/, ''), subject: t.subject || draft.subject, html: t.html, text: t.text || draft.text });
                        setBodyMode('paste');
                        e.target.value = '';
                      }}>
                        <option value="">— select a template to load —</option>
                        {LETTER_TEMPLATES.map((t, i) => <option key={i} value={i} disabled={!t.html}>{t.label}</option>)}
                        {extraTemplates.length > 0 && <option disabled>── {extraTemplates.length} letter imports ──</option>}
                        {extraTemplates.map((t, i) => <option key={`x${i}`} value={LETTER_TEMPLATES.length + i}>{t.label}</option>)}
                      </select>
                    </div>

                    {/* BODY MODE TOGGLE */}
                    <div className="body-mode-bar">
                      <span className="field-label" style={{ margin: 0 }}>BODY MODE</span>
                      <div className="mode-toggle">
                        <button type="button" className={bodyMode === 'html' ? 'mode-btn active' : 'mode-btn'} onClick={() => setBodyMode('html')}>HTML</button>
                        <button type="button" className={bodyMode === 'paste' ? 'mode-btn active' : 'mode-btn'} onClick={() => setBodyMode('paste')}>PASTE</button>
                        <button type="button" className={bodyMode === 'blocks' ? 'mode-btn active' : 'mode-btn'} onClick={() => setBodyMode('blocks')}>BLOCKS</button>
                        <button type="button" className={bodyMode === 'text' ? 'mode-btn active' : 'mode-btn'} onClick={() => setBodyMode('text')}>PLAIN</button>
                      </div>
                    </div>

                    {/* EDITOR TOOLBAR — all body modes */}
                    <div className="editor-toolbar" onMouseDown={(e) => e.preventDefault()}>
                      <button type="button" className="tb-btn" title="Bold" onClick={() => execEdit('bold')}><b>B</b></button>
                      <button type="button" className="tb-btn" title="Italic" onClick={() => execEdit('italic')}><i>I</i></button>
                      <button type="button" className="tb-btn" title="Underline" onClick={() => execEdit('underline')}><u>U</u></button>
                      <button type="button" className="tb-btn" title="Strikethrough" onClick={() => execEdit('strikeThrough')}><s>S</s></button>
                      <span className="tb-sep" />
                      <button type="button" className="tb-btn" title="Insert hyperlink" onClick={() => execEdit('createLink')}>LINK</button>
                      <button type="button" className="tb-btn" title="Remove link" onClick={() => execEdit('unlink')}>UNLINK</button>
                      <span className="tb-sep" />
                      <label className="tb-color" title="Text color">
                        <span className="tb-color-lbl">A</span>
                        <input type="color" defaultValue="#e5eaf5" onChange={(e) => execEdit('foreColor', e.target.value)} />
                      </label>
                      <label className="tb-color" title="Highlight color">
                        <span className="tb-color-lbl">HL</span>
                        <input type="color" defaultValue="#ffe066" onChange={(e) => execEdit('hiliteColor', e.target.value)} />
                      </label>
                      <span className="tb-sep" />
                      <button type="button" className="tb-btn" title="Bullet list" onClick={() => execEdit('insertUnorderedList')}>• LIST</button>
                      <button type="button" className="tb-btn" title="Numbered list" onClick={() => execEdit('insertOrderedList')}>1. LIST</button>
                      <button type="button" className="tb-btn" title="Clear formatting" onClick={() => execEdit('removeFormat')}>CLEAR</button>
                      <span className="tb-sep" />
                      <button type="button" className="tb-btn" title="Align left" onClick={() => execEdit('justifyLeft')}>⇤</button>
                      <button type="button" className="tb-btn" title="Align center" onClick={() => execEdit('justifyCenter')}>≡</button>
                      <button type="button" className="tb-btn" title="Align right" onClick={() => execEdit('justifyRight')}>⇥</button>
                      <span className="tb-sep" />
                      <select className="tb-select" title="Block style" defaultValue="" onChange={(e) => { if (e.target.value) execEdit('formatBlock', e.target.value); e.target.value = ''; }}>
                        <option value="">BLOCK</option>
                        <option value="&lt;p&gt;">PARAGRAPH</option>
                        <option value="&lt;h1&gt;">HEADING 1</option>
                        <option value="&lt;h2&gt;">HEADING 2</option>
                        <option value="&lt;h3&gt;">HEADING 3</option>
                        <option value="&lt;blockquote&gt;">QUOTE</option>
                      </select>
                      <select className="tb-select" title="Font size" defaultValue="" onChange={(e) => { if (e.target.value) execEdit('fontSize', e.target.value); e.target.value = ''; }}>
                        <option value="">SIZE</option>
                        <option value="1">XS</option>
                        <option value="3">SM</option>
                        <option value="5">MD</option>
                        <option value="6">LG</option>
                        <option value="7">XL</option>
                      </select>
                    </div>

                    {bodyMode === 'html' && (
                      <>
                        <label className="field-label">HTML BODY</label>
                        <textarea ref={htmlRef} className="w-textarea code-ta" rows={16} value={draft.html} onChange={(e) => updateDraft('html', e.target.value)} />
                      </>
                    )}
                    {(bodyMode === 'paste' || bodyMode === 'blocks') && (
                      <>
                        <label className="field-label">{bodyMode === 'blocks' ? 'BLOCK EDITOR' : 'PASTE EMAIL CONTENT'} <span className="dim">(copy from Gmail/Outlook — keeps images, fonts, links)</span></label>
                        {bodyMode === 'blocks' && (
                          <div className="block-palette">
                            {BLOCK_SNIPPETS.map(([lbl, html]) => (
                              <button key={lbl} type="button" className="block-chip" onClick={() => {
                                if (!pasteRef.current) return;
                                pasteRef.current.focus();
                                document.execCommand('insertHTML', false, html);
                                lastEditorHtml.current = pasteRef.current.innerHTML;
                                updateDraft('html', lastEditorHtml.current);
                              }}>{lbl}</button>
                            ))}
                          </div>
                        )}
                        <div
                          ref={pasteRef}
                          className="paste-area"
                          contentEditable
                          suppressContentEditableWarning
                          onInput={() => { lastEditorHtml.current = pasteRef.current.innerHTML; updateDraft('html', lastEditorHtml.current); }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const html = e.clipboardData.getData('text/html');
                            const text = e.clipboardData.getData('text/plain');
                            pasteRef.current.focus();
                            if (html) {
                              document.execCommand('insertHTML', false, sanitizePastedHtml(html));
                            } else if (text) {
                              document.execCommand('insertText', false, text);
                            }
                            lastEditorHtml.current = pasteRef.current.innerHTML;
                            updateDraft('html', lastEditorHtml.current);
                          }}
                        />
                      </>
                    )}
                    {bodyMode === 'text' && (
                      <>
                        <label className="field-label">PLAIN TEXT BODY</label>
                        <textarea ref={textRef} className="w-textarea code-ta" rows={16} value={draft.text} onChange={(e) => updateDraft('text', e.target.value)} placeholder="Plain text email body..." />
                      </>
                    )}

                    {bodyMode !== 'text' && (
                      <>
                        <label className="field-label">PLAIN TEXT <span className="dim">(auto if empty)</span></label>
                        <textarea className="w-textarea code-ta" rows={5} value={draft.text} onChange={(e) => updateDraft('text', e.target.value)} />
                      </>
                    )}
                    {bodyMode === 'text' && (
                      <>
                        <label className="field-label">HTML BODY <span className="dim">(optional — leave empty for text-only send)</span></label>
                        <textarea className="w-textarea code-ta" rows={8} value={draft.html} onChange={(e) => updateDraft('html', e.target.value)} placeholder="Optional HTML version..." />
                      </>
                    )}

                    {/* ATTACHMENTS */}
                    <div className="cfg-block" style={{marginTop:8}}>
                      <div className="cfg-block-title">[ ATTACHMENTS ] <span className="dim">max 10 files / 10MB each</span></div>
                      <input type="file" multiple className="w-input" onChange={(e) => run(async () => {
                        const files = [...e.target.files];
                        const added = [];
                        for (const f of files) {
                          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
                          const up = await api(token, '/api/uploads', { method: 'POST', body: { filename: f.name, contentType: f.type || 'application/octet-stream', data } });
                          added.push(up);
                        }
                        updateDraft('attachments', [...(draft.attachments || []), ...added]);
                        e.target.value = '';
                        showNotice(`${added.length} attachment(s) uploaded.`);
                      })} />
                      {(draft.attachments || []).length > 0 && (
                        <div className="attach-list">
                          {draft.attachments.map((a, i) => (
                            <div key={a.path} className="attach-row">
                              <span className="attach-name">{a.filename}</span>
                              <span className="dim">{Math.round((a.size || 0) / 1024)}KB</span>
                              <button type="button" className="btn-xs btn-danger" onClick={() => updateDraft('attachments', draft.attachments.filter((_, j) => j !== i))}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="pane preview-pane">
                    <div className="pane-head">
                      <span>LIVE PREVIEW</span>
                      <div className="mode-toggle">
                        <button type="button" className={previewDevice === 'desktop' ? 'mode-btn active' : 'mode-btn'} onClick={() => setPreviewDevice('desktop')}>DESKTOP</button>
                        <button type="button" className={previewDevice === 'mobile' ? 'mode-btn active' : 'mode-btn'} onClick={() => setPreviewDevice('mobile')}>MOBILE</button>
                      </div>
                    </div>
                    {preview ? (
                      <>
                        <div className="preview-subject">Subject: {preview.subject}</div>
                        {preview.html ? (
                          <div className={`preview-device-wrap ${previewDevice}`}>
                            <iframe title="Preview" sandbox="" srcDoc={preview.html} className="preview-frame" />
                          </div>
                        ) : (
                          <div className={`preview-device-wrap ${previewDevice}`}>
                            <iframe title="Preview" sandbox="" srcDoc={plainPreviewDoc(preview.text)} className="preview-frame" />
                          </div>
                        )}
                        <details className="preview-text"><summary>[ PLAIN TEXT ]</summary><pre>{preview.text}</pre></details>
                      </>
                    ) : (
                      <div className="preview-empty">[ START TYPING — PREVIEW STREAMS HERE ]</div>
                    )}
                  </div>
                </div>
              )}

              {/* ══ MAIL LIST / RECIPIENTS ══ */}
              {tab === 'recipients' && (
                <div className="two-col">
                  <div className="pane">
                    <div className="pane-head"><span>IMPORT MAIL LIST</span></div>
                    <p className="dim-txt">Any format works — CSV with <code>email</code> column, or a plain list (one per line, comma/colon separated). Optional columns: <code>first_name</code>, <code>last_name</code>, <code>company</code>.</p>
                    <input type="file" accept=".csv,text/csv" className="w-input" onChange={(e) => run(async () => { const f = e.target.files[0]; if (f) setCsv(await f.text()); })} />
                    <textarea className="w-textarea code-ta" rows={12} value={csv} onChange={(e) => setCsv(e.target.value)} />
                    <label className="check-row">
                      <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} />
                      <span>All recipients consented to receive this message.</span>
                    </label>
                    <button className="btn-primary" disabled={busy || !consentConfirmed} onClick={() => run(async () => {
                      const r = await api(token, '/api/recipients/import', { method: 'POST', body: { csv, consentConfirmed } });
                      showNotice(`${r.imported} imported — ${r.errors.length} rejected.`);
                      await refresh();
                    })}>[ IMPORT LIST ]</button>
                  </div>
                  <div className="pane">
                    <div className="pane-head">
                      <span>AUDIENCE — {state.recipientTotal ?? state.recipients.length} RECORDS{(state.recipientTotal ?? 0) > state.recipients.length ? ` (showing ${state.recipients.length + extraRecipients.length})` : ''}</span>
                      <div className="btn-row">
                        <button className="btn-xs" disabled={busy || !state.recipients.length} onClick={() => run(async () => {
                          const r = await api(token, '/api/recipients/verify', { method: 'POST', body: { emails: state.recipients.map((x) => x.email) } });
                          const bad = r.results.filter((x) => !x.hasMx || x.disposable || x.roleBased);
                          setVerifyResults(r.results);
                          showNotice(`Verified ${r.results.length} — ${bad.length} flagged (no-MX/disposable/role).`);
                        })}>VERIFY DNS</button>
                        <button className="btn-xs" disabled={busy || !state.recipients.length} onClick={() => run(async () => {
                          const r = await api(token, '/api/recipients/classify', { method: 'POST', body: {} });
                          showNotice(`Classified ${r.classified}: ${Object.entries(r.counts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
                          await refresh();
                        })}>SORT BY PROVIDER</button>
                        {settings.engineMsRefreshToken === true && (
                          <button className="btn-xs" style={{ borderColor: 'rgba(0,120,215,0.6)', color: '#5bbcff' }} disabled={busy} onClick={() => run(async () => {
                            const r = await api(token, '/api/graph/contacts', { method: 'POST' });
                            showNotice(`MS Contacts: ${r.imported} imported, ${r.duplicates} dupes, ${r.total} total pulled.`);
                            await refresh();
                          })}>PULL MS CONTACTS</button>
                        )}
                        <button className="btn-xs btn-danger" disabled={busy || !state.recipients.length} onClick={async () => {
                          if (await uiConfirm(`Delete ALL ${state.recipients.length} recipients? Delivery history for them is removed too.`, { title: 'CLEAR RECIPIENT LIST', danger: true, confirmLabel: `DELETE ${state.recipients.length}` })) {
                            run(async () => { const r = await api(token, '/api/recipients', { method: 'DELETE' }); setExtraRecipients([]); showNotice(`${r.deleted} recipients deleted.`); await refresh(); });
                          }
                        }}>CLEAR LIST</button>
                      </div>
                    </div>
                    {verifyResults && (
                      <div className="verify-panel">
                        <div className="verify-head">DNS VERIFY — {verifyResults.length} checked <button className="btn-xs" onClick={() => setVerifyResults(null)}>✕</button></div>
                        <div className="tbl-wrap" style={{maxHeight:220}}>
                          <table className="w-table">
                            <thead><tr><th>EMAIL</th><th>MX</th><th>PROVIDER</th><th>FLAGS</th></tr></thead>
                            <tbody>
                              {verifyResults.slice(0, 200).map((v) => (
                                <tr key={v.email}>
                                  <td>{v.email}</td>
                                  <td className="dim">{v.hasMx ? v.mx : '—'}</td>
                                  <td>{v.provider}</td>
                                  <td>{[!v.hasMx && 'NO-MX', v.disposable && 'DISPOSABLE', v.roleBased && 'ROLE'].filter(Boolean).map((f) => <span key={f} className="badge badge-fail" style={{marginRight:4}}>{f}</span>)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div className="tbl-wrap">
                      <table className="w-table">
                        <thead><tr><th>EMAIL</th><th>NAME</th><th>PROVIDER</th><th>STATUS</th><th></th></tr></thead>
                        <tbody>
                          {(state.recipients.concat(extraRecipients.filter((x) => !state.recipients.some((y) => y.id === x.id)))).map((r) => (
                            <tr key={r.id}>
                              <td>{r.email}</td>
                              <td>{[r.firstName, r.lastName].filter(Boolean).join(' ')}</td>
                              <td className="dim">{r.custom?.provider || '—'}</td>
                              <td><span className={`badge ${r.suppressed ? 'badge-fail' : 'badge-ok'}`}>{r.suppressed ? 'SUPPRESSED' : 'ACTIVE'}</span></td>
                              <td>{r.suppressed
                                ? <button className="btn-xs" onClick={async () => { if (await uiConfirm(`Unsuppress ${r.email}? They will receive future campaigns again.`, { title: 'UNSUPPRESS RECIPIENT', confirmLabel: 'UNSUPPRESS' })) run(async () => { await api(token, `/api/recipients/${r.id}/unsuppress`, { method: 'POST' }); setExtraRecipients((prev) => prev.map((x) => x.id === r.id ? { ...x, suppressed: false } : x)); await refresh(); }); }}>UNSUPPRESS</button>
                                : <button className="btn-xs" onClick={async () => { if (await uiConfirm(`Suppress ${r.email}?`, { title: 'SUPPRESS RECIPIENT', danger: true, confirmLabel: 'SUPPRESS' })) run(async () => { await api(token, `/api/recipients/${r.id}/suppress`, { method: 'POST' }); setExtraRecipients((prev) => prev.map((x) => x.id === r.id ? { ...x, suppressed: true } : x)); await refresh(); }); }}>SUPPRESS</button>}
                                <button className="btn-xs btn-danger" onClick={async () => { if (await uiConfirm(`Delete ${r.email} from the list?`, { title: 'DELETE RECIPIENT', danger: true, confirmLabel: 'DELETE' })) run(async () => { await api(token, `/api/recipients/${r.id}`, { method: 'DELETE' }); setExtraRecipients((prev) => prev.filter((x) => x.id !== r.id)); await refresh(); }); }}>DEL</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(state.recipientTotal ?? 0) > state.recipients.length + extraRecipients.length && (
                      <button className="btn-sm" style={{ marginTop: 10 }} onClick={() => run(async () => {
                        const offset = state.recipients.length + extraRecipients.length;
                        const r = await api(token, `/api/recipients?offset=${offset}&limit=1000`);
                        setExtraRecipients((prev) => [...prev, ...r.recipients]);
                      })}>[ LOAD MORE — {state.recipients.length + extraRecipients.length} / {state.recipientTotal} ]</button>
                    )}
                  </div>
                </div>
              )}

              {/* ══ SMTP ══ */}
              {tab === 'smtp' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* ══ SECTION: OUTGOING CONNECTION ══ */}
                <div className="email-section">OUTGOING CONNECTION</div>
                <div className="pane narrow-pane">
                  <div className="pane-head"><span>SMTP CONFIGURATION</span></div>
                  <p className="dim-txt">Used when Send Mode is <strong>SMTP</strong>. Password is encrypted. Leave blank to keep existing.</p>
                  <div style={{marginBottom:14}}>
                    <label className="field-label">PROVIDER PRESET <span className="dim">(auto-fills host/port — then enter your credentials)</span></label>
                    <select className="w-select" value="" onChange={(e) => {
                      const p = SMTP_PRESETS[e.target.value];
                      if (p) setSmtp({ ...smtp, host: p.host, port: p.port, secure: p.secure });
                      e.target.value = '';
                    }}>
                      <option value="">— select provider —</option>
                      {Object.entries(SMTP_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="form-grid">
                    <div><label className="field-label">HOST</label><input className="w-input" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} /></div>
                    <div><label className="field-label">PORT</label><input className="w-input" type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} /></div>
                    <div><label className="field-label">USERNAME</label><input className="w-input" value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} /></div>
                    <div><label className="field-label">PASSWORD</label><input className="w-input" type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder={smtp.configured ? '(unchanged)' : ''} /></div>
                    <div><label className="field-label">FROM NAME</label><input className="w-input" value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} /></div>
                    <div><label className="field-label">FROM EMAIL</label><input className="w-input" type="email" value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} /></div>
                    <div><label className="field-label">REPLY-TO</label><input className="w-input" type="email" value={smtp.replyTo} onChange={(e) => setSmtp({ ...smtp, replyTo: e.target.value })} /></div>
                    <div><label className="field-label">RATE / MIN</label><input className="w-input" type="number" min="1" max="600" value={smtp.ratePerMinute} onChange={(e) => setSmtp({ ...smtp, ratePerMinute: Number(e.target.value) })} /></div>
                  </div>
                  <label className="check-row">
                    <input type="checkbox" checked={smtp.secure} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} />
                    <span>Implicit TLS (port 465) — uncheck for STARTTLS on 587</span>
                  </label>
                  <div className="btn-row" style={{ alignItems: 'center' }}>
                    <button className="btn-primary" disabled={busy} onClick={() => run(async () => { await api(token, '/api/smtp', { method: 'PUT', body: smtp }); showNotice('SMTP saved.'); await refresh(); })}>[ SAVE SMTP ]</button>
                    <button className="btn-sm" disabled={busy || !smtp.configured} onClick={() => run(async () => { await api(token, '/api/smtp/verify', { method: 'POST' }); showNotice('Connection verified.'); })}>[ TEST ]</button>
                    <input className="w-input" style={{ maxWidth: 220 }} type="email" placeholder="test send to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                    <button className="btn-sm" disabled={busy || !testTo.includes('@')} onClick={() => run(async () => { const r = await api(token, '/api/test-send', { method: 'POST', body: { to: testTo, subject: draft.subject, html: draft.html, text: draft.text } }); showNotice(`Test sent (${r.messageId || 'ok'}).`); setTestTo(''); })}>[ SEND TEST ]</button>
                  </div>
                </div>

                {/* QUICK GUIDES */}
                <div className="pane">
                  <div className="pane-head"><span>QUICK GUIDES</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {SMTP_GUIDES.map((g) => (
                      <details key={g.title} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 14px', background: 'rgba(255,255,255,.03)' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{g.title}</summary>
                        <p className="dim-txt" style={{ margin: '8px 0' }}>{g.body}</p>
                        <button className="btn-sm" onClick={() => setSmtp({ ...smtp, host: g.apply.host || smtp.host, port: g.apply.port, secure: g.apply.secure, username: g.apply.relay ? '' : smtp.username, password: g.apply.relay ? '' : smtp.password })}>[ USE THESE SETTINGS ]</button>
                      </details>
                    ))}
                  </div>
                </div>

                {/* POSTFIX RELAY GUIDE */}
                <div className="pane">
                  <div className="pane-head"><span>SELF-HOSTED RELAY — POSTFIX ON LINUX</span></div>
                  <p className="dim-txt">Run postfix on a linux box and point Send Mode → RELAY at it. Below is the dnf (RHEL/Fedora/Rocky/Alma) setup. Replace <code>YOUR.SENDER.IP</code> with the IP this sender connects from.</p>
                  <details style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 14px', background: 'rgba(255,255,255,.03)', marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>1 · Install &amp; basic config</summary>
                    <pre className="dim-txt" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, margin: '8px 0' }}>{`sudo dnf install -y postfix
sudo systemctl enable --now postfix
# during first install pick "Internet Site", mail name = your.domain.com

# /etc/postfix/main.cf — make sure these are set:
#   myhostname = mail.your.domain.com
#   mydestination = $myhostname, localhost.$mydomain, localhost
#   mynetworks = 127.0.0.0/8 YOUR.SENDER.IP/32
#   inet_interfaces = all
#   relayhost =`}</pre>
                  </details>
                  <details style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 14px', background: 'rgba(255,255,255,.03)', marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>2 · Forward through a smarthost (gmail/app password etc.)</summary>
                    <pre className="dim-txt" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, margin: '8px 0' }}>{`# /etc/postfix/main.cf
relayhost = [smtp.gmail.com]:587
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
smtp_sasl_security_options = noanonymous
smtp_tls_security_level = encrypt

# /etc/postfix/sasl_passwd
[smtp.gmail.com]:587 you@gmail.com:your-16-char-app-password

sudo postmap /etc/postfix/sasl_passwd
sudo chmod 600 /etc/postfix/sasl_passwd
sudo systemctl restart postfix`}</pre>
                  </details>
                  <details style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 14px', background: 'rgba(255,255,255,.03)', marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>3 · Test it</summary>
                    <pre className="dim-txt" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, margin: '8px 0' }}>{`# from THIS machine (the sender):
swaks --to you@example.com --from you@your.domain.com --server POSTFIX_IP

# or watch postfix log on the linux box:
sudo tail -f /var/log/maillog`}</pre>
                  </details>
                  <p className="dim-txt" style={{ marginTop: 8 }}><strong>Notes:</strong> GCP/AWS block outbound port 25 by default — request removal or relay through port 587 to your provider instead. SPF/DKIM/DMARC dns records for your.domain.com still required or mail lands in spam.</p>
                </div>

                {/* SMTP PROVIDER GUIDE */}
                <div className="pane">
                  <div className="pane-head"><span>HOW TO GET SMTP CREDENTIALS</span></div>
                  <div className="smtp-guide">
                    <div className="guide-section">
                      <div className="guide-title">FREE / PERSONAL PROVIDERS</div>
                      <table className="guide-table">
                        <thead><tr><th>PROVIDER</th><th>HOST</th><th>PORT</th><th>SECURE</th><th>USERNAME</th><th>PASSWORD</th></tr></thead>
                        <tbody>
                          <tr>
                            <td><strong>Gmail</strong></td><td>smtp.gmail.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@gmail.com</td>
                            <td>App Password (not your login password)</td>
                          </tr>
                          <tr>
                            <td><strong>Outlook / Hotmail</strong></td><td>smtp-mail.outlook.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@outlook.com</td>
                            <td>Account password or app password</td>
                          </tr>
                          <tr>
                            <td><strong>Yahoo</strong></td><td>smtp.mail.yahoo.com</td><td>465</td><td>SSL</td>
                            <td>your@yahoo.com</td>
                            <td>App password (Account → Security → App passwords)</td>
                          </tr>
                          <tr>
                            <td><strong>iCloud</strong></td><td>smtp.mail.me.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@icloud.com</td>
                            <td>App-specific password (appleid.apple.com)</td>
                          </tr>
                          <tr>
                            <td><strong>Zoho Mail</strong></td><td>smtp.zoho.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@zoho.com</td>
                            <td>Account password</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="guide-section">
                      <div className="guide-title">TRANSACTIONAL / BULK PROVIDERS</div>
                      <table className="guide-table">
                        <thead><tr><th>PROVIDER</th><th>HOST</th><th>PORT</th><th>SECURE</th><th>USERNAME</th><th>PASSWORD</th></tr></thead>
                        <tbody>
                          <tr>
                            <td><strong>SendGrid</strong></td><td>smtp.sendgrid.net</td><td>587</td><td>STARTTLS</td>
                            <td>apikey</td>
                            <td>API key (starts with SG.)</td>
                          </tr>
                          <tr>
                            <td><strong>Mailgun</strong></td><td>smtp.mailgun.org</td><td>587</td><td>STARTTLS</td>
                            <td>postmaster@yourdomain.com</td>
                            <td>SMTP password from Mailgun dashboard</td>
                          </tr>
                          <tr>
                            <td><strong>Brevo</strong></td><td>smtp-relay.brevo.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@brevo.com</td>
                            <td>SMTP key (Settings → SMTP & API → SMTP tab)</td>
                          </tr>
                          <tr>
                            <td><strong>AWS SES</strong></td><td>email-smtp.us-east-1.amazonaws.com</td><td>587</td><td>STARTTLS</td>
                            <td>SES SMTP username</td>
                            <td>SES SMTP password (not IAM secret)</td>
                          </tr>
                          <tr>
                            <td><strong>Postmark</strong></td><td>smtp.postmarkapp.com</td><td>587</td><td>STARTTLS</td>
                            <td>your Postmark server token</td>
                            <td>Server token (same as username)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="guide-section">
                      <div className="guide-title">GMAIL APP PASSWORD — STEP BY STEP</div>
                      <ol className="guide-steps">
                        <li>Go to <strong>myaccount.google.com</strong> → Security</li>
                        <li>Enable <strong>2-Step Verification</strong> (required)</li>
                        <li>Go to <strong>App passwords</strong> (search "app passwords")</li>
                        <li>Select <strong>Mail</strong> → <strong>Other</strong> → name it "RBC Sender"</li>
                        <li>Copy the 16-character password → paste into <strong>Password</strong> field above</li>
                        <li>Set Host: <code>smtp.gmail.com</code>, Port: <code>587</code>, Secure: <strong>OFF</strong> (STARTTLS)</li>
                      </ol>
                    </div>

                    <div className="guide-section">
                      <div className="guide-title">NO SMTP? USE DIRECT / RELAY MODE</div>
                      <p className="dim-txt">Go to <strong>SETTINGS</strong> tab → select <strong>DIRECT MX</strong>, <strong>RELAY/PROXY</strong>, or <strong>SOCKS5</strong> send mode. No SMTP credentials needed — mail is delivered directly to the recipient's mail server on port 25 through your proxy.</p>
                    </div>
                  </div>
                </div>

                {/* ══ SECTION: SENDING ACCOUNTS ══ */}
                <div className="email-section">SENDING ACCOUNTS</div>

                {/* SMTP ACCOUNT POOL */}
                <div className="pane">
                  <div className="pane-head"><span>ACCOUNT POOL — ROTATION & FAILOVER</span>
                    <button className="btn-sm" disabled={busy} onClick={() => run(async () => {
                      const r = await api(token, '/api/smtp/verify-all', { method: 'POST' });
                      const dead = (r.results || []).filter((x) => !x.ok);
                      showNotice(dead.length ? `${r.live}/${r.total} live — ${dead.length} dead cooled 6h.` : `All ${r.total} accounts verified live.`);
                      await refresh();
                    })}>[ VERIFY ALL ]</button>
                  </div>
                  <p className="dim-txt">Sends rotate across enabled accounts; failures cool an account down and fail over to the next. VERIFY ALL handshakes every account — dead ones drop out of rotation for 6h. The legacy config above acts as fallback when the pool is empty.</p>
                  <div className="tbl-wrap" style={{maxHeight:240}}>
                    <table className="w-table">
                      <thead><tr><th>LABEL</th><th>HOST</th><th>USER</th><th>FROM</th><th>W</th><th>STATE</th><th></th></tr></thead>
                      <tbody>
                        {(state.smtpAccounts || []).map((a) => (
                          <tr key={a.id}>
                            <td>{a.label || '—'}</td>
                            <td className="dim">{a.host}:{a.port}</td>
                            <td className="dim">{a.username}</td>
                            <td className="dim">{a.fromEmail}</td>
                            <td>{a.weight}</td>
                            <td><span className={`badge ${a.enabled ? 'badge-ok' : 'badge-def'}`}>{a.cooldownUntil && a.cooldownUntil > new Date().toISOString() ? 'COOLDOWN' : a.enabled ? 'ACTIVE' : 'OFF'}</span>{a.fails ? <span className="dim"> ({a.fails}f)</span> : null}
                              {a.lastError ? <div className="red-txt" style={{fontSize:11}} title={a.lastError}>{a.lastError.slice(0, 60)}</div>
                                : a.lastCheck ? <div className="dim-txt" style={{fontSize:11}}>ok {new Date(a.lastCheck).toLocaleTimeString()}</div> : null}</td>
                            <td>
                              <div className="act-row">
                                <button className="btn-xs" onClick={() => {
                                  setEditingAcct(a.id);
                                  setAcctForm({ label: a.label, host: a.host, port: a.port, secure: a.secure, username: a.username, password: '', fromName: a.fromName, fromEmail: a.fromEmail, replyTo: a.replyTo, weight: a.weight });
                                }}>EDIT</button>
                                <button className="btn-xs" onClick={() => run(async () => { await api(token, `/api/smtp/accounts/${a.id}`, { method: 'PUT', body: { label: a.label, host: a.host, port: a.port, secure: a.secure, username: a.username, fromName: a.fromName, fromEmail: a.fromEmail, replyTo: a.replyTo, weight: a.weight, enabled: !a.enabled } }); await refresh(); })}>{a.enabled ? 'DISABLE' : 'ENABLE'}</button>
                                <button className="btn-xs btn-danger" onClick={async () => { if (await uiConfirm(`Delete account ${a.label || a.username}?`, { title: 'DELETE SMTP ACCOUNT', danger: true, confirmLabel: 'DELETE' })) run(async () => { await api(token, `/api/smtp/accounts/${a.id}`, { method: 'DELETE' }); await refresh(); }); }}>DEL</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!(state.smtpAccounts || []).length && <tr><td colSpan={7} className="dim" style={{textAlign:'center'}}>No pool accounts — legacy SMTP config is used.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="cfg-block" style={{marginTop:12}}>
                    <div className="cfg-block-title">{editingAcct ? `EDIT ACCOUNT #${editingAcct}` : 'ADD ACCOUNT'}</div>
                    <div className="form-grid">
                      <div><label className="field-label">LABEL</label><input className="w-input" value={acctForm.label} onChange={(e) => setAcctForm({ ...acctForm, label: e.target.value })} placeholder="Pool A" /></div>
                      <div><label className="field-label">HOST</label><input className="w-input" value={acctForm.host} onChange={(e) => setAcctForm({ ...acctForm, host: e.target.value })} /></div>
                      <div><label className="field-label">PORT</label><input className="w-input" type="number" value={acctForm.port} onChange={(e) => setAcctForm({ ...acctForm, port: Number(e.target.value) })} /></div>
                      <div><label className="field-label">USERNAME</label><input className="w-input" value={acctForm.username} onChange={(e) => setAcctForm({ ...acctForm, username: e.target.value })} /></div>
                      <div><label className="field-label">PASSWORD {editingAcct ? <span className="dim">(blank = keep)</span> : <span className="dim">(blank = no auth — IP allowlist relays)</span>}</label><input className="w-input" type="password" value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} /></div>
                      <div><label className="field-label">FROM EMAIL</label><input className="w-input" type="email" value={acctForm.fromEmail} onChange={(e) => setAcctForm({ ...acctForm, fromEmail: e.target.value })} /></div>
                      <div><label className="field-label">FROM NAME</label><input className="w-input" value={acctForm.fromName} onChange={(e) => setAcctForm({ ...acctForm, fromName: e.target.value })} /></div>
                      <div><label className="field-label">REPLY-TO</label><input className="w-input" type="email" value={acctForm.replyTo} onChange={(e) => setAcctForm({ ...acctForm, replyTo: e.target.value })} /></div>
                      <div><label className="field-label">WEIGHT</label><input className="w-input" type="number" min="1" max="100" value={acctForm.weight} onChange={(e) => setAcctForm({ ...acctForm, weight: Number(e.target.value) })} /></div>
                    </div>
                    <label className="check-row"><input type="checkbox" checked={acctForm.secure} onChange={(e) => setAcctForm({ ...acctForm, secure: e.target.checked })} /><span>Implicit TLS (465)</span></label>
                    <div className="btn-row">
                      <button className="btn-primary" disabled={busy} onClick={() => run(async () => {
                        const body = { ...acctForm };
                        if (editingAcct) { await api(token, `/api/smtp/accounts/${editingAcct}`, { method: 'PUT', body }); }
                        else { await api(token, '/api/smtp/accounts', { method: 'POST', body }); }
                        showNotice(editingAcct ? 'Account updated.' : 'Account added.');
                        setAcctForm(emptyAccount); setEditingAcct(null); await refresh();
                      })}>{editingAcct ? '[ UPDATE ACCOUNT ]' : '[ ADD ACCOUNT ]'}</button>
                      {editingAcct && <button className="btn-sm" onClick={() => { setAcctForm(emptyAccount); setEditingAcct(null); }}>[ CANCEL ]</button>}
                    </div>
                  </div>
                </div>

                {/* ══ SECTION: SENDING RULES ══ */}
                <div className="email-section">SENDING RULES</div>

                {/* SENDING HOURS */}
                <div className="pane">
                  <div className="pane-head"><span>SENDING HOURS</span></div>
                  <p className="dim-txt">The queue only sends inside this window, in the timezone set under SETTINGS → TIMEZONE. Empty days = every day.</p>
                  <label className="check-row" style={{marginBottom:12}}>
                    <input type="checkbox" checked={settings.scheduleEnabled !== false} onChange={(e) => setSettings({ ...settings, scheduleEnabled: e.target.checked })} />
                    <span>Enforce window — <strong>{settings.scheduleEnabled !== false ? 'ON' : 'OFF (sends 24/7)'}</strong></span>
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {Object.entries(DAY_LABELS).map(([d, label]) => {
                      const on = (settings.sendDays || []).includes(Number(d));
                      return (
                        <button key={d} className={`btn-xs ${on ? 'btn-primary' : ''}`} style={{ minWidth: 44 }}
                          onClick={() => {
                            const cur = new Set(settings.sendDays || []);
                            cur.has(Number(d)) ? cur.delete(Number(d)) : cur.add(Number(d));
                            setSettings({ ...settings, sendDays: [...cur].sort() });
                          }}>{label}</button>
                      );
                    })}
                    <button className="btn-xs" onClick={() => setSettings({ ...settings, sendDays: [] })}>ALL</button>
                  </div>
                  <div className="form-grid">
                    <div><label className="field-label">FROM</label>
                      <select className="w-select" value={settings.sendFromMin} onChange={(e) => setSettings({ ...settings, sendFromMin: Number(e.target.value) })}>
                        {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div><label className="field-label">TO</label>
                      <select className="w-select" value={settings.sendToMin} onChange={(e) => setSettings({ ...settings, sendToMin: Number(e.target.value) })}>
                        {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* LIMITS + WARM-UP */}
                <div className="pane">
                  <div className="pane-head"><span>LIMITS & WARM-UP</span></div>
                  <p className="dim-txt">Rolling caps enforced by the queue. 0 = unlimited. Warm-up starts the daily cap at 5 and adds ~10/day until it reaches the max — turning it off removes the ramp.</p>
                  <label className="check-row">
                    <input type="checkbox" checked={settings.capsEnabled === true} onChange={(e) => setSettings({ ...settings, capsEnabled: e.target.checked })} />
                    <span>Enforce hourly/daily caps — <strong>{settings.capsEnabled === true ? 'ON' : 'OFF (uncapped)'}</strong></span>
                  </label>
                  <div className="form-grid">
                    <div><label className="field-label">MAX PER HOUR</label><input className="w-input" type="number" min="0" value={settings.maxPerHour} onChange={(e) => setSettings({ ...settings, maxPerHour: Number(e.target.value) })} /></div>
                    <div><label className="field-label">MAX PER DAY</label><input className="w-input" type="number" min="0" value={settings.maxPerDay} onChange={(e) => setSettings({ ...settings, maxPerDay: Number(e.target.value) })} /></div>
                  </div>
                  <label className="check-row">
                    <input type="checkbox" checked={settings.warmupEnabled} onChange={(e) => setSettings({ ...settings, warmupEnabled: e.target.checked })} />
                    <span>Automatic warm-up {settings.warmupStartedAt ? <span className="dim">(started {new Date(settings.warmupStartedAt).toLocaleDateString()})</span> : null}</span>
                  </label>
                </div>

                {/* ══ SECTION: INBOX ══ */}
                <div className="email-section">INBOX</div>

                {/* INBOX READING */}
                <div className="pane">
                  <div className="pane-head"><span>INBOX READING (IMAP)</span></div>
                  <p className="dim-txt">Provider support for reading replies/bounces:</p>
                  <ul className="dim-txt" style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.7 }}>
                    <li><strong>Gmail / Google Workspace</strong> — works. Enable IMAP (Settings → Forwarding and POP/IMAP) and use an app password, not your normal password. Server imap.gmail.com, port 993.</li>
                    <li><strong>Email on your own domain (cPanel, HostGator…)</strong> — works with the same username/password as sending. Server usually mail.yourdomain.com, port 993.</li>
                    <li><strong>Microsoft 365 / Outlook.com / Hotmail</strong> — not supported: Microsoft requires its own OAuth sign-in screen.</li>
                  </ul>
                  <p className="dim-txt">Reply/bounce ingestion is not wired into the queue yet — replies currently go to the Reply-To address.</p>
                </div>
                </div>
              )}

              {/* ══ SETTINGS / DELIVERY ══ */}
              {tab === 'delivery' && (
                <div className="pane narrow-pane">
                  <div className="pane-head"><span>SENDER SETTINGS</span></div>

                  {/* Send Mode */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ SEND TYPE ]</div>
                    <div className="mode-grid">
                      {[
                        ['smtp',   'SMTP AUTH',    'Authenticated SMTP provider'],
                        ['direct', 'DIRECT MX',    'Send direct to recipient MX port 25'],
                        ['relay',  'RELAY / PROXY','Open relay, no auth, port 25'],
                        ['socks5', 'PROXY',       'Direct via HTTP/SOCKS4/SOCKS5 proxy'],
                        ['graph',  'GRAPH API',   'Microsoft 365 / Outlook via Graph'],
                        ['gmail',  'GMAIL API',   'Gmail via Google API'],
                      ].map(([v, lbl, desc]) => (
                        <label key={v} className={`mode-card ${sendMode === v ? 'active' : ''}`}>
                          <input type="radio" name="sendMode" value={v} checked={sendMode === v} onChange={() => updateSettings('sendMode', v)} />
                          <span className="mc-lbl">{lbl}</span>
                          <span className="mc-desc">{desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Direct / SOCKS5 */}
                  {(sendMode === 'direct' || sendMode === 'socks5') && (
                    <div className="cfg-block">
                      <div className="cfg-block-title">[ DIRECT CONFIG ]</div>
                      <div className="form-grid">
                        <div><label className="field-label">FROM NAME</label><input className="w-input" value={settings.directFromName} onChange={(e) => updateSettings('directFromName', e.target.value)} /></div>
                        <div><label className="field-label">FROM EMAIL</label><input className="w-input" type="email" value={settings.directFromEmail} onChange={(e) => updateSettings('directFromEmail', e.target.value)} /></div>
                        <div><label className="field-label">REPLY-TO</label><input className="w-input" type="email" value={settings.directReplyTo} onChange={(e) => updateSettings('directReplyTo', e.target.value)} /></div>
                        <div><label className="field-label">RATE / MIN</label><input className="w-input" type="number" min="1" max="200" value={settings.directRatePerMinute} onChange={(e) => updateSettings('directRatePerMinute', Number(e.target.value))} /></div>
                      </div>
                      {sendMode === 'socks5' && (
                        <div>
                          <label className="field-label">PROXY URL</label>
                          <input className="w-input" value={settings.socks5Proxy} onChange={(e) => updateSettings('socks5Proxy', e.target.value)} placeholder="http://user:pass@host:8080  ·  socks5://user:pass@host:1080  ·  socks4://..." />
                          <p className="dim-txt" style={{marginTop:4}}>http, https, socks4 and socks5 schemes supported.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Relay */}
                  {sendMode === 'relay' && (
                    <div className="cfg-block">
                      <div className="cfg-block-title">[ RELAY CONFIG ]</div>
                      <p className="dim-txt">Full SMTP relay client — works with smtp-relay.gmail.com (Workspace IP allowlist), private postfix, or any SMTP relay. Security AUTO upgrades to STARTTLS when the server offers it.</p>
                      <div className="form-grid">
                        <div><label className="field-label">RELAY HOST</label><input className="w-input" value={settings.relayHost} onChange={(e) => updateSettings('relayHost', e.target.value)} placeholder="smtp-relay.gmail.com" /></div>
                        <div><label className="field-label">PORT</label><input className="w-input" type="number" value={settings.relayPort} onChange={(e) => updateSettings('relayPort', Number(e.target.value))} /></div>
                        <div><label className="field-label">SECURITY</label>
                          <select className="w-select" value={settings.relaySecure ?? 0} onChange={(e) => updateSettings('relaySecure', Number(e.target.value))}>
                            <option value={0}>AUTO — STARTTLS if offered</option>
                            <option value={1}>SSL/TLS (implicit, port 465)</option>
                            <option value={2}>PLAIN (no TLS, port 25)</option>
                          </select>
                        </div>
                        <div><label className="field-label">EHLO NAME <span className="dim">(FQDN you own — e.g. mail.yourdomain.com)</span></label><input className="w-input" value={settings.relayEhlo || ''} onChange={(e) => updateSettings('relayEhlo', e.target.value)} placeholder="mail.yourdomain.com" /></div>
                        <div><label className="field-label">USERNAME <span className="dim">(optional)</span></label><input className="w-input" value={settings.relayUsername || ''} onChange={(e) => updateSettings('relayUsername', e.target.value)} /></div>
                        <div><label className="field-label">PASSWORD <span className="dim">{settings.relayPasswordSet ? '(saved — blank keeps)' : '(blank = no auth)'}</span></label><input className="w-input" type="password" value={settings.relayPassword || ''} onChange={(e) => updateSettings('relayPassword', e.target.value)} /></div>
                        <div><label className="field-label">RATE / MIN</label><input className="w-input" type="number" min="1" max="200" value={settings.directRatePerMinute} onChange={(e) => updateSettings('directRatePerMinute', Number(e.target.value))} /></div>
                        <div><label className="field-label">FROM NAME</label><input className="w-input" value={settings.directFromName} onChange={(e) => updateSettings('directFromName', e.target.value)} /></div>
                        <div><label className="field-label">FROM EMAIL</label><input className="w-input" type="email" value={settings.directFromEmail} onChange={(e) => updateSettings('directFromEmail', e.target.value)} /></div>
                        <div><label className="field-label">REPLY-TO</label><input className="w-input" type="email" value={settings.directReplyTo} onChange={(e) => updateSettings('directReplyTo', e.target.value)} /></div>
                      </div>
                      <div style={{display:'flex',gap:10,alignItems:'center',marginTop:12,flexWrap:'wrap'}}>
                        <button className="btn-sm" disabled={busy || relayTest.state === 'testing' || !settings.relayHost} onClick={() => {
                          setRelayTest({ state: 'testing' });
                          api(token, '/api/relay/verify', { method: 'POST' })
                            .then((r) => setRelayTest({ state: 'ok', ms: r.ms, host: r.host }))
                            .catch((e) => setRelayTest({ state: 'fail', error: e.message || 'connection failed' }));
                        }}>{relayTest.state === 'testing' ? '[ TESTING… ]' : '[ TEST CONNECTION ]'}</button>
                        <button className="btn-sm" disabled={busy || relayTest.state === 'testing' || !settings.relayHost} onClick={() => {
                          setRelayTest({ state: 'testing' });
                          api(token, '/api/relay/diag', { method: 'POST', body: { testTo: testTo.includes('@') ? testTo : '' } })
                            .then((r) => setRelayTest({ state: 'diag', stages: r.stages || [], ok: r.ok }))
                            .catch((e) => setRelayTest({ state: 'fail', error: e.message || 'diag failed' }));
                        }}>[ DIAGNOSE ]</button>
                        <input className="w-input" style={{maxWidth:210}} type="email" placeholder="rcpt to test (optional)…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                        {relayTest.state === 'ok' && <span className="green-txt" style={{fontSize:13}}>● CONNECTED {relayTest.host} · {relayTest.ms}ms</span>}
                        {relayTest.state === 'fail' && <span className="red-txt" style={{fontSize:13}}>● {relayTest.error}</span>}
                        {relayTest.state === 'idle' && <span className="dim-txt" style={{fontSize:12}}>handshakes the relay — EHLO + STARTTLS + AUTH</span>}
                      </div>
                      {relayTest.state === 'diag' && (
                        <div className="console" style={{marginTop:10, maxHeight: 220}}>
                          {(relayTest.stages || []).map((s, i) => (
                            <div key={i} style={{ color: s.ok ? 'var(--green)' : 'var(--red)', fontSize: 12, fontFamily: 'monospace', padding: '1px 0' }}>
                              {s.ok ? '✓' : '✗'} {s.name}{s.detail ? ' — ' + s.detail : ''}
                            </div>
                          ))}
                          <div className="dim-txt" style={{fontSize:11,marginTop:6}}>{relayTest.ok ? 'all stages passed' : 'stopped at first failure'}{testTo.includes('@') ? ' · envelope tested to ' + testTo : ' · add a test address above to also check MAIL/RCPT'}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Proxy for SMTP mode */}
                  {sendMode === 'smtp' && (
                    <div className="cfg-block">
                      <div className="cfg-block-title">[ PROXY ROUTING ] <span className="dim">optional</span></div>
                      <label className="field-label">PROXY URL</label>
                      <input className="w-input" value={settings.socks5Proxy} onChange={(e) => updateSettings('socks5Proxy', e.target.value)} placeholder="http://user:pass@host:8080  ·  socks5://user:pass@host:1080  ·  socks4://..." />
                      <p className="dim-txt">Routes the SMTP connection through the proxy — http, https, socks4, socks5.</p>
                    </div>
                  )}

                  {/* OAuth engine config — graph / gmail */}
                  {(sendMode === 'graph' || sendMode === 'gmail') && (
                    <div className="cfg-block">
                      <div className="cfg-block-title">[ {sendMode === 'graph' ? 'MICROSOFT GRAPH' : 'GMAIL API'} ENGINE ]</div>
                      <p className="dim-txt">
                        {sendMode === 'graph'
                          ? 'Two auth modes: (A) App-only — Azure AD app registration with Mail.Send application permission + admin consent. (B) Delegated — connect any Microsoft 365 / Outlook account via OAuth; also unlocks Contacts extraction.'
                          : 'Google Cloud OAuth client (type "Web application") with Gmail API enabled. Add this redirect URI in the client: '}
                        {sendMode === 'gmail' && <code>{state?.publicBaseUrl}/api/engine/gmail/callback</code>}
                      </p>

                      {/* Graph delegated connect */}
                      {sendMode === 'graph' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div className="btn-row" style={{ alignItems: 'center' }}>
                            <button className="btn-primary" disabled={busy} onClick={() => run(async () => {
                              const r = await api(token, '/api/engine/graph/connect', { method: 'POST' });
                              window.open(r.url, '_blank', 'noopener');
                              showNotice('Microsoft sign-in opened — pick the mailbox. Delegated token stored on callback.');
                            })}>[ CONNECT MICROSOFT ACCOUNT ]</button>
                            {settings.engineMsRefreshToken === true && (
                              <span className="badge badge-ok">DELEGATED{settings.engineMsSendAs ? ` · ${settings.engineMsSendAs}` : ''}</span>
                            )}
                            {settings.engineMsRefreshToken === true && (
                              <button className="btn-xs btn-danger" disabled={busy} onClick={() => run(async () => {
                                await api(token, '/api/engine/graph/token', { method: 'DELETE' });
                                showNotice('Microsoft delegated token removed.');
                                await refresh();
                              })}>DISCONNECT</button>
                            )}
                          </div>
                          <details style={{ border: '1px solid rgba(0,255,65,0.1)', padding: '10px 14px', background: 'rgba(0,8,0,0.3)' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>Setup guide — Graph delegated</summary>
                            <ol className="dim-txt" style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, fontSize: 11 }}>
                              <li>Go to <strong>portal.azure.com</strong> → Azure Active Directory → App registrations → New registration</li>
                              <li>Redirect URI: <strong>Web</strong> → <code>{state?.publicBaseUrl || 'http://127.0.0.1:3000'}/api/engine/graph/callback</code></li>
                              <li>API permissions → Add → Microsoft Graph → <strong>Delegated</strong> → Mail.Send, Contacts.Read</li>
                              <li>Certificates &amp; secrets → New client secret → copy it</li>
                              <li>Overview → copy <strong>Application (client) ID</strong> and <strong>Directory (tenant) ID</strong></li>
                              <li>Paste CLIENT ID, CLIENT SECRET, TENANT ID below → <strong>SAVE SETTINGS</strong></li>
                              <li>Hit <strong>CONNECT MICROSOFT ACCOUNT</strong> → sign in → delegated token auto-stored encrypted</li>
                            </ol>
                          </details>
                        </div>
                      )}

                      {sendMode === 'gmail' && (
                        <div className="btn-row" style={{ marginBottom: 10, alignItems: 'center' }}>
                          <button className="btn-primary" disabled={busy} onClick={() => run(async () => {
                            const r = await api(token, '/api/engine/gmail/connect', { method: 'POST' });
                            window.open(r.url, '_blank', 'noopener');
                            showNotice('Google sign-in opened — pick the mailbox to use as sender.');
                          })}>[ CONNECT GOOGLE ACCOUNT ]</button>
                          {settings.engineRefreshToken === true && (
                            <span className="badge badge-ok">CONNECTED{settings.engineSendAs ? ` · ${settings.engineSendAs}` : ''}</span>
                          )}
                        </div>
                      )}
                      {sendMode === 'gmail' && (
                        <details style={{ border: '1px solid rgba(0,255,65,0.1)', padding: '10px 14px', background: 'rgba(0,8,0,0.3)', marginBottom: 10 }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>Connect guide — one-time Google Cloud setup</summary>
                          <ol className="dim-txt" style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, fontSize: 11 }}>
                            <li>Go to <strong>console.cloud.google.com</strong> → create a project (any name)</li>
                            <li>APIs &amp; Services → Library → enable <strong>Gmail API</strong></li>
                            <li>OAuth consent screen → External → app name + your email → add yourself under <strong>Test users</strong></li>
                            <li>Credentials → Create Credentials → <strong>OAuth client ID</strong> → type <strong>Web application</strong></li>
                            <li>Authorized redirect URIs → add <code>{state?.publicBaseUrl || 'http://127.0.0.1:3000'}/api/engine/gmail/callback</code></li>
                            <li>Copy CLIENT ID + CLIENT SECRET into the fields above → <strong>SAVE SETTINGS</strong></li>
                            <li>Hit <strong>CONNECT GOOGLE ACCOUNT</strong> → sign in with the Gmail you want to send from → done</li>
                          </ol>
                        </details>
                      )}
                      <div className="form-grid">
                        <div><label className="field-label">CLIENT ID</label><input className="w-input" value={settings.engineClientId} onChange={(e) => updateSettings('engineClientId', e.target.value)} placeholder="xxxxxxxx-xxxx-..." /></div>
                        <div><label className="field-label">{sendMode === 'graph' ? 'TENANT ID' : 'SEND-AS (optional)'}</label><input className="w-input" value={sendMode === 'graph' ? settings.engineTenant : settings.engineSendAs} onChange={(e) => updateSettings(sendMode === 'graph' ? 'engineTenant' : 'engineSendAs', e.target.value)} placeholder={sendMode === 'graph' ? 'tenant-guid-or-domain' : 'you@gmail.com'} /></div>
                        <div><label className="field-label">CLIENT SECRET {settings.engineClientSecret === true ? <span className="dim">(configured — enter to rotate)</span> : null}</label><input className="w-input" type="password" value={typeof settings.engineClientSecret === 'string' ? settings.engineClientSecret : ''} onChange={(e) => updateSettings('engineClientSecret', e.target.value)} placeholder={settings.engineClientSecret === true ? '(unchanged)' : ''} /></div>
                        {sendMode === 'gmail' && (
                          <div><label className="field-label">REFRESH TOKEN {settings.engineRefreshToken === true ? <span className="dim">(configured — enter to rotate)</span> : null}</label><input className="w-input" type="password" value={typeof settings.engineRefreshToken === 'string' ? settings.engineRefreshToken : ''} onChange={(e) => updateSettings('engineRefreshToken', e.target.value)} placeholder={settings.engineRefreshToken === true ? '(unchanged)' : '1//0g...'} /></div>
                        )}
                        {sendMode === 'graph' && (
                          <div><label className="field-label">SEND-AS MAILBOX {settings.engineMsSendAs ? <span className="dim">(auto-filled on connect)</span> : null}</label><input className="w-input" type="email" value={settings.engineMsSendAs || settings.engineSendAs} onChange={(e) => updateSettings('engineSendAs', e.target.value)} placeholder="sender@yourdomain.com" /></div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Rotation */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ ROTATION ]</div>
                    <label className="field-label">SUBJECT VARIANTS <span className="dim">(one per line — picked randomly per send)</span></label>
                    <textarea className="w-textarea code-ta" rows={5}
                      value={(settings.subjectsList || []).join('\n')}
                      onChange={(e) => updateSettings('subjectsList', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                      placeholder={'Action required on your ++rbc_domain1++ account\nImportant: ++rbc_domain1++ security alert'} />
                    <label className="field-label">FROM NAME VARIANTS <span className="dim">(one per line)</span></label>
                    <textarea className="w-textarea code-ta" rows={5}
                      value={(settings.fromNames || []).join('\n')}
                      onChange={(e) => updateSettings('fromNames', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                      placeholder={'++rbc_domain1++ Support\n++rbc_domain1++ Security Team'} />
                    <label className="field-label">REDIRECT URL / LINK POOL <span className="dim">(one per line — random per send · used by ++rbc_url++ / ++rbc_link++ / ++rbc_short++)</span></label>
                    <textarea className="w-textarea code-ta" rows={3} value={settings.redirectUrl} onChange={(e) => updateSettings('redirectUrl', e.target.value)} placeholder={'https://your-link.com/r?e=++rbc_email++\nhttps://backup-link.com/l?e=++rbc_email++'} />
                  </div>

                  {/* SENDER IDENTITY / SPOOFING */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ SENDER IDENTITY ]</div>
                    <p className="dim-txt">Send as <strong>Company Name &lt;notifications@yourdomain.com&gt;</strong>. Overrides the from-address for every mode. Placeholders work in the display name.</p>
                    <div className="form-grid">
                      <div>
                        <label className="field-label">DISPLAY NAME</label>
                        <input className="w-input" value={settings.spoofFromName} onChange={(e) => updateSettings('spoofFromName', e.target.value)} placeholder="Company Name" />
                      </div>
                      <div>
                        <label className="field-label">FROM EMAIL</label>
                        <input className="w-input" type="email" value={settings.spoofFromEmail} onChange={(e) => updateSettings('spoofFromEmail', e.target.value)} placeholder="notifications@yourdomain.com" />
                      </div>
                      <div>
                        <label className="field-label">REPLY-TO</label>
                        <input className="w-input" type="email" value={settings.spoofReplyTo} onChange={(e) => updateSettings('spoofReplyTo', e.target.value)} placeholder="support@yourdomain.com" />
                      </div>
                      <div>
                        <label className="field-label">RETURN-PATH</label>
                        <input className="w-input" type="email" value={settings.returnPath} onChange={(e) => updateSettings('returnPath', e.target.value)} placeholder="defaults to from email" />
                      </div>
                      <div>
                        <label className="field-label">MESSAGE-ID DOMAIN</label>
                        <input className="w-input" value={settings.msgidDomain} onChange={(e) => updateSettings('msgidDomain', e.target.value)} placeholder="defaults to from domain" />
                      </div>
                      <div>
                        <label className="field-label">X-MAILER</label>
                        <select className="w-select" value={settings.xMailer} onChange={(e) => updateSettings('xMailer', e.target.value)}>
                          <option value="">None</option>
                          <option value="gmail">Gmail</option>
                          <option value="outlook">Microsoft Outlook 16.0</option>
                          <option value="thunderbird">Mozilla Thunderbird</option>
                          <option value="apple">Apple Mail</option>
                        </select>
                      </div>
                    </div>
                    <div className="toggle-list">
                      <div className="toggle-row" onClick={() => updateSettings('fakeReceived', !settings.fakeReceived)}>
                        <div>
                          <div className="toggle-lbl">FAKE RECEIVED HEADERS</div>
                          <div className="toggle-desc">Inject realistic Received chain headers</div>
                        </div>
                        <div className={`tog ${settings.fakeReceived ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                    </div>
                  </div>

                  {/* DKIM SIGNING */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ DKIM SIGNING ]</div>
                    <p className="dim-txt">Sign outgoing mail with a DKIM key so receivers see a valid signature. Key is stored encrypted.</p>
                    <div className="toggle-row" onClick={() => updateSettings('dkimEnabled', !settings.dkimEnabled)}>
                      <div>
                        <div className="toggle-lbl">ENABLE DKIM</div>
                        <div className="toggle-desc">{settings.dkimConfigured ? 'Key configured — enter new key to rotate' : 'No key stored yet'}</div>
                      </div>
                      <div className={`tog ${settings.dkimEnabled ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                    </div>
                    {settings.dkimEnabled && (
                      <>
                        <div className="form-grid">
                          <div>
                            <label className="field-label">DKIM DOMAIN</label>
                            <input className="w-input" value={settings.dkimDomain} onChange={(e) => updateSettings('dkimDomain', e.target.value)} placeholder="yourdomain.com" />
                          </div>
                          <div>
                            <label className="field-label">SELECTOR</label>
                            <input className="w-input" value={settings.dkimSelector} onChange={(e) => updateSettings('dkimSelector', e.target.value)} placeholder="mail or default" />
                          </div>
                        </div>
                        <label className="field-label">PRIVATE KEY <span className="dim">(PEM format — leave blank to keep existing)</span></label>
                        <textarea className="w-textarea code-ta" rows={5} value={settings.dkimPrivateKey || ''} onChange={(e) => updateSettings('dkimPrivateKey', e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" />
                        <div className="dkim-dns-guide">
                          <label className="field-label">DNS RECORDS TO PUBLISH <span className="dim">(at your DNS provider)</span></label>
                          <div className="dns-rec">
                            <div className="dns-type">TXT</div>
                            <div className="dns-name">{settings.dkimSelector || 'selector'}.{settings.dkimDomain || 'yourdomain.com'}</div>
                            <div className="dns-val">v=DKIM1; k=rsa; p=&lt;public-key-base64&gt;</div>
                          </div>
                          <div className="dns-rec">
                            <div className="dns-type">TXT</div>
                            <div className="dns-name">{settings.dkimDomain || 'yourdomain.com'}</div>
                            <div className="dns-val">v=DKIM1; k=rsa; p=&lt;public-key-base64&gt;</div>
                            <div className="dim-txt">(same key at root — covers unsigned subdomains)</div>
                          </div>
                          <p className="dim-txt">Derive the public key from your private key: <code>openssl rsa -in priv.pem -pubout</code> then base64 the DER body. For full alignment add a DMARC TXT record on <code>_dmarc.{settings.dkimDomain || 'yourdomain.com'}</code>: <code>v=DMARC1; p=none;</code></p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Email options */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ EMAIL OPTIONS ]</div>
                    <div className="form-grid">
                      <div>
                        <label className="field-label">ENCODING</label>
                        <select className="w-select" value={settings.encoding} onChange={(e) => updateSettings('encoding', e.target.value)}>
                          <option value="base64">base64</option>
                          <option value="8bit">8bit</option>
                          <option value="quoted-printable">quoted-printable</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">PRIORITY</label>
                        <select className="w-select" value={settings.priority} onChange={(e) => updateSettings('priority', Number(e.target.value))}>
                          <option value={1}>1 — Very Important</option>
                          <option value={2}>2 — Important</option>
                          <option value={3}>3 — Normal</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">SEND TYPE</label>
                        <select className="w-select" value={settings.sendType} onChange={(e) => updateSettings('sendType', e.target.value)}>
                          <option value="to">TO</option>
                          <option value="cc">CC</option>
                          <option value="bcc">BCC</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">SLEEP MS</label>
                        <input className="w-input" type="number" min="0" max="60000" value={settings.sleepMs} onChange={(e) => updateSettings('sleepMs', Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="field-label">PARALLEL SENDS <span className="dim">(beast mode — max 30)</span></label>
                        <input className="w-input" type="number" min="1" max="30" value={settings.parallelSends} onChange={(e) => updateSettings('parallelSends', Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="toggle-list">
                      <div className="toggle-row" onClick={() => updateSettings('textOnly', !settings.textOnly)}>
                        <div>
                          <div className="toggle-lbl">TEXT-ONLY SEND</div>
                          <div className="toggle-desc">Send without HTML part — plain text only</div>
                        </div>
                        <div className={`tog ${settings.textOnly ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('trackOpens', !settings.trackOpens)}>
                        <div>
                          <div className="toggle-lbl">OPEN TRACKING</div>
                          <div className="toggle-desc">1×1 pixel — logs when recipient opens</div>
                        </div>
                        <div className={`tog ${settings.trackOpens ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('trackClicks', !settings.trackClicks)}>
                        <div>
                          <div className="toggle-lbl">CLICK TRACKING</div>
                          <div className="toggle-desc">Wraps all links through redirect — logs clicks</div>
                        </div>
                        <div className={`tog ${settings.trackClicks ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                    </div>
                    {settings.trackClicks && (
                      <div>
                        <label className="field-label">CLICK TRACKER BASE URL <span className="dim">(links redirect through this — e.g. https://your-domain.com/go)</span></label>
                        <input className="w-input" value={settings.clickTrackerUrl} onChange={(e) => updateSettings('clickTrackerUrl', e.target.value)} placeholder="https://track.yourdomain.com/c" />
                      </div>
                    )}
                  </div>

                  {/* Anti-fingerprint */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ ANTI-FINGERPRINT ]</div>
                    <div className="toggle-list">
                      <div className="toggle-row" onClick={() => updateSettings('htmlRandomize', !settings.htmlRandomize)}>
                        <div>
                          <div className="toggle-lbl">HTML RANDOMIZE</div>
                          <div className="toggle-desc">Unique byte structure per send — random comments/whitespace</div>
                        </div>
                        <div className={`tog ${settings.htmlRandomize ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('spamBypass', !settings.spamBypass)}>
                        <div>
                          <div className="toggle-lbl">SPAM WORD BYPASS</div>
                          <div className="toggle-desc">ZWNJ inside trigger words — breaks filter tokenization</div>
                        </div>
                        <div className={`tog ${settings.spamBypass ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('subjectB64', !settings.subjectB64)}>
                        <div>
                          <div className="toggle-lbl">BASE64 SUBJECT</div>
                          <div className="toggle-desc">RFC2047 encoded-word subject — hides content from filters</div>
                        </div>
                        <div className={`tog ${settings.subjectB64 ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('fromnameB64', !settings.fromnameB64)}>
                        <div>
                          <div className="toggle-lbl">BASE64 FROM NAME</div>
                          <div className="toggle-desc">Encoded-word display name</div>
                        </div>
                        <div className={`tog ${settings.fromnameB64 ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('imageRecompress', !settings.imageRecompress)}>
                        <div>
                          <div className="toggle-lbl">IMAGE RECOMPRESS</div>
                          <div className="toggle-desc">Resize + fake EXIF + hash padding on image attachments</div>
                        </div>
                        <div className={`tog ${settings.imageRecompress ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('linkCloak', !settings.linkCloak)}>
                        <div>
                          <div className="toggle-lbl">LINK CLOAK</div>
                          <div className="toggle-desc">Every outbound href rewritten behind a redirect base — destination hidden. Applied after click-tracking so opens/clicks still log.</div>
                        </div>
                        <div className={`tog ${settings.linkCloak ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                    </div>
                    {settings.linkCloak && (
                      <div>
                        <label className="field-label">CLOAK BASE URL <span className="dim">(blank = google.com/url — shows a redirect notice · set your own domain for a clean 302, destination appended as ?u=)</span></label>
                        <input className="w-input" value={settings.cloakBase || ''} onChange={(e) => updateSettings('cloakBase', e.target.value)} placeholder="https://r.yourdomain.com/go" />
                      </div>
                    )}
                    <div>
                      <label className="field-label">AUTO-ATTACH FORMATS <span className="dim">(generated from the letter body — eml/docx/pdf/ics)</span></label>
                      <div className="fmt-row">
                        {['eml', 'docx', 'pdf', 'ics'].map((f) => (
                          <label key={f} className="check-row">
                            <input type="checkbox" checked={(settings.attachFormats || []).includes(f)}
                              onChange={(e) => updateSettings('attachFormats', e.target.checked ? [...(settings.attachFormats || []), f] : (settings.attachFormats || []).filter((x) => x !== f))} />
                            <span>{f.toUpperCase()}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ DISCLAIMER ]</div>
                    <p className="dim-txt">Appended to every email before the unsubscribe footer. Placeholders work. Rotate variants manually.</p>
                    <textarea className="w-textarea" rows={4} value={settings.disclaimerText} onChange={(e) => updateSettings('disclaimerText', e.target.value)} placeholder="This message is confidential..." />
                  </div>

                  {/* Obfuscation */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ LETTER ENCRYPT ]</div>
                    <div>
                      <label className="field-label">ENCODE MODE</label>
                      <select className="w-select" value={settings.encryptMode} onChange={(e) => updateSettings('encryptMode', e.target.value)}>
                        <option value="unicode">Unicode lookalike (fullwidth)</option>
                        <option value="html_entities">HTML entities</option>
                      </select>
                    </div>
                    <div className="toggle-list">
                      {[
                        ['encryptLetter',   'ENCRYPT LETTER',    'Encode HTML body characters'],
                        ['subjectEncrypt',  'ENCRYPT SUBJECT',   'Encode subject line'],
                        ['fromNameEncrypt', 'ENCRYPT FROMNAME',  'Encode sender display name'],
                      ].map(([k, lbl, desc]) => (
                        <div key={k} className="toggle-row" onClick={() => updateSettings(k, !settings[k])}>
                          <div>
                            <div className="toggle-lbl">{lbl}</div>
                            <div className="toggle-desc">{desc}</div>
                          </div>
                          <div className={`tog ${settings[k] ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom headers */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ CUSTOM HEADER ]</div>
                    <div className="toggle-row" onClick={() => updateSettings('customHeadersEnabled', !settings.customHeadersEnabled)}>
                      <div className="toggle-lbl">ENABLE CUSTOM HEADER</div>
                      <div className={`tog ${settings.customHeadersEnabled ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                    </div>
                    {settings.customHeadersEnabled && (
                      <>
                        <label className="field-label" style={{marginTop:10}}>HEADERS <span className="dim">(Name: Value — one per line)</span></label>
                        <textarea className="w-textarea code-ta" rows={5}
                          value={(settings.customHeaders || []).join('\n')}
                          onChange={(e) => updateSettings('customHeaders', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                          placeholder={'Message-ID: <++rbc_randstring++.++rbc_number6++@sendgrid.net>\nX-Mailer: Microsoft Outlook 16.0'} />
                      </>
                    )}
                  </div>

                  {/* Test email */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ TEST EMAIL ]</div>
                    <div className="toggle-row" onClick={() => updateSettings('testEmailEnabled', !settings.testEmailEnabled)}>
                      <div className="toggle-lbl">SEND TEST EVERY N EMAILS</div>
                      <div className={`tog ${settings.testEmailEnabled ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                    </div>
                    {settings.testEmailEnabled && (
                      <div className="form-grid" style={{marginTop:10}}>
                        <div><label className="field-label">EVERY</label><input className="w-input" type="number" min="1" value={settings.testEvery} onChange={(e) => updateSettings('testEvery', Number(e.target.value))} /></div>
                        <div><label className="field-label">DESTINATION</label><input className="w-input" type="email" value={settings.testDestination} onChange={(e) => updateSettings('testDestination', e.target.value)} /></div>
                      </div>
                    )}
                  </div>

                  {/* Telegram */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">[ TELEGRAM REPORTS ]</div>
                    <p className="dim-txt">Campaign start/finish, opens, clicks, bounces and unsubscribes are pushed here live. Create a bot via @BotFather, get your chat id from @userinfobot.</p>
                    <div className="form-grid">
                      <div><label className="field-label">BOT TOKEN</label><input className="w-input" type="password" value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder={state.telegram?.configured ? '•••••••• (saved — leave blank to keep)' : '123456:ABC-DEF...'} /></div>
                      <div><label className="field-label">CHAT ID</label><input className="w-input" value={tgChat} onChange={(e) => setTgChat(e.target.value)} placeholder="-1001234567890" /></div>
                    </div>
                    <div style={{display:'flex',gap:10,marginTop:12,alignItems:'center'}}>
                      <button className="btn-sm" disabled={busy} onClick={() => run(async () => {
                        await api(token, '/api/telegram', { method: 'PUT', body: { botToken: tgToken, chatId: tgChat } });
                        setTgToken(''); await refresh(); showNotice('Telegram saved.');
                      })}>[ SAVE ]</button>
                      <button className="btn-sm" disabled={busy || !state.telegram?.configured} onClick={() => run(async () => { await api(token, '/api/telegram/test', { method: 'POST' }); showNotice('Test sent — check telegram.'); })}>[ TEST ]</button>
                      <span className={`stat-val ${state.telegram?.configured ? 'sent-val' : 'fail-val'}`} style={{fontSize:11}}>{state.telegram?.configured ? `● LINKED · ${state.telegram.chatId}` : '○ NOT CONFIGURED'}</span>
                    </div>
                  </div>

                  <button className="btn-primary" disabled={busy} onClick={saveSettings}>[ SAVE SETTINGS ]</button>
                </div>
              )}

              {/* ══ SCHEDULE ══ */}
              {tab === 'schedule' && (
                <div className="pane narrow-pane">
                  <div className="pane-head"><span>SCHEDULE SEND</span></div>
                  <p className="dim-txt">{selectedId ? `Draft #${selectedId} selected.` : 'Current compose content will be saved as a draft.'}</p>
                  <label className="field-label">DELIVERY DATE / TIME</label>
                  <input className="w-input" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                  <button className="btn-primary" style={{marginTop:14}} disabled={busy || !scheduledFor || !canQueue} onClick={() => { try { new Date(scheduledFor).toISOString(); queue(true); } catch { showNotice('Invalid date.', 'err'); } }}>[ QUEUE SCHEDULED ]</button>
                </div>
              )}

              {/* ══ BOUNCES ══ */}
              {tab === 'bounces' && (
                <div className="pane">
                  <div className="pane-head"><span>SUPPRESSION LOG</span></div>
                  <div className="tbl-wrap">
                    <table className="w-table">
                      <thead><tr><th>EMAIL</th><th>TYPE</th><th>REASON</th><th>DATE</th></tr></thead>
                      <tbody>
                        {state.bounces.map((b) => (
                          <tr key={b.id}>
                            <td>{b.email}</td>
                            <td><span className="badge badge-fail">{b.kind.toUpperCase()}</span></td>
                            <td className="dim">{b.reason}</td>
                            <td className="dim">{new Date(b.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ══ DASHBOARD ══ */}
              {tab === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="dash-head">
                    <div>
                      <div className="dash-title">OPERATIONS</div>
                      <div className="dim-txt">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {state.confirmed} confirmed recipients · {state.campaigns.length} campaigns</div>
                    </div>
                    <span className="dash-mode-pill">{sendMode.toUpperCase()}</span>
                  </div>

                  <div className="kpi-row">
                    {[
                      ['TOTAL SENT', totals.sent, 'var(--green)'],
                      ['FAILED', totals.failed, 'var(--red)'],
                      ['IN QUEUE', totals.queued, 'var(--yellow)'],
                      ['RECIPIENTS', state.confirmed, 'var(--cyan)'],
                      ['BOUNCES', (state.bounces || []).length, 'var(--orange, #fb923c)'],
                      ['ACCOUNTS', (state.smtpAccounts || []).filter((a) => a.enabled).length, 'var(--txt)'],
                    ].map(([lbl, val, color]) => (
                      <div key={lbl} className="kpi-card">
                        <div className="kpi-val" style={{ color }}>{val}</div>
                        <div className="kpi-lbl">{lbl}</div>
                      </div>
                    ))}
                  </div>

                  <div className="dash-grid">
                    <div className="pane">
                      <div className="pane-head"><span>CAMPAIGNS</span></div>
                      <div className="tbl-wrap" style={{ maxHeight: 380 }}>
                        <table className="w-table">
                          <thead><tr><th>#</th><th>NAME</th><th>STATUS</th><th>PROGRESS</th><th>SENT</th><th>FAIL</th><th>QUEUE</th></tr></thead>
                          <tbody>
                            {state.campaigns.map((c) => {
                              const pct = c.total > 0 ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
                              return (
                                <tr key={c.id}>
                                  <td className="dim">{c.id}</td>
                                  <td>{c.name}</td>
                                  <td><span className={`badge ${c.status === 'completed' ? 'badge-ok' : c.status === 'failed' ? 'badge-fail' : 'badge-def'}`}>{c.status.toUpperCase()}</span></td>
                                  <td style={{ minWidth: 120 }}>
                                    <div className="prog-bar"><div className="prog-fill" style={{ width: `${pct}%` }} /></div>
                                    <span className="dim" style={{ fontSize: 10 }}>{pct}%</span>
                                  </td>
                                  <td className="green-txt">{c.sent}</td>
                                  <td className="red-txt">{c.failed}</td>
                                  <td className="yellow-txt">{c.queued}</td>
                                </tr>
                              );
                            })}
                            {!state.campaigns.length && <tr><td colSpan={7} className="dim" style={{ textAlign: 'center' }}>No campaigns yet — compose a letter and send.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="pane">
                        <div className="pane-head"><span>ENGINE STATUS</span></div>
                        <div className="engine-grid">
                          <div className="engine-row"><span className="dim">MODE</span><strong>{sendMode.toUpperCase()}</strong></div>
                          <div className="engine-row"><span className="dim">PARALLEL</span><strong>×{settings.parallelSends || 1}</strong></div>
                          <div className="engine-row"><span className="dim">POOL ACCOUNTS</span><strong>{(state.smtpAccounts || []).filter((a) => a.enabled).length} active</strong></div>
                          <div className="engine-row"><span className="dim">HOURS</span><strong>{settings.sendDays?.length ? `${settings.sendDays.length}d/wk` : 'every day'} {String(Math.floor((settings.sendFromMin ?? 480) / 60)).padStart(2, '0')}:{String((settings.sendFromMin ?? 480) % 60).padStart(2, '0')}–{String(Math.floor((settings.sendToMin ?? 1200) / 60)).padStart(2, '0')}:{String((settings.sendToMin ?? 1200) % 60).padStart(2, '0')}</strong></div>
                          <div className="engine-row"><span className="dim">CAPS</span><strong>{settings.maxPerHour}/h · {settings.maxPerDay}/d{settings.warmupEnabled ? ' · warmup' : ''}</strong></div>
                          <div className="engine-row"><span className="dim">DKIM</span><strong>{settings.dkimEnabled ? (settings.dkimConfigured ? 'ON' : 'KEY MISSING') : 'OFF'}</strong></div>
                          <div className="engine-row"><span className="dim">TRACKING</span><strong>{settings.trackOpens ? 'opens' : ''}{settings.trackOpens && settings.trackClicks ? ' + ' : ''}{settings.trackClicks ? 'clicks' : ''}{!settings.trackOpens && !settings.trackClicks ? 'OFF' : ''}</strong></div>
                        </div>
                      </div>

                      <div className="pane">
                        <div className="pane-head"><span>QUICK ACTIONS</span></div>
                        <div className="btn-row" style={{ flexWrap: 'wrap' }}>
                          <button className="btn-sm" onClick={() => setTab('compose')}>[ NEW LETTER ]</button>
                          <button className="btn-sm" onClick={() => setTab('recipients')}>[ IMPORT LIST ]</button>
                          <button className="btn-sm" onClick={() => setTab('send')}>[ SEND / HISTORY ]</button>
                          <button className="btn-sm" onClick={() => setTab('smtp')}>[ EMAIL SETUP ]</button>
                        </div>
                      </div>

                      <div className="pane">
                        <div className="pane-head"><span>RECENT BOUNCES</span></div>
                        {(state.bounces || []).slice(0, 5).map((b) => (
                          <div key={b.id} className="dash-bounce">
                            <span className="red-txt">{b.email}</span>
                            <span className="dim">{b.reason}</span>
                          </div>
                        ))}
                        {!(state.bounces || []).length && <p className="dim-txt">No bounces recorded.</p>}
                      </div>
                    </div>
                  </div>
                  <div className="pane">
                    <div className="pane-head"><span>LIVE CONSOLE</span><span className="dim">streaming sends · opens · clicks · bounces</span></div>
                    <LiveConsole events={state.events} />
                  </div>
                </div>
              )}

              {/* ══ SEND ══ */}
              {tab === 'send' && (
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  <div className="kpi-row">
                    {[
                      ['TOTAL SENT', totals.sent, 'var(--green)'],
                      ['FAILED', totals.failed, 'var(--red)'],
                      ['IN QUEUE', totals.queued, 'var(--yellow)'],
                      ['RECIPIENTS', state.confirmed, 'var(--cyan)'],
                      ['MODE', sendMode.toUpperCase(), 'var(--txt)'],
                    ].map(([lbl, val, color]) => (
                      <div key={lbl} className="kpi-card">
                        <div className="kpi-val" style={{ color }}>{val}</div>
                        <div className="kpi-lbl">{lbl}</div>
                      </div>
                    ))}
                  </div>
                  <div className="pane send-pane">
                    <div>
                      <div className="pane-head"><span>SEND NOW</span></div>
                      <p className="dim-txt">Mode: <strong className="green-txt">{sendMode.toUpperCase()}</strong> — {state.confirmed} active recipients</p>
                      <p className="dim-txt">Window: <strong>{settings.scheduleEnabled === false ? '24/7 — always on' : `${(settings.sendDays || []).length ? (settings.sendDays || []).map((d) => DAY_LABELS[d] || d).join('/') : 'daily'} ${fmtMin(settings.sendFromMin)}–${fmtMin(settings.sendToMin)} ${settings.timezone || 'UTC'}`}</strong>{' '}
                        {settings.scheduleEnabled === false
                          ? <button className="btn-xs" onClick={() => setTab('settings')}>[ SET WINDOW ]</button>
                          : <button className="btn-xs" disabled={busy} onClick={() => run(async () => {
                              const next = { ...settings, scheduleEnabled: false };
                              await api(token, '/api/settings', { method: 'PUT', body: next });
                              setSettings(next); showNotice('Send window OFF — queue sends 24/7.'); await refresh();
                            })}>[ 24/7 ]</button>}
                      </p>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <input className="w-input" style={{ maxWidth: 220 }} type="email" placeholder="test to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                      <button className="btn-sm" disabled={busy || !testTo.includes('@')} onClick={() => run(async () => {
                        const r = await api(token, '/api/test-send', { method: 'POST', body: { to: testTo, subject: draft.subject, html: draft.html, text: draft.text, attachments: draft.attachments } });
                        showNotice(`Test sent (${r.messageId || 'ok'}) — check ${testTo}.`); setTestTo('');
                      })}>[ SEND TEST ]</button>
                      <button className="btn-primary btn-send" disabled={busy || !state.confirmed || !canQueue} onClick={() => queue(false)}>[ SEND NOW ]</button>
                    </div>
                  </div>

                  <div className="pane">
                    <div className="pane-head"><span>LIVE CONSOLE</span><span className="dim">streaming sends · opens · clicks · bounces</span></div>
                    <LiveConsole events={state.events} />
                  </div>

                  <div className="pane">
                    <div className="pane-head"><span>CAMPAIGN HISTORY</span></div>
                    <div className="tbl-wrap">
                      <table className="w-table">
                        <thead><tr><th>#</th><th>NAME</th><th>STATUS</th><th>TOTAL</th><th>SENT</th><th>FAIL</th><th>QUEUE</th><th>ACTION</th></tr></thead>
                        <tbody>
                          {state.campaigns.map((c) => (
                            <tr key={c.id}>
                              <td className="dim">{c.id}</td>
                              <td>{c.name}{c.providers?.length > 0 && <div className="dim-txt" style={{fontSize:11}}>→ {c.providers.join(', ')}</div>}</td>
                              <td>
                                <span className={`badge ${c.status === 'completed' ? 'badge-ok' : c.status === 'failed' ? 'badge-fail' : 'badge-def'}`}>{c.paused ? 'PAUSED' : c.status.toUpperCase()}</span>
                                {c.total > 0 && (
                                  <div className="prog-bar"><div className="prog-fill" style={{ width: `${Math.round(((c.sent + c.failed) / c.total) * 100)}%` }} /></div>
                                )}
                                {c.hold && <div className="dim-txt" style={{fontSize:11,marginTop:4}}>{c.hold}</div>}
                              </td>
                              <td>{c.total}</td>
                              <td className="green-txt">{c.sent}</td>
                              <td className="red-txt">{c.failed}</td>
                              <td className="yellow-txt">{c.queued}</td>
                              <td>
                                <div className="act-row">
                                  <button className="btn-xs" onClick={() => run(async () => { const r = await api(token, `/api/campaigns/${c.id}/duplicate`, { method: 'POST' }); showNotice(`Draft #${r.id} created.`); await refresh(); })}>DUP</button>
                                  {['draft', 'failed', 'scheduled'].includes(c.status) && <button className="btn-xs" onClick={() => editCampaign(c)}>EDIT</button>}
                                  {c.status === 'failed' && <button className="btn-xs" onClick={async () => { if (await uiConfirm(`Retry #${c.id}? SMTP will be re-verified first.`, { title: 'RETRY CAMPAIGN', confirmLabel: 'RETRY' })) run(async () => { await api(token, `/api/campaigns/${c.id}/retry`, { method: 'POST' }); await refresh(); }); }}>RETRY</button>}
                                  {!['queued', 'scheduled', 'sending'].includes(c.status) && <button className="btn-xs" onClick={async () => { if (await uiConfirm(`Delete campaign #${c.id} "${c.name}" and its delivery history?`, { title: 'DELETE CAMPAIGN', danger: true, confirmLabel: 'DELETE' })) run(async () => { await api(token, `/api/campaigns/${c.id}`, { method: 'DELETE' }); await refresh(); }); }}>DEL</button>}
                                  {['queued','scheduled','sending'].includes(c.status) && (c.paused
                                    ? <button className="btn-xs" onClick={() => run(async () => { await api(token, `/api/campaigns/${c.id}/resume`, { method: 'POST' }); await refresh(); })}>RESUME</button>
                                    : <button className="btn-xs" onClick={() => run(async () => { await api(token, `/api/campaigns/${c.id}/pause`, { method: 'POST' }); await refresh(); })}>PAUSE</button>)}
                                  {['queued','scheduled','sending'].includes(c.status) && <button className="btn-xs btn-danger" onClick={async () => { if (await uiConfirm(`Cancel #${c.id}?`, { title: 'CANCEL CAMPAIGN', danger: true, confirmLabel: 'CANCEL SEND' })) run(async () => { await api(token, `/api/campaigns/${c.id}/cancel`, { method: 'POST' }); await refresh(); }); }}>CANCEL</button>}
                                  <button className="btn-xs" onClick={() => run(() => exportCampaign(c.id))}>CSV</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {/* ── GETTING STARTED WALKTHROUGH ── */}
      {showIntro && (
        <div className="intro-overlay">
          <div className="intro-card">
            <div className="intro-brand">RBC SENDER</div>
            <div className="intro-step">{introStep + 1} / {INTRO_STEPS.length}</div>
            <h2 className="intro-title">{INTRO_STEPS[introStep].title}</h2>
            <p className="intro-desc">{INTRO_STEPS[introStep].desc}</p>
            <div className="intro-actions">
              {introStep > 0 && <button className="btn-sm" onClick={() => setIntroStep(introStep - 1)}>[ BACK ]</button>}
              {introStep < INTRO_STEPS.length - 1
                ? <button className="btn-primary" onClick={() => setIntroStep(introStep + 1)}>[ NEXT ]</button>
                : <button className="btn-primary" onClick={() => { setShowIntro(false); localStorage.setItem('rbc_intro_seen', '1'); setTab('dashboard'); }}>[ OPEN DASHBOARD ]</button>}
            </div>
            <button className="intro-skip" onClick={() => { setShowIntro(false); localStorage.setItem('rbc_intro_seen', '1'); }}>skip walkthrough</button>
          </div>
        </div>
      )}

      {/* ── APP DIALOG ── */}
      {dialog && (
        <div className="dlg-overlay" onClick={() => settleDialog(false)}>
          <div className="dlg-card" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-title">{dialog.title}</div>
            <div className="dlg-msg">{dialog.message}</div>
            {dialog.kind === 'prompt' && (
              <input
                className="w-input dlg-input"
                autoFocus
                placeholder={dialog.placeholder}
                value={dialog.value}
                onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && dialog.value.trim()) settleDialog(true); if (e.key === 'Escape') settleDialog(false); }}
              />
            )}
            <div className="dlg-actions">
              <button className="btn-sm" onClick={() => settleDialog(false)}>CANCEL</button>
              <button
                className={`btn-primary ${dialog.danger ? 'btn-danger-solid' : ''}`}
                onClick={() => settleDialog(dialog.kind === 'prompt' ? dialog.value.trim() !== '' : true)}
              >{dialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPDATE AVAILABLE MODAL ── */}
      {updateInfo && !updating && (
        <div className="dlg-overlay">
          <div className="dlg-card" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-title" style={{ color: 'var(--yellow)' }}>UPDATE AVAILABLE</div>
            <div className="dlg-msg">
              A new version is available on GitHub.<br /><br />
              <span className="dim">LOCAL &nbsp;</span><code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{updateInfo.local?.slice(0, 7) || '—'}</code><br />
              <span className="dim">REMOTE </span><code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{updateInfo.remote?.slice(0, 7) || '—'}</code><br /><br />
              Click <strong>[ YES ]</strong> to run <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>git pull → npm install → npm run build</code> and restart the server automatically.
            </div>
            <div className="dlg-actions">
              <button className="btn-sm" onClick={() => setUpdateInfo(null)}>LATER</button>
              <button className="btn-primary" onClick={applyUpdate}>[ YES — UPDATE ]</button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPDATING OVERLAY ── */}
      {updating && (
        <div className="dlg-overlay">
          <div className="dlg-card">
            <div className="dlg-title" style={{ color: 'var(--cyan)' }}>UPDATING...</div>
            <div className="dlg-msg">
              Running <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>git pull → npm install → npm run build</code>.<br /><br />
              The server will restart automatically when done.<br />
              <strong>Refresh this page in ~30 seconds.</strong>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
