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
});
