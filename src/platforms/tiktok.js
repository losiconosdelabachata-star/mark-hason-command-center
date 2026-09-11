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

  // --- Campaign creation is intentionally NOT wired to this connection ---
  // TikTok's Marketing API (business-api.tiktok.com) authenticates with an
  // access token from TikTok for Business's own OAuth app, which is a
  // completely separate credential system from the Login Kit token this
  // module uses for getSummary() above — the Login Kit token will not
  // authorize ads calls no matter what's passed in. Rather than pretend
  // this works, these throw a clear explanation so nobody ships a silently
  // broken "Create campaign" button.
  async listCampaigns() {
    throw new Error(
      'TikTok campaign management needs a separate TikTok for Business connection ' +
      '(business-api.tiktok.com), not the Login Kit token used for TikTok analytics here. ' +
      'Add a dedicated TikTok-for-Business OAuth flow before wiring this up.'
    );
  },
  async createCampaign() {
    return this.listCampaigns();
  },
  async setCampaignStatus() {
    return this.listCampaigns();
  },
});
