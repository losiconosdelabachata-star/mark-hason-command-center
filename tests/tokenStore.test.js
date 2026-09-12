'use strict';
require('./helpers/setupEnv');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const tokenStore = require('../src/tokenStore');

test('get() returns null for a platform that was never connected', () => {
  assert.equal(tokenStore.get('nonexistent'), null);
});

test('set() then get() round-trips a token record', () => {
  const record = { accessToken: 'abc', refreshToken: 'def', expiresAt: Date.now() + 3600_000 };
  tokenStore.set('testplatform', record);
  assert.deepEqual(tokenStore.get('testplatform'), record);
});

test('listConnected() reflects what has been set/removed', () => {
  tokenStore.set('platform-a', { accessToken: '1' });
  tokenStore.set('platform-b', { accessToken: '2' });
  let connected = tokenStore.listConnected();
  assert.ok(connected.includes('platform-a'));
  assert.ok(connected.includes('platform-b'));

  tokenStore.remove('platform-a');
  connected = tokenStore.listConnected();
  assert.ok(!connected.includes('platform-a'));
  assert.ok(connected.includes('platform-b'));
});

test('remove() on a platform that was never set does not throw', () => {
  assert.doesNotThrow(() => tokenStore.remove('never-existed'));
});

test('the on-disk store file never contains a raw token value', () => {
  const fs = require('fs');
  const path = require('path');
  tokenStore.set('secretcheck', { accessToken: 'plaintext-should-not-appear' });
  const storeFile = path.join(process.env.MHC_DATA_DIR, 'tokens.enc.json');
  const raw = fs.readFileSync(storeFile, 'utf8');
  assert.ok(!raw.includes('plaintext-should-not-appear'));
});
