// OAuth start/callback routes, generic across every platform in
// src/platforms/*.js.
//
// /auth/:platform/start         — requires the admin API key (header);
//                                  redirects the browser to the platform's
//                                  consent screen. Handy for curl/manual use,
//                                  but a browser "Connect" button can't send
//                                  a custom header on a plain navigation.
// /auth/:platform/authorize-url — same auth requirement, called via fetch()
//                                  from the dashboard instead. Returns the
//                                  consent-screen URL as JSON; the page then
//                                  navigates itself there. This is how the
//                                  admin key stays in a header instead of a
//                                  URL query string — a query string would
//                                  land in browser history and, worse, get
//                                  sent to Facebook/Google in the Referer
//                                  header on the redirect.
// /auth/:platform/callback      — hit by the platform itself after consent,
//                                  so it can't carry our x-api-key header
//                                  either. Protected instead by the one-time
//                                  `state` token minted above (standard
//                                  OAuth CSRF defense).
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

/** @returns {{ok: true, url: string} | {ok: false, status: number, error: string}} */
function beginAuth(platformId) {
  const platform = platforms.get(platformId);
  if (!platform) return { ok: false, status: 404, error: `Unknown platform: ${platformId}` };
  if (!platform.isConfigured()) {
    return {
      ok: false,
      status: 400,
      error: `${platform.name} has no client id/secret configured — set the env vars in .env.example first.`,
    };
  }

  sweepExpired();
  const state = crypto.randomBytes(16).toString('hex');
  const pkce = platform.usePKCE ? oauth.makePkcePair() : null;
  pending.set(state, {
    platformId: platform.id,
    pkceVerifier: pkce?.verifier,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  return { ok: true, url: oauth.buildAuthUrl(platform, state, pkce?.verifier) };
}

router.get('/:platform/start', requireApiKey, (req, res) => {
  const result = beginAuth(req.params.platform);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  // Defense in depth: even though the key is a header here (not in this
  // URL), don't leak this URL itself to the OAuth provider via Referer.
  res.set('Referrer-Policy', 'no-referrer');
  res.redirect(result.url);
});

// JSON variant for the dashboard: fetch() this with the x-api-key header,
// then set window.location.href to the returned url yourself.
router.get('/:platform/authorize-url', requireApiKey, (req, res) => {
  const result = beginAuth(req.params.platform);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ url: result.url });
});

// Minimal, dependency-free HTML wrapper so the callback page looks like part
// of the same product instead of a raw error dump. FRONTEND_URL is optional —
// if unset, the page just doesn't offer a "back to dashboard" link.
function callbackPage(title, bodyHtml) {
  const dashboardLink = process.env.FRONTEND_URL
    ? `<p><a href="${process.env.FRONTEND_URL}">← Back to the Command Center</a></p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;color:#1a1a1a}
a{color:#2563eb}</style></head><body>${bodyHtml}${dashboardLink}</body></html>`;
}

router.get('/:platform/callback', async (req, res) => {
  const platform = platforms.get(req.params.platform);
  if (!platform) return res.status(404).send(callbackPage('Unknown platform', `<h1>Unknown platform: ${req.params.platform}</h1>`));

  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res
      .status(400)
      .send(callbackPage('Authorization denied', `<h1>${platform.name} authorization was denied</h1><p>${error_description(error, errorDescription)}</p>`));
  }

  sweepExpired();
  const entry = state && pending.get(state);
  if (!entry || entry.platformId !== platform.id) {
    return res
      .status(400)
      .send(callbackPage('Expired', '<h1>Invalid or expired authorization link</h1><p>Start the connection again from the dashboard.</p>'));
  }
  pending.delete(state); // one-time use

  try {
    const tokens = await oauth.exchangeCode(platform, code, entry.pkceVerifier);
    tokenStore.set(platform.id, tokens);
    res.send(callbackPage(`${platform.name} connected`, `<h1>${platform.name} connected ✓</h1><p>You can close this tab.</p>`));
  } catch (err) {
    console.error(`[auth/${platform.id}] token exchange failed:`, err.message);
    res
      .status(502)
      .send(callbackPage('Connection failed', `<h1>Failed to connect ${platform.name}</h1><p>${err.message}</p>`));
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
