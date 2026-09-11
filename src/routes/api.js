// Status + analytics-summary routes. Everything here requires the admin
// API key — this is Mark's private control surface, not public.
'use strict';

const express = require('express');
const platforms = require('../platforms');
const oauth = require('../oauthClient');
const tokenStore = require('../tokenStore');
const requireApiKey = require('../middleware/requireApiKey');

const router = express.Router();
router.use(requireApiKey);

// A token is refreshed a little before it actually expires to avoid racing
// a request against expiry.
const REFRESH_SKEW_MS = 60 * 1000;

async function getFreshTokens(platform) {
  let tokens = tokenStore.get(platform.id);
  if (!tokens) return null;

  if (tokens.refreshToken && tokens.expiresAt - REFRESH_SKEW_MS < Date.now()) {
    tokens = await oauth.refreshAccessToken(platform, tokens.refreshToken);
    tokenStore.set(platform.id, tokens);
  }
  return tokens;
}

// GET /api/status — connection state for every platform we know about.
router.get('/status', (req, res) => {
  const connected = new Set(tokenStore.listConnected());
  res.json({
    platforms: platforms.all.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      configured: p.isConfigured(),
      connected: connected.has(p.id),
    })),
  });
});

// GET /api/:platform/summary — pulls a basic analytics snapshot.
router.get('/:platform/summary', async (req, res) => {
  const platform = platforms.get(req.params.platform);
  if (!platform) return res.status(404).json({ error: `Unknown platform: ${req.params.platform}` });
  if (!platform.isConfigured()) {
    return res.status(400).json({ error: `${platform.name} is not configured.`, configured: false });
  }

  try {
    const tokens = await getFreshTokens(platform);
    if (!tokens) {
      return res.status(400).json({
        error: `${platform.name} is not connected yet.`,
        connected: false,
        connectUrl: `/auth/${platform.id}/start`,
      });
    }
    const summary = await platform.getSummary(tokens);
    res.json({ platform: platform.id, connected: true, summary });
  } catch (err) {
    console.error(`[api/${platform.id}] summary fetch failed:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /api/summary — every connected platform's summary in one call, for a
// future dashboard to render as one screen. Failures on one platform don't
// take down the others.
router.get('/summary', async (req, res) => {
  const results = await Promise.all(
    platforms.all.map(async (platform) => {
      if (!platform.isConfigured()) return [platform.id, { status: 'not_configured' }];
      const tokens = await getFreshTokens(platform).catch(() => null);
      if (!tokens) return [platform.id, { status: 'not_connected' }];
      try {
        const summary = await platform.getSummary(tokens);
        return [platform.id, { status: 'ok', summary }];
      } catch (err) {
        return [platform.id, { status: 'error', error: err.message }];
      }
    })
  );
  res.json(Object.fromEntries(results));
});

module.exports = router;
