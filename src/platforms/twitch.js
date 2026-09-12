// Twitch. App setup: https://dev.twitch.tv/console/apps
// Twitch's Helix API requires a Client-Id header on every call, in addition
// to the OAuth Bearer token — a separate requirement from the OAuth flow
// itself, easy to miss.
'use strict';

const { definePlatform, apiGet } = require('./base');

module.exports = definePlatform({
  id: 'twitch',
  name: 'Twitch',
  category: 'social',
  clientId: process.env.TWITCH_CLIENT_ID,
  clientSecret: process.env.TWITCH_CLIENT_SECRET,
  authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
  tokenUrl: 'https://id.twitch.tv/oauth2/token',
  tokenAuthMethod: 'body',
  scope: 'user:read:email moderator:read:followers',

  async getSummary(tokens) {
    const headers = { Authorization: `Bearer ${tokens.accessToken}`, 'Client-Id': this.clientId };
    const me = await apiGet('https://api.twitch.tv/helix/users', headers);
    const user = me.data?.[0];
    let followers = null;
    if (user) {
      try {
        const f = await apiGet(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`, headers);
        followers = f.total ?? null;
      } catch (err) {
        followers = { error: err.message };
      }
    }
    return { displayName: user?.display_name, loginName: user?.login, viewCount: user?.view_count, followers };
  },

  // Twitch has no public self-serve ad-campaign API — its monetization
  // (subs, bits, automatically inserted channel ads) isn't something a
  // create-campaign flow manages. Analytics-only, honestly, rather than
  // pretending a campaign endpoint exists.
  async listCampaigns() {
    throw new Error("Twitch doesn't have a public self-serve ads/campaign API — this connection is analytics-only.");
  },
  async createCampaign() {
    return this.listCampaigns();
  },
  async setCampaignStatus() {
    return this.listCampaigns();
  },
});
