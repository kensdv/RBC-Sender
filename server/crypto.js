import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function deriveSecret(key, purpose) {
  return hkdfSync('sha256', key, 'rbc-mailer-v1', purpose, 32);
}

export function encryptSecret(value, key) {
  if (!value) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(payload, key) {
  if (!payload) return '';
  const [version, iv, tag, encrypted] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Invalid encrypted credential');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function unsubscribeToken(email, secret) {
  return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('base64url');
}

export function tokensEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
