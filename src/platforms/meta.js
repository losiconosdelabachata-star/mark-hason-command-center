// Meta (Facebook Pages + Instagram Business + Marketing/Ads API).
// App setup: https://developers.facebook.com/apps
// Note: ads_management / instagram_* scopes require Business verification
// and Meta App Review before they work outside your own test users.
'use strict';

const { definePlatform, apiGet } = require('./base');

const GRAPH_VERSION = 'v19.0';

module.exports = definePlatform({
  id: 'meta',
  name: 'Meta (Facebook & Instagram)',
  category: 'social+ads',
  clientId: process.env.META_CLIENT_ID,
  clientSecret: process.env.META_CLIENT_SECRET,
  authorizeUrl: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`,
  tokenUrl: `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
  tokenAuthMethod: 'body',
  scope: [
    'pages_show_list',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_insights',
    'ads_management',
    'ads_read',
    'business_management',
  ].join(','),

  async getSummary(tokens) {
    const [pages, adAccounts] = await Promise.all([
      apiGet(
        `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=name,category,fan_count,instagram_business_account&access_token=${tokens.accessToken}`
      ),
      apiGet(
        `https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts?fields=name,account_status,amount_spent,currency&access_token=${tokens.accessToken}`
      ),
    ]);
    return {
      pages: pages.data || [],
      adAccounts: adAccounts.data || [],
    };
  },
});
