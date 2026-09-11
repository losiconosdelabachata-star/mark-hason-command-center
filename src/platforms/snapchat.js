// Snapchat Marketing API. App setup: via Snapchat Business Manager
// (https://businesshelp.snapchat.com) — Business account + app review
// required before ads scopes are granted.
'use strict';

const { definePlatform, apiGet } = require('./base');

module.exports = definePlatform({
  id: 'snapchat',
  name: 'Snapchat',
  category: 'social+ads',
  clientId: process.env.SNAPCHAT_CLIENT_ID,
  clientSecret: process.env.SNAPCHAT_CLIENT_SECRET,
  authorizeUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
  tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
  tokenAuthMethod: 'body',
  scope: 'snapchat-marketing-api',

  async getSummary(tokens) {
    const me = await apiGet('https://adsapi.snapchat.com/v1/me', {
      Authorization: `Bearer ${tokens.accessToken}`,
    });
    return me.me || me;
  },
});
