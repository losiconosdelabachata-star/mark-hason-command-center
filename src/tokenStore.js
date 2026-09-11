// Single-file encrypted token store, keyed by platform id.
//
// This is deliberately simple (one JSON file on disk) because this backend
// has exactly one operator (Mark) managing one artist's accounts — not a
// multi-tenant service. If this ever needs to support multiple managers or
// multiple artists, swap this module for a real database and keep the same
// get/set/remove/list interface.
'use strict';

const fs = require('fs');
const path = require('path');
const { encrypt, decrypt, DATA_DIR } = require('./crypto');

const STORE_FILE = path.join(DATA_DIR, 'tokens.enc.json');

function readAll() {
  if (!fs.existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (err) {
    console.error('[tokenStore] Failed to read token store, treating as empty:', err.message);
    return {};
  }
}

function writeAll(all) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
}

/** @returns {object|null} decrypted token record for platformId, or null if never connected */
function get(platformId) {
  const all = readAll();
  const encrypted = all[platformId];
  if (!encrypted) return null;
  try {
    return decrypt(encrypted);
  } catch (err) {
    console.error(`[tokenStore] Failed to decrypt tokens for ${platformId}:`, err.message);
    return null;
  }
}

function set(platformId, tokenRecord) {
  const all = readAll();
  all[platformId] = encrypt(tokenRecord);
  writeAll(all);
}

function remove(platformId) {
  const all = readAll();
  delete all[platformId];
  writeAll(all);
}

/** @returns {string[]} platform ids that currently have stored tokens */
function listConnected() {
  return Object.keys(readAll());
}

module.exports = { get, set, remove, listConnected };
