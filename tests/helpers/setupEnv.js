// Required at the top of any test file that (directly or via something it
// imports) touches src/crypto.js, src/tokenStore.js, or server.js — all of
// which read process.env at module-load time. Each test file runs in its
// own process under `node --test`, so setting these here doesn't leak
// between files.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.MHC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mhc-test-'));
process.env.ADMIN_API_KEYS = 'test-admin-key';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';

module.exports = {}; // side-effect-only module
