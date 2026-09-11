// Encrypt/decrypt helpers for at-rest token storage (AES-256-GCM).
//
// Key resolution order:
//   1. process.env.ENCRYPTION_KEY (64 hex chars = 32 bytes) — use this in any
//      real deployment.
//   2. data/.encryption-key on disk — auto-generated on first run for local
//      dev so you don't have to think about it. Gitignored.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const KEY_FILE = path.join(DATA_DIR, '.encryption-key');

function loadOrCreateKey() {
  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, 'hex');
    if (buf.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes hex-encoded (64 hex chars).');
    }
    return buf;
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(KEY_FILE)) {
    return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, generated.toString('hex'), { mode: 0o600 });
  console.warn(
    '[crypto] No ENCRYPTION_KEY set — generated one at data/.encryption-key for local dev.\n' +
    '         Set ENCRYPTION_KEY in your real deployment env instead of relying on this file.'
  );
  return generated;
}

const KEY = loadOrCreateKey();

function encrypt(plainTextObj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(plainTextObj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: ciphertext.toString('hex'),
  };
}

function decrypt(payload) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    KEY,
    Buffer.from(payload.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encrypt, decrypt, DATA_DIR };
