// Pinterest. App setup: https://developers.pinterest.com/apps
'use strict';

const { definePlatform, apiGet, apiPost, apiPatch, requireEnv } = require('./base');

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

  async listCampaigns(tokens) {
    const accountId = requireEnv('PINTEREST_AD_ACCOUNT_ID');
    const res = await apiGet(`https://api.pinterest.com/v5/ad_accounts/${accountId}/campaigns`, {
      Authorization: `Bearer ${tokens.accessToken}`,
    });
    return res.items || [];
  },

  /**
   * Always created PAUSED; flip live via setCampaignStatus once reviewed.
   * @param {{name: string, objectiveType: string, dailySpendCapCents: number}} params
   *   objectiveType: e.g. "AWARENESS", "CONSIDERATION", "CATALOG_SALES"
   */
  async createCampaign(tokens, params) {
    const accountId = requireEnv('PINTEREST_AD_ACCOUNT_ID');
    if (!params?.name || !params?.objectiveType || !params?.dailySpendCapCents) {
      throw new Error('Pinterest campaign requires: name, objectiveType, dailySpendCapCents.');
    }
    return apiPost(
      `https://api.pinterest.com/v5/ad_accounts/${accountId}/campaigns`,
      { Authorization: `Bearer ${tokens.accessToken}` },
      {
        name: params.name,
        objective_type: params.objectiveType,
        status: 'PAUSED',
        daily_spend_cap: params.dailySpendCapCents,
      }
    );
  },

  async setCampaignStatus(tokens, campaignId, status) {
    if (!['ACTIVE', 'PAUSED'].includes(status)) throw new Error('status must be ACTIVE or PAUSED');
    const accountId = requireEnv('PINTEREST_AD_ACCOUNT_ID');
    // Pinterest's v5 campaigns PATCH endpoint takes a batch array, even for one.
    return apiPatch(
      `https://api.pinterest.com/v5/ad_accounts/${accountId}/campaigns`,
      { Authorization: `Bearer ${tokens.accessToken}` },
      [{ id: campaignId, status }]
    );
  },
});
