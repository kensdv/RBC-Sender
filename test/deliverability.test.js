import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeliverability } from '../server/deliverability.js';

function missing() {
  throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
}

function checker(overrides = {}) {
  const txt = {
    'example.com': [['v=spf1 include:_spf.example.com -all']],
    '_dmarc.example.com': [['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com']],
    'rbc._domainkey.example.com': [['v=DKIM1; k=rsa; p=abc123']],
    ...overrides.txt,
  };
  return createDeliverability({
    getNetInfo: overrides.getNetInfo || (async () => ({ publicIp: '203.0.113.10', port25: { open: true } })),
    resolveTxtFn: async (name) => (txt[name] ? txt[name] : missing()),
    reverseFn: overrides.reverseFn || (async () => ['mail.example.com']),
    timeoutMs: 100,
  });
}

test('deliverability reports healthy SPF, DKIM, DMARC, PTR and direct-MX path', async () => {
  const result = await checker().check({
    settings: {
      sendMode: 'direct', dkimEnabled: true, dkimSelector: 'rbc', dkimDomain: 'example.com',
      directFromEmail: 'ops@example.com', publicBaseUrl: 'https://mailer.example.com',
      trackOpens: true, trackClicks: false,
    },
    fromEmail: 'ops@example.com',
  });
  assert.equal(result.domain, 'example.com');
  for (const key of ['spf', 'dkim', 'dmarc', 'ptr', 'port25', 'tracking']) {
    assert.equal(result.checks[key].status, 'pass', `${key}: ${result.checks[key].detail}`);
  }
});

test('deliverability flags missing DMARC, a mismatched PTR and blocked port 25', async () => {
  const result = await checker({
    txt: { '_dmarc.example.com': undefined },
    reverseFn: async () => ['unrelated.example.net'],
    getNetInfo: async () => ({ publicIp: '203.0.113.10', port25: { open: false, reason: 'timeout' } }),
  }).check({
    settings: {
      sendMode: 'direct', dkimEnabled: true, dkimSelector: 'rbc', dkimDomain: 'example.com',
      directFromEmail: 'ops@example.com', publicBaseUrl: 'http://127.0.0.1:3000',
      trackOpens: true,
    },
    fromEmail: 'ops@example.com',
  });
  assert.equal(result.checks.dmarc.status, 'fail');
  assert.equal(result.checks.tracking.status, 'warn');
  assert.equal(result.checks.ptr.status, 'warn');
  assert.equal(result.checks.port25.status, 'fail');
});

test('deliverability skips DNS work when no sending domain is configured', async () => {
  const result = await checker().check({ settings: { sendMode: 'smtp' }, fromEmail: '' });
  assert.equal(result.checks.spf.status, 'unknown');
  assert.match(result.checks.spf.detail, /from address/i);
});
