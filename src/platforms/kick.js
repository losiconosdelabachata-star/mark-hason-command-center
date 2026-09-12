// Kick. App setup: https://kick.com/settings/developer
// Kick's public API program is newer and far less battle-tested than the
// others in this file — double check these exact endpoints against Kick's
// current docs before the first real connection attempt. This follows
// their documented OAuth 2.1 + PKCE flow as of when this was written.
'use strict';

const { definePlatform, apiGet } = require('./base');

module.exports = definePlatform({
  id: 'kick',
  name: 'Kick',
  category: 'social',
  clientId: process.env.KICK_CLIENT_ID,
  clientSecret: process.env.KICK_CLIENT_SECRET,
  authorizeUrl: 'https://id.kick.com/oauth/authorize',
  tokenUrl: 'https://id.kick.com/oauth/token',
  tokenAuthMethod: 'body',
  usePKCE: true,
  scope: 'user:read channel:read',

  async getSummary(tokens) {
    const res = await apiGet('https://api.kick.com/public/v1/channels', { Authorization: `Bearer ${tokens.accessToken}` });
    return res.data?.[0] || res.data || res;
  },

  // Same story as Twitch: no public ads/campaign API to wire up.
  async listCampaigns() {
    throw new Error("Kick doesn't have a public ads/campaign API — this connection is analytics-only.");
  },
  async createCampaign() {
    return this.listCampaigns();
  },
  async setCampaignStatus() {
    return this.listCampaigns();
  },
});
