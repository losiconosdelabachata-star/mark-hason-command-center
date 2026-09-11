// X / Twitter (API v2, OAuth2 + mandatory PKCE).
// App setup: https://developer.twitter.com/en/portal/dashboard
'use strict';

const { definePlatform, apiGet } = require('./base');

module.exports = definePlatform({
  id: 'twitter',
  name: 'X (Twitter)',
  category: 'social',
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
  authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
  tokenUrl: 'https://api.twitter.com/2/oauth2/token',
  tokenAuthMethod: 'basic',
  usePKCE: true,
  scope: 'tweet.read users.read offline.access',

  async getSummary(tokens) {
    const me = await apiGet(
      'https://api.twitter.com/2/users/me?user.fields=public_metrics',
      { Authorization: `Bearer ${tokens.accessToken}` }
    );
    return {
      username: me.data?.username,
      metrics: me.data?.public_metrics,
    };
  },

  // --- Campaign creation is intentionally NOT wired to this connection ---
  // X's Ads API (ads-api.twitter.com) authenticates with OAuth 1.0a user
  // context (consumer key/secret + access token/secret), not the OAuth 2.0 +
  // PKCE bearer token used for getSummary() above — they're different
  // signing schemes. Rather than pretend this token works there, this
  // throws a clear explanation instead of failing mysteriously later.
  async listCampaigns() {
    throw new Error(
      'X Ads API uses OAuth 1.0a, not the OAuth 2.0 token used for X analytics here. ' +
      'Add a dedicated OAuth 1.0a Ads API connection before wiring this up.'
    );
  },
  async createCampaign() {
    return this.listCampaigns();
  },
  async setCampaignStatus() {
    return this.listCampaigns();
  },
});
