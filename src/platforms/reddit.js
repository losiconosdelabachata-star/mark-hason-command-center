// Reddit. App setup: https://www.reddit.com/prefs/apps (create a "web app").
// Reddit requires HTTP Basic auth on the token endpoint and a descriptive
// User-Agent on every API call, or it will silently rate-limit/block you.
'use strict';

const { definePlatform, apiGet, apiPost, requireEnv } = require('./base');

const ADS_API_BASE = 'https://ads-api.reddit.com/api/v2.0';

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

  // Reddit Ads is a separate product from the consumer API used above —
  // these calls need REDDIT_AD_ACCOUNT_ID and a token scoped for Reddit Ads
  // API access, which Reddit grants separately (ask your Reddit Ads rep).

  async listCampaigns(tokens) {
    const accountId = requireEnv('REDDIT_AD_ACCOUNT_ID', 'Reddit Ads API access is a separate approval from basic login — see .env.example.');
    const res = await apiGet(`${ADS_API_BASE}/accounts/${accountId}/campaigns`, {
      Authorization: `Bearer ${tokens.accessToken}`,
      'User-Agent': this.userAgent,
    });
    return res.data || [];
  },

  /**
   * Always created PAUSED (configured_status: "PAUSED"); flip live via
   * setCampaignStatus once reviewed.
   * @param {{name: string, objective: string, dailyBudgetCents: number}} params
   */
  async createCampaign(tokens, params) {
    if (!params?.name || !params?.objective || !params?.dailyBudgetCents) {
      throw new Error('Reddit campaign requires: name, objective, dailyBudgetCents.');
    }
    const accountId = requireEnv('REDDIT_AD_ACCOUNT_ID', 'Reddit Ads API access is a separate approval from basic login — see .env.example.');
    return apiPost(
      `${ADS_API_BASE}/accounts/${accountId}/campaigns`,
      { Authorization: `Bearer ${tokens.accessToken}`, 'User-Agent': this.userAgent },
      {
        campaign: {
          name: params.name,
          objective: params.objective,
          configured_status: 'PAUSED',
          daily_budget_cents: params.dailyBudgetCents,
        },
      }
    );
  },

  async setCampaignStatus(tokens, campaignId, status) {
    if (!['ACTIVE', 'PAUSED'].includes(status)) throw new Error('status must be ACTIVE or PAUSED');
    const accountId = requireEnv('REDDIT_AD_ACCOUNT_ID');
    return apiPost(
      `${ADS_API_BASE}/accounts/${accountId}/campaigns/${campaignId}`,
      { Authorization: `Bearer ${tokens.accessToken}`, 'User-Agent': this.userAgent },
      { campaign: { configured_status: status } }
    );
  },
});
