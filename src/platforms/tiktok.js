// TikTok (Login Kit). App setup: https://developers.tiktok.com/apps
// Full TikTok for Business / ads campaign management is a separate
// application (https://ads.tiktok.com/marketing_api) with its own review —
// this module covers the basic profile/analytics login flow.
'use strict';

const { definePlatform, apiGet } = require('./base');

module.exports = definePlatform({
  id: 'tiktok',
  name: 'TikTok',
  category: 'social',
  // TikTok calls this field "client_key" everywhere instead of "client_id".
  clientId: process.env.TIKTOK_CLIENT_KEY,
  clientSecret: process.env.TIKTOK_CLIENT_SECRET,
  clientIdParam: 'client_key',
  clientSecretParam: 'client_secret',
  authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
  tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
  tokenAuthMethod: 'body',
  scope: 'user.info.basic,user.info.stats',

  async getSummary(tokens) {
    const info = await apiGet(
      'https://open.tiktokapis.com/v2/user/info/?fields=display_name,follower_count,likes_count,video_count',
      { Authorization: `Bearer ${tokens.accessToken}` }
    );
    return info.data?.user || info;
  },
});
