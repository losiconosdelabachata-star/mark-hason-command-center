// Reddit. App setup: https://www.reddit.com/prefs/apps (create a "web app").
// Reddit requires HTTP Basic auth on the token endpoint and a descriptive
// User-Agent on every API call, or it will silently rate-limit/block you.
'use strict';

const { definePlatform, apiGet } = require('./base');

module.exports = definePlatform({
  id: 'reddit',
  name: 'Reddit',
  category: 'social+ads',
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  authorizeUrl: 'https://www.reddit.com/api/v1/authorize',
  tokenUrl: 'https://www.reddit.com/api/v1/access_token',
  tokenAuthMethod: 'basic',
  userAgent: 'mark-hason-command-center/0.1 (by /u/julitaco3-manager)',
  scope: 'identity read history mysubreddits',
  // duration=permanent is what gets Reddit to hand back a refresh_token.
  extraAuthParams: { duration: 'permanent' },

  async getSummary(tokens) {
    const me = await apiGet('https://oauth.reddit.com/api/v1/me', {
      Authorization: `Bearer ${tokens.accessToken}`,
      'User-Agent': this.userAgent,
    });
    return {
      name: me.name,
      totalKarma: me.total_karma,
      linkKarma: me.link_karma,
      commentKarma: me.comment_karma,
    };
  },
});
