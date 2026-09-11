// Meta (Facebook Pages + Instagram Business + Marketing/Ads API).
// App setup: https://developers.facebook.com/apps
// Note: ads_management / instagram_* scopes require Business verification
// and Meta App Review before they work outside your own test users.
'use strict';

const { definePlatform, apiGet, apiPost, requireEnv } = require('./base');

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

  async listCampaigns(tokens) {
    const accountId = requireEnv('META_AD_ACCOUNT_ID', 'Set it to the numeric id shown in Meta Ads Manager account settings.');
    const res = await apiGet(
      `https://graph.facebook.com/${GRAPH_VERSION}/act_${accountId}/campaigns?fields=name,objective,status,daily_budget,lifetime_budget,created_time&access_token=${tokens.accessToken}`
    );
    return res.data || [];
  },

  /**
   * Creates a campaign. Always created PAUSED regardless of what's passed in
   * — flipping it live is a separate, deliberate call to setCampaignStatus.
   * @param {{name: string, objective: string, specialAdCategories?: string[]}} params
   *   objective: e.g. "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS"
   *   (Meta's Outcome-Driven Ad Experience objective names).
   */
  async createCampaign(tokens, params) {
    const accountId = requireEnv('META_AD_ACCOUNT_ID', 'Set it to the numeric id shown in Meta Ads Manager account settings.');
    if (!params?.name || !params?.objective) {
      throw new Error('Meta campaign requires: name, objective (e.g. OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_AWARENESS).');
    }
    return apiPost(
      `https://graph.facebook.com/${GRAPH_VERSION}/act_${accountId}/campaigns?access_token=${tokens.accessToken}`,
      {},
      {
        name: params.name,
        objective: params.objective,
        status: 'PAUSED',
        special_ad_categories: params.specialAdCategories || [],
      }
    );
  },

  async setCampaignStatus(tokens, campaignId, status) {
    if (!['ACTIVE', 'PAUSED'].includes(status)) throw new Error('status must be ACTIVE or PAUSED');
    return apiPost(
      `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}?access_token=${tokens.accessToken}`,
      {},
      { status }
    );
  },
});
