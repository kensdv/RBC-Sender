import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptSecret, deriveSecret, encryptSecret, tokensEqual, unsubscribeToken } from '../server/crypto.js';

const key = randomBytes(32);

test('encrypts and decrypts SMTP credentials with authenticated encryption', () => {
  const encrypted = encryptSecret('secret-password', key);
  assert.notEqual(encrypted, 'secret-password');
  assert.equal(decryptSecret(encrypted, key), 'secret-password');
  const parts = encrypted.split('.');
  parts[3] = parts[3].slice(0, -2) + 'aa';
  assert.throws(() => decryptSecret(parts.join('.'), key));
});

test('derives separate keys and stable unsubscribe tokens', () => {
  assert.notDeepEqual(deriveSecret(key, 'one'), deriveSecret(key, 'two'));
  const secret = deriveSecret(key, 'unsubscribe-tokens');
  assert.equal(unsubscribeToken('USER@EXAMPLE.COM', secret), unsubscribeToken('user@example.com', secret));
  assert.equal(tokensEqual('abc', 'abc'), true);
  assert.equal(tokensEqual('abc', 'abd'), false);
  assert.equal(tokensEqual('', ''), false);
});
