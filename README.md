# RBC Sender

A self-hosted email sending platform. Fastify + SQLite backend, React dashboard, bulk campaigns with scheduling, throttling, warmup, tracking, and multiple delivery engines.

## Features

- **Compose** — HTML / paste / block editor / plain-text bodies, 25 built-in letter templates, full placeholder system (`++rbc_*++`, `[Firstname]`, `[AbmeldeLink]`, …), attachments (eml/docx/pdf/ics auto-generated from the letter), live desktop/mobile preview
- **Recipients** — CSV import with column mapping, consent confirmation, suppression list, per-recipient custom fields
- **Engines** — authenticated SMTP, direct MX (port 25), open relay, SOCKS/HTTP proxy, Microsoft Graph API, Gmail API with one-click OAuth connect
- **SMTP pool** — multiple accounts with round-robin rotation, per-account rate limits, cooldowns and failover
- **Sending rules** — day/time schedule windows in your timezone, rolling hourly/daily caps, warmup ramp
- **Deliverability tooling** — open pixel + click tracking, link cloaking (google.com or your own redirect base), preheader injection, HTML randomization, spam-word bypass, base64 subject/from-name encoding, custom headers, DKIM signing, List-Unsubscribe headers
- **Dashboard** — KPIs, campaign progress, engine status, recent bounces

## Requirements

- Node.js 20+
- npm

## Setup

```bash
git clone https://github.com/<you>/rbc-sender.git
cd rbc-sender
npm install
```

### 1. Environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Purpose |
|---|---|
| `PORT` / `HOST` | Server bind (default `3000` / `127.0.0.1`) |
| `DASHBOARD_TOKEN` | Bearer token for the API/UI login — **set a long random value** |
| `CREDENTIAL_KEY` | Encryption key for stored secrets (SMTP passwords, OAuth tokens, DKIM keys). **Set a long random value and keep it safe — changing it makes stored secrets unreadable** |
| `WEBHOOK_TOKEN` | Token for the inbound bounce webhook |
| `DATABASE_PATH` | SQLite file location (default `./data/mailer.db`) |
| `PUBLIC_BASE_URL` | Public URL of this server — **required for tracking pixels/links to work for real recipients** |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Build the client

```bash
npm run build
```

### 3. Run

```bash
npm start          # production
npm run dev        # server with reload (if configured)
npm test           # unit tests
```

Open `http://127.0.0.1:3000` and log in with your `DASHBOARD_TOKEN`.

## Send modes — setup per engine

Pick one in **SETTINGS → SEND TYPE**. Each has different requirements.

### SMTP AUTH (most common)

Authenticated submission through a mailbox provider. You need: host, port, security mode, username, password, and a from-address the provider allows.

| Provider | Host | Port | Security | Notes |
|---|---|---|---|---|
| Gmail | `smtp.gmail.com` | 587 | STARTTLS | needs an **App Password** (Google Account → Security → 2-Step Verification → App passwords). plain account password fails with 535 |
| Outlook / M365 | `smtp.office365.com` | 587 | STARTTLS | needs SMTP AUTH enabled on the mailbox (M365 admin → Users → mailbox → Mail → Manage email apps). legacy auth tenants fail 535 |
| Yahoo | `smtp.mail.yahoo.com` | 465 | SSL | needs an app password |
| iCloud | `smtp.mail.me.com` | 587 | STARTTLS | needs app-specific password |
| Zoho | `smtp.zoho.com` | 587 | STARTTLS | SMTP must be enabled in mail settings |
| cPanel/hosting | `mail.yourdomain.com` | 587 or 465 | STARTTLS/SSL | the mailbox created in cPanel → Email Accounts |
| SendGrid | `smtp.sendgrid.net` | 587 | STARTTLS | user = `apikey`, pass = API key |
| Mailgun | `smtp.mailgun.org` | 587 | STARTTLS | user = `postmaster@mg.yourdomain` |
| AWS SES | `email-smtp.<region>.amazonaws.com` | 587 | STARTTLS | SMTP credentials from SES console (NOT your AWS key) |
| Brevo/SMTP2GO/Postmark/etc | see QUICK GUIDES in the EMAIL tab | | | presets prefill host/port/security |

**Test order that saves time:** `[ TEST ]` verifies the socket+login only. `[ SEND TEST ]` fires a real message through the whole engine — if TEST passes but SEND TEST fails, the problem is downstream (relay rules, from-address policy), not credentials.

Common failures: `535` = wrong user/pass or provider blocks SMTP auth · `EAUTH` = same · `connection timeout` = wrong host/port or provider firewall · `self signed certificate` = wrong security mode for the port.

### DIRECT MX

Sends straight to each recipient's MX on port 25 — no SMTP account needed, but **your server's outbound port 25 must be open** (many VPS/cloud providers block it by default — request removal or use a provider that allows it). You must set a from-address; SPF/DKIM/DMARC on your domain are mandatory or everything lands in spam. The sidebar shows a live `PORT 25` check — if it says BLOCKED, this mode won't work.

