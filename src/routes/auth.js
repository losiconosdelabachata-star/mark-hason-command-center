// OAuth start/callback routes, generic across every platform in
// src/platforms/*.js.
//
// /auth/:platform/start    — requires the admin API key; redirects the
//                             browser to the platform's consent screen.
// /auth/:platform/callback — hit by the platform itself after consent, so it
//                             can't carry our custom x-api-key header. It's
//                             protected instead by the one-time `state` token
//                             minted in /start (standard OAuth CSRF defense).
'use strict';

const express = require('express');
const crypto = require('crypto');
const platforms = require('../platforms');
const oauth = require('../oauthClient');
const tokenStore = require('../tokenStore');
const requireApiKey = require('../middleware/requireApiKey');

const router = express.Router();

// In-memory pending-authorization map: state -> { platformId, pkceVerifier, expiresAt }.
// A restart mid-flow just means the user retries /start — no persistence needed.
const pending = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function sweepExpired() {
  const now = Date.now();
  for (const [state, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(state);
  }
}

router.get('/:platform/start', requireApiKey, (req, res) => {
  const platform = platforms.get(req.params.platform);
  if (!platform) return res.status(404).json({ error: `Unknown platform: ${req.params.platform}` });
  if (!platform.isConfigured()) {
    return res.status(400).json({
      error: `${platform.name} has no client id/secret configured — set the env vars in .env.example first.`,
    });
  }

  sweepExpired();
  const state = crypto.randomBytes(16).toString('hex');
  const pkce = platform.usePKCE ? oauth.makePkcePair() : null;
  pending.set(state, {
    platformId: platform.id,
    pkceVerifier: pkce?.verifier,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const url = oauth.buildAuthUrl(platform, state, pkce?.verifier);
  res.redirect(url);
});

router.get('/:platform/callback', async (req, res) => {
  const platform = platforms.get(req.params.platform);
  if (!platform) return res.status(404).send(`Unknown platform: ${req.params.platform}`);

  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.status(400).send(`${platform.name} authorization was denied: ${error_description(error, errorDescription)}`);
  }

  sweepExpired();
  const entry = state && pending.get(state);
  if (!entry || entry.platformId !== platform.id) {
    return res.status(400).send('Invalid or expired authorization state. Start the connection again from /auth/:platform/start.');
  }
  pending.delete(state); // one-time use

  try {
    const tokens = await oauth.exchangeCode(platform, code, entry.pkceVerifier);
    tokenStore.set(platform.id, tokens);
    res.send(
      `<h1>${platform.name} connected</h1><p>You can close this tab. The Command Center now has access.</p>`
    );
  } catch (err) {
    console.error(`[auth/${platform.id}] token exchange failed:`, err.message);
    res.status(502).send(`Failed to connect ${platform.name}: ${err.message}`);
  }
});

router.post('/:platform/disconnect', requireApiKey, (req, res) => {
  const platform = platforms.get(req.params.platform);
  if (!platform) return res.status(404).json({ error: `Unknown platform: ${req.params.platform}` });
  tokenStore.remove(platform.id);
  res.json({ ok: true, platform: platform.id, connected: false });
});

function error_description(err, desc) {
  return desc ? `${err} — ${desc}` : err;
}

module.exports = router;
