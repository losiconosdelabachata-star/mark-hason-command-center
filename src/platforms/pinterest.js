// Pinterest. App setup: https://developers.pinterest.com/apps
'use strict';

const { definePlatform, apiGet } = require('./base');

module.exports = definePlatform({
  id: 'pinterest',
  name: 'Pinterest',
  category: 'social+ads',
  clientId: process.env.PINTEREST_CLIENT_ID,
  clientSecret: process.env.PINTEREST_CLIENT_SECRET,
  authorizeUrl: 'https://www.pinterest.com/oauth/',
  tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
  tokenAuthMethod: 'basic',
  scope: 'ads:read boards:read pins:read user_accounts:read',

  async getSummary(tokens) {
    const account = await apiGet('https://api.pinterest.com/v5/user_account', {
      Authorization: `Bearer ${tokens.accessToken}`,
    });
    return {
      username: account.username,
      followerCount: account.follower_count,
      monthlyViews: account.monthly_views,
      accountType: account.account_type,
    };
  },
});
