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

## First campaign walkthrough

1. **EMAIL tab** — pick a send mode. For SMTP: use a quick guide preset (Gmail app password, M365, hosting provider) or fill host/port/user/pass manually, then `[ TEST ]` to verify and `[ SEND TEST ]` to fire a real message.
2. **MAIL LIST tab** — import a CSV (`email` column required; `first_name`, `last_name`, `company` optional). Tick the consent box and confirm.
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
