// LinkedIn. App setup: https://www.linkedin.com/developers/apps
// Organic profile/company data needs "Sign In with LinkedIn"; running or
// reading ad campaigns needs separate approval into the Marketing Developer
// Platform program on top of this.
'use strict';

const { definePlatform, apiGet, apiPost, requireEnv } = require('./base');

// LinkedIn's newer versioned REST API (as opposed to the legacy /v2/ used
// for profile data above) requires a LinkedIn-Version header.
const LINKEDIN_API_VERSION = '202405';

module.exports = definePlatform({
  id: 'linkedin',
  name: 'LinkedIn',
  category: 'social+ads',
  clientId: process.env.LINKEDIN_CLIENT_ID,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  tokenAuthMethod: 'body',
  scope: 'r_liteprofile r_organization_social rw_ads',

  async getSummary(tokens) {
    const me = await apiGet('https://api.linkedin.com/v2/me', {
      Authorization: `Bearer ${tokens.accessToken}`,
    });
    return {
      id: me.id,
      firstName: me.localizedFirstName,
      lastName: me.localizedLastName,
    };
  },

  linkedinHeaders(accessToken) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    };
  },

  async listCampaigns(tokens) {
    const accountUrn = requireEnv('LINKEDIN_AD_ACCOUNT_URN', 'Format: urn:li:sponsoredAccount:123456789');
    const res = await apiGet(
      `https://api.linkedin.com/rest/adAccounts/${encodeURIComponent(accountUrn)}/adCampaigns?q=search`,
      this.linkedinHeaders(tokens.accessToken)
    );
    return res.elements || [];
  },

  /**
   * Always created PAUSED; flip live via setCampaignStatus once reviewed.
   * @param {{name: string, campaignGroupUrn: string, dailyBudgetAmount: string, costType?: string}} params
   *   campaignGroupUrn: a campaign group must already exist — create one in
   *   Campaign Manager first, LinkedIn's API doesn't create bare campaigns
   *   without a group.
   */
  async createCampaign(tokens, params) {
    const accountUrn = requireEnv('LINKEDIN_AD_ACCOUNT_URN', 'Format: urn:li:sponsoredAccount:123456789');
    if (!params?.name || !params?.campaignGroupUrn || !params?.dailyBudgetAmount) {
      throw new Error('LinkedIn campaign requires: name, campaignGroupUrn, dailyBudgetAmount.');
    }
    return apiPost(
      `https://api.linkedin.com/rest/adAccounts/${encodeURIComponent(accountUrn)}/adCampaigns`,
      this.linkedinHeaders(tokens.accessToken),
      {
        account: accountUrn,
        name: params.name,
        campaignGroup: params.campaignGroupUrn,
        status: 'PAUSED',
        costType: params.costType || 'CPC',
        dailyBudget: { amount: params.dailyBudgetAmount, currencyCode: 'USD' },
        type: 'SPONSORED_UPDATES',
      }
    );
  },

  async setCampaignStatus(tokens, campaignUrn, status) {
    if (!['ACTIVE', 'PAUSED'].includes(status)) throw new Error('status must be ACTIVE or PAUSED');
    return apiPost(
      `https://api.linkedin.com/rest/adCampaigns/${encodeURIComponent(campaignUrn)}`,
      { ...this.linkedinHeaders(tokens.accessToken), 'X-RestLi-Method': 'PARTIAL_UPDATE' },
      { patch: { $set: { status } } }
    );
  },
});
