'use strict';
require('./helpers/setupEnv');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt } = require('../src/crypto');

test('encrypt/decrypt round-trips an object', () => {
  const original = { accessToken: 'abc123', refreshToken: 'xyz', expiresAt: 1234567890 };
  const encrypted = encrypt(original);
  assert.deepEqual(decrypt(encrypted), original);
});

test('encrypted payload does not contain the plaintext token anywhere', () => {
  const original = { accessToken: 'super-secret-token-value' };
  const encrypted = encrypt(original);
  const serialized = JSON.stringify(encrypted);
  assert.ok(!serialized.includes('super-secret-token-value'));
});

test('two encryptions of the same object produce different ciphertext (random IV)', () => {
  const a = encrypt({ x: 1 });
  const b = encrypt({ x: 1 });
  assert.notEqual(a.data, b.data);
  assert.notEqual(a.iv, b.iv);
});

test('tampering with the ciphertext fails decryption instead of returning garbage', () => {
  const encrypted = encrypt({ x: 1 });
  const tampered = { ...encrypted, data: encrypted.data.slice(0, -2) + (encrypted.data.slice(-2) === '00' ? '11' : '00') };
  assert.throws(() => decrypt(tampered));
});

test('tampering with the auth tag fails decryption', () => {
  const encrypted = encrypt({ x: 1 });
  const tampered = { ...encrypted, authTag: '0'.repeat(32) };
  assert.throws(() => decrypt(tampered));
});