### RELAY / PROXY

Unauthenticated relay through a server you control (e.g. your own Postfix). Set RELAY HOST + PORT, FROM EMAIL. Your relay must accept mail from this server's IP — that's what the sidebar **IP** (click to copy) is for: whitelist it in Postfix `mynetworks` or your provider's relay ACL.

**Postfix on Linux (dnf-based):**

```bash
sudo dnf install -y postfix
sudo systemctl enable --now postfix
```

`/etc/postfix/main.cf`:

```
myhostname = mail.yourdomain.com
mydestination = $myhostname, localhost.$mydomain, localhost
mynetworks = 127.0.0.0/8 <RBC-SENDER-IP>/32
inet_interfaces = all
```

`/etc/postfix/master.cf` — uncomment the `-o smtpd_relay_restrictions` line in the `smtp inet` block so it accepts relay from `mynetworks`. Then:

```bash
sudo systemctl restart postfix
# test from the sender machine
swaks --to you@gmail.com --from you@yourdomain.com --server <RDP-IP>
```

If Postfix only accepts authenticated relay, this app's RELAY mode won't work — use SMTP AUTH mode pointed at the same Postfix instead (add SASL per the guide in the app's EMAIL tab).

### PROXY

Same as DIRECT MX but tunnels through an HTTP/SOCKS4/SOCKS5 proxy — set `socks5://user:pass@host:port` in PROXY field. Only helps if your IP is blocked, not if port 25 is blocked upstream.

### GMAIL API

Sends through Gmail's API as yourself — no app password, no SMTP. One-time Google Cloud setup:

1. console.cloud.google.com → new project → enable **Gmail API**
2. OAuth consent screen → External → add yourself as test user
3. Credentials → Create OAuth client ID → **Web application**
4. Authorized redirect URIs → `https://your-domain/api/engine/gmail/callback`
5. Paste CLIENT ID + CLIENT SECRET in SETTINGS → send mode GMAIL API → SAVE → **CONNECT GOOGLE ACCOUNT**

### GRAPH API (Microsoft 365 / Outlook)

Azure portal → App registrations → new registration → API permissions → Microsoft Graph → **Mail.Send** (Application) → Grant admin consent. Copy Tenant ID + Client ID + Client Secret into SETTINGS → GRAPH API. Send-as must be a real mailbox UPN in that tenant.

## First campaign walkthrough

1. **EMAIL tab** — pick a send mode. For SMTP: use a quick guide preset (Gmail app password, M365, hosting provider) or fill host/port/user/pass manually, then `[ TEST ]` to verify and `[ SEND TEST ]` to fire a real message.
2. **MAIL LIST tab** — import any list: CSV with an `email` column, or a plain txt of addresses (one per line / comma / colon separated — auto-detected). Optional columns: `first_name`, `last_name`, `company`. Tick the consent box and confirm.
3. **LETTER tab** — pick a template or write your own. Placeholders resolve per recipient. Set subject + preheader, choose body mode, attach files if needed. The right pane previews live.
4. **SETTINGS tab** — sender identity, tracking toggles, link cloak base, anti-fingerprint options, sending hours/limits/warmup.
5. **SEND tab** — queue the campaign, watch progress on DASHBOARD. Schedule windows and caps are enforced server-side.

## OAuth engines

- **Gmail API** — Google Cloud → enable Gmail API → OAuth consent screen → Web OAuth client → add redirect URI `http://127.0.0.1:3000/api/engine/gmail/callback` (or `PUBLIC_BASE_URL` equivalent) → paste client ID/secret in SETTINGS → CONNECT GOOGLE ACCOUNT.
- **Graph API** — Azure app registration with `Mail.Send` application permission + admin consent; tenant ID, client ID/secret in SETTINGS.

## Deployment

The app is a **stateful Node server** (Fastify + SQLite + a background send queue). It cannot run on static hosts.

- **GitHub Pages / Vercel static** — not suitable: the UI calls `/api/*` which requires the Node backend.
- **Recommended**: any Node host — Railway, Render, Fly.io, a VPS, or a Windows service via `nssm`/`pm2`.
- Set `HOST=0.0.0.0` and `PUBLIC_BASE_URL=https://your-domain` on the host, put it behind HTTPS (Caddy/nginx/Cloudflare), and point `DATABASE_PATH` at a persistent volume.

```bash
# example: pm2 on a VPS
npm install -g pm2
pm2 start server/index.js --name rbc-sender
pm2 save
```

## Project layout

```
server/    Fastify API, SQLite layer, mailer engines, queue worker, placeholders
client/    React + Vite dashboard (builds to client/dist)
test/      unit tests
data/      SQLite database (gitignored)
```

## Notes

- This tool is intended for sending to recipients who have consented (the consent gate is enforced at import). Comply with CAN-SPAM/GDPR and your mailbox provider's terms.
- `PUBLIC_BASE_URL` unset = tracking links point at localhost and will not work for external recipients.
