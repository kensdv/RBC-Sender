import net from 'node:net';
import tls from 'node:tls';

// Staged SMTP relay diagnostic — walks the real protocol so a rejection shows
// the exact stage (connect / EHLO / STARTTLS / AUTH / MAIL / RCPT) instead of
// one opaque nodemailer error.

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

class SmtpSession {
  constructor({ host, port, ehlo, timeoutMs = 20000 }) {
    this.host = host;
    this.port = port;
    this.ehlo = ehlo;
    this.timeoutMs = timeoutMs;
    this.buf = '';
    this.socket = null;
  }

  connect(useTls) {
    return new Promise((resolve, reject) => {
      const opts = { host: this.host, port: this.port, servername: this.host, rejectUnauthorized: false, minVersion: 'TLSv1.2' };
      this.socket = useTls ? tls.connect(opts) : net.connect({ host: this.host, port: this.port });
      this.socket.setTimeout(this.timeoutMs);
      const onErr = (e) => reject(e);
      this.socket.once('error', onErr);
      this.socket.once(useTls ? 'secureConnect' : 'connect', () => {
        this.socket.off('error', onErr);
        this.socket.on('error', () => {});
        resolve();
      });
    });
  }

  upgradeTls() {
    return new Promise((resolve, reject) => {
      const raw = this.socket;
      raw.removeAllListeners('data');
      raw.write('STARTTLS\r\n');
      this.readReply().then(({ code }) => {
        if (code !== 220) return reject(new Error(`STARTTLS refused: ${code}`));
        const secure = tls.connect({ socket: raw, servername: this.host, rejectUnauthorized: false, minVersion: 'TLSv1.2' });
        secure.setTimeout(this.timeoutMs);
        secure.once('secureConnect', () => { this.socket = secure; secure.on('error', () => {}); resolve(); });
        secure.once('error', reject);
      }).catch(reject);
    });
  }

  readReply() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('reply timeout')), this.timeoutMs);
      const onData = (chunk) => {
        this.buf += chunk.toString('utf8');
        // reply complete when a "NNN " (space) status line appears —
        // multiline replies continue on "NNN-" lines
        const done = /\r\n\d{3} /.test(this.buf) || /^\d{3} /.test(this.buf);
        if (!done) return;
        clearTimeout(timer);
        this.socket.off('data', onData);
        const code = Number(this.buf.match(/\d{3}/)[0]);
        const text = this.buf.trim();
        this.buf = '';
        resolve({ code, text });
      };
      this.socket.on('data', onData);
      this.socket.once('error', (e) => { clearTimeout(timer); this.socket.off('data', onData); reject(e); });
    });
  }

  async command(line) {
    this.socket.write(line + '\r\n');
    return this.readReply();
  }
}

export async function diagnoseRelay({ host, port = 587, security = 0, username = '', password = '', ehlo = '', from = '', testTo = '', timeoutMs = 20000 }) {
  const stages = [];
  const stage = (name, ok, detail = '') => { stages.push({ name, ok, detail }); return ok; };
  const ehloName = ehlo || (from.includes('@') ? from.split('@')[1] : host);
  const implicitTls = security === 1;
  const plain = security === 2;

  const s = new SmtpSession({ host, port, ehlo: ehloName, timeoutMs });
  try {
    // 1. TCP connect (+ implicit TLS for security=1)
    try {
      await s.connect(implicitTls);
      stage('TCP connect', true, `${host}:${port}${implicitTls ? ' (TLS)' : ''}`);
    } catch (e) {
      stage('TCP connect', false, e.message || String(e));
      return { stages, ok: false };
    }

    // 2. greeting banner 220 — readReply expects us to have sent nothing; greeting arrives unsolicited.
    //    SmtpSession.readReply works for unsolicited data too.
    try {
      const greet = await s.readReply();
      stage('Greeting', greet.code === 220, `${greet.code} ${greet.text.split('\n').pop().slice(0, 120)}`);
      if (greet.code !== 220) return { stages, ok: false };
    } catch (e) {
      stage('Greeting', false, e.message || String(e));
      return { stages, ok: false };
    }

    // 3. EHLO
    try {
      const r = await s.command(`EHLO ${ehloName}`);
      const caps = r.text.split('\r\n').slice(1).map((l) => l.trim()).filter(Boolean);
      stage('EHLO', r.code === 250, `${r.code} ${ehloName}${caps.length ? ` · offers: ${caps.slice(0, 6).join(', ')}` : ''}`);
      if (r.code !== 250) return { stages, ok: false };
    } catch (e) {
      stage('EHLO', false, e.message || String(e));
      return { stages, ok: false };
    }

    // 4. STARTTLS (skip for implicit TLS / plain)
    if (!implicitTls && !plain) {
      try {
        await s.upgradeTls();
        const r = await s.command(`EHLO ${ehloName}`);
        stage('STARTTLS', r.code === 250, `encrypted · re-EHLO ${r.code}`);
        if (r.code !== 250) return { stages, ok: false };
      } catch (e) {
        stage('STARTTLS', false, e.message || String(e));
        return { stages, ok: false };
      }
    } else {
      stage('STARTTLS', true, implicitTls ? 'implicit TLS' : 'plain (disabled)');
    }

    // 5. AUTH LOGIN (only when username provided)
    if (username) {
      try {
        let r = await s.command('AUTH LOGIN');
        if (r.code === 334) {
          r = await s.command(b64(username));
          if (r.code === 334) r = await s.command(b64(password || ''));
        }
        stage('AUTH', r.code === 235, `${r.code} ${r.text.split('\n').pop().slice(0, 120)}`);
        if (r.code !== 235) return { stages, ok: false };
      } catch (e) {
        stage('AUTH', false, e.message || String(e));
        return { stages, ok: false };
      }
    } else {
      stage('AUTH', true, 'skipped — IP allowlist');
    }

    // 6. MAIL FROM / RCPT TO — only when a test recipient is given
    if (testTo) {
      const sender = from || `noreply@${ehloName}`;
      try {
        let r = await s.command(`MAIL FROM:<${sender}>`);
        stage('MAIL FROM', r.code === 250, `${r.code} ${sender}`);
        if (r.code !== 250) return { stages, ok: false };
        r = await s.command(`RCPT TO:<${testTo}>`);
        stage('RCPT TO', r.code === 250 || r.code === 251, `${r.code} ${testTo}`);
        if (r.code !== 250 && r.code !== 251) return { stages, ok: false };
        await s.command('RSET').catch(() => {});
        stage('Envelope', true, 'sender + recipient accepted — relay will take mail');
      } catch (e) {
        stage('Envelope', false, e.message || String(e));
        return { stages, ok: false };
      }
    }

    return { stages, ok: true };
  } catch (e) {
    stage('Session', false, e.message || String(e));
    return { stages, ok: false };
  } finally {
    try { s.socket?.write('QUIT\r\n'); } catch {}
    try { s.socket?.destroy(); } catch {}
  }
}
