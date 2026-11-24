import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveSecret } from './crypto.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

function required(name, minimumLength = 1) {
  const value = process.env[name] || '';
  if (value.length < minimumLength) {
    throw new Error(`${name} must contain at least ${minimumLength} characters`);
  }
  return value;
}

export function loadConfig() {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  const publicBaseUrl = new URL(process.env.PUBLIC_BASE_URL || `http://${host}:${port}`);
  if (!['http:', 'https:'].includes(publicBaseUrl.protocol) || publicBaseUrl.username || publicBaseUrl.password) {
    throw new Error('PUBLIC_BASE_URL must be an HTTP(S) URL without embedded credentials');
  }
  const credentialKey = Buffer.from(required('CREDENTIAL_KEY'), 'base64');
  if (credentialKey.length !== 32) {
    throw new Error('CREDENTIAL_KEY must be a base64-encoded 32-byte key');
  }
  const webhookToken = process.env.WEBHOOK_TOKEN || '';
  if (webhookToken && webhookToken.length < 24) throw new Error('WEBHOOK_TOKEN must contain at least 24 characters when configured');
  return {
    host,
    port,
    publicBaseUrl: publicBaseUrl.toString().replace(/\/$/, ''),
    dashboardToken: required('DASHBOARD_TOKEN', 24),
    credentialKey,
    unsubscribeSecret: deriveSecret(credentialKey, 'unsubscribe-tokens'),
    webhookToken: process.env.WEBHOOK_TOKEN || '',
    databasePath: process.env.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(process.env.DATABASE_PATH || './data/mailer.db'),
  };
}
