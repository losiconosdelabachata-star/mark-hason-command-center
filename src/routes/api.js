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

// Shared "load the platform, make sure it's configured and connected, hand
// back fresh tokens" step used by every /:platform/* route below. Sends the
// appropriate error response itself and returns null when it can't proceed.
async function resolveConnected(req, res) {
  const platform = platforms.get(req.params.platform);
  if (!platform) {
    res.status(404).json({ error: `Unknown platform: ${req.params.platform}` });
    return null;
  }
  if (!platform.isConfigured()) {
    res.status(400).json({ error: `${platform.name} is not configured.`, configured: false });
    return null;
  }
  const tokens = await getFreshTokens(platform);
  if (!tokens) {
    res.status(400).json({
      error: `${platform.name} is not connected yet.`,
      connected: false,
      connectUrl: `/auth/${platform.id}/start`,
    });
    return null;
  }
  return { platform, tokens };
}

// GET /api/:platform/summary — pulls a basic analytics snapshot.
router.get('/:platform/summary', async (req, res) => {
  const ctx = await resolveConnected(req, res);
  if (!ctx) return;
  try {
    const summary = await ctx.platform.getSummary(ctx.tokens);
    res.json({ platform: ctx.platform.id, connected: true, summary });
  } catch (err) {
    console.error(`[api/${ctx.platform.id}] summary fetch failed:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /api/:platform/campaigns — list existing campaigns.
router.get('/:platform/campaigns', async (req, res) => {
  const ctx = await resolveConnected(req, res);
  if (!ctx) return;
  if (!ctx.platform.listCampaigns) {
    return res.status(501).json({ error: `${ctx.platform.name} doesn't support campaign listing yet.` });
  }
  try {
    const campaigns = await ctx.platform.listCampaigns(ctx.tokens);
    res.json({ platform: ctx.platform.id, campaigns });
  } catch (err) {
    console.error(`[api/${ctx.platform.id}] list campaigns failed:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/:platform/campaigns — create a campaign. Every platform module
// creates campaigns PAUSED regardless of what's in the body — this route
// never causes ad spend by itself. See setCampaignStatus to go live.
router.post('/:platform/campaigns', async (req, res) => {
  const ctx = await resolveConnected(req, res);
  if (!ctx) return;
  if (!ctx.platform.createCampaign) {
    return res.status(501).json({ error: `${ctx.platform.name} doesn't support campaign creation yet.` });
  }
  try {
    const campaign = await ctx.platform.createCampaign(ctx.tokens, req.body || {});
    res.status(201).json({ platform: ctx.platform.id, status: 'PAUSED', campaign });
  } catch (err) {
    console.error(`[api/${ctx.platform.id}] create campaign failed:`, err.message);
    res.status(422).json({ error: err.message });
  }
});

// POST /api/:platform/campaigns/:campaignId/status — the deliberate,
// separate step that can actually turn spend on (status: "ACTIVE") or back
// off (status: "PAUSED"). Body: { "status": "ACTIVE" | "PAUSED" }.
router.post('/:platform/campaigns/:campaignId/status', async (req, res) => {
  const ctx = await resolveConnected(req, res);
  if (!ctx) return;
  if (!ctx.platform.setCampaignStatus) {
    return res.status(501).json({ error: `${ctx.platform.name} doesn't support campaign status changes yet.` });
  }
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'Body must include { "status": "ACTIVE" | "PAUSED" }.' });
  try {
    const result = await ctx.platform.setCampaignStatus(ctx.tokens, req.params.campaignId, status);
    res.json({ platform: ctx.platform.id, campaignId: req.params.campaignId, status, result });
  } catch (err) {
    console.error(`[api/${ctx.platform.id}] set campaign status failed:`, err.message);
    res.status(422).json({ error: err.message });
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
