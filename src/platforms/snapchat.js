// Snapchat Marketing API. App setup: via Snapchat Business Manager
// (https://businesshelp.snapchat.com) — Business account + app review
// required before ads scopes are granted.
'use strict';

const { definePlatform, apiGet, apiPost, apiPut, requireEnv } = require('./base');

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

  async listCampaigns(tokens) {
    const accountId = requireEnv('SNAPCHAT_AD_ACCOUNT_ID');
    const res = await apiGet(`https://adsapi.snapchat.com/v1/adaccounts/${accountId}/campaigns`, {
      Authorization: `Bearer ${tokens.accessToken}`,
    });
    return res.campaigns || [];
  },

  /**
   * Always created PAUSED; flip live via setCampaignStatus once reviewed.
   * @param {{name: string, objective: string}} params
   *   objective: e.g. "AWARENESS", "APP_INSTALLS", "WEB_CONVERSIONS"
   */
  async createCampaign(tokens, params) {
    const accountId = requireEnv('SNAPCHAT_AD_ACCOUNT_ID');
    if (!params?.name || !params?.objective) {
      throw new Error('Snapchat campaign requires: name, objective.');
    }
    return apiPost(
      `https://adsapi.snapchat.com/v1/adaccounts/${accountId}/campaigns`,
      { Authorization: `Bearer ${tokens.accessToken}` },
      { campaigns: [{ name: params.name, ad_account_id: accountId, status: 'PAUSED', objective: params.objective }] }
    );
  },

  async setCampaignStatus(tokens, campaignId, status) {
    if (!['ACTIVE', 'PAUSED'].includes(status)) throw new Error('status must be ACTIVE or PAUSED');
    return apiPut(
      `https://adsapi.snapchat.com/v1/campaigns/${campaignId}`,
      { Authorization: `Bearer ${tokens.accessToken}` },
      { campaigns: [{ id: campaignId, status }] }
    );
  },
});
