// Google — one OAuth connection shared across YouTube Data/Analytics,
// Google Ads, and AdSense (they're all "Google" from the user's perspective).
// App setup: https://console.cloud.google.com/apis/credentials
//
// Google Ads additionally needs a developer token (GOOGLE_ADS_DEVELOPER_TOKEN)
// and a target customer id (GOOGLE_ADS_CUSTOMER_ID) — approval for the
// developer token can take days/weeks, so that part of the summary degrades
// gracefully to "not configured" until it's supplied.
'use strict';

const { definePlatform, apiGet, requireEnv } = require('./base');

const ADS_API_VERSION = 'v17';

function googleAdsHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': requireEnv(
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'Apply for one at https://ads.google.com/aw/apicenter — approval can take days/weeks.'
    ),
    'Content-Type': 'application/json',
  };
}

async function googleAdsMutate(accessToken, customerId, resource, operations) {
  const res = await fetch(
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/${resource}:mutate`,
    {
      method: 'POST',
      headers: googleAdsHeaders(accessToken),
      body: JSON.stringify({ operations }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Google Ads ${resource}:mutate failed (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

module.exports = definePlatform({
  id: 'google',
  name: 'Google (YouTube, Google Ads, AdSense)',
  category: 'video+ads',
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  tokenAuthMethod: 'body',
  scope: [
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/adwords',
    'https://www.googleapis.com/auth/adsense.readonly',
  ].join(' '),
  // access_type=offline + prompt=consent are required to get a refresh_token
  // back from Google on the first authorization.
  extraAuthParams: { access_type: 'offline', prompt: 'consent' },

  async getSummary(tokens) {
    const authHeader = { Authorization: `Bearer ${tokens.accessToken}` };
    const summary = {};

    try {
      const yt = await apiGet(
        'https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true',
        authHeader
      );
      summary.youtube = yt.items || [];
    } catch (err) {
      summary.youtube = { error: err.message };
    }

    try {
      const adsense = await apiGet('https://www.adsense.googleapis.com/v2/accounts', authHeader);
      summary.adsense = adsense.accounts || [];
    } catch (err) {
      summary.adsense = { error: err.message };
    }

    if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_ID) {
      try {
        const res = await fetch(
          `https://googleads.googleapis.com/v17/customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/googleAds:search`,
          {
            method: 'POST',
            headers: {
              ...authHeader,
              'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query:
                'SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS',
            }),
          }
        );
        summary.googleAds = await res.json();
      } catch (err) {
        summary.googleAds = { error: err.message };
      }
    } else {
      summary.googleAds = { status: 'not_configured', note: 'Set GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID' };
    }

    return summary;
  },

  async listCampaigns(tokens) {
    const customerId = requireEnv('GOOGLE_ADS_CUSTOMER_ID', 'Set it to the target Google Ads account id (no dashes).');
    const res = await fetch(
      `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: googleAdsHeaders(tokens.accessToken),
        body: JSON.stringify({
          query: 'SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign',
        }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(`Google Ads search failed (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
    return json.results || [];
  },

  /**
   * Google Ads campaigns require a CampaignBudget resource to exist first,
   * then a Campaign referencing it — this does both in sequence. Always
   * created PAUSED; flip live via setCampaignStatus once reviewed.
   * @param {{name: string, dailyBudgetMicros: number, advertisingChannelType?: string}} params
   *   advertisingChannelType: e.g. "SEARCH", "DISPLAY", "VIDEO" (defaults to SEARCH)
   */
  async createCampaign(tokens, params) {
    if (!params?.name || !params?.dailyBudgetMicros) {
      throw new Error('Google Ads campaign requires: name, dailyBudgetMicros (1 USD = 1,000,000 micros).');
    }
    const customerId = requireEnv('GOOGLE_ADS_CUSTOMER_ID', 'Set it to the target Google Ads account id (no dashes).');

    const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`;
    const budgetResult = await googleAdsMutate(tokens.accessToken, customerId, 'campaignBudgets', [
      {
        create: {
          resourceName: budgetResourceName,
          name: `${params.name} — budget`,
          amountMicros: String(params.dailyBudgetMicros),
          deliveryMethod: 'STANDARD',
        },
      },
    ]);
    const createdBudgetResourceName = budgetResult.results?.[0]?.resourceName || budgetResourceName;

    const campaignResult = await googleAdsMutate(tokens.accessToken, customerId, 'campaigns', [
      {
        create: {
          name: params.name,
          status: 'PAUSED',
          advertisingChannelType: params.advertisingChannelType || 'SEARCH',
          campaignBudget: createdBudgetResourceName,
        },
      },
    ]);
    return campaignResult;
  },

  async setCampaignStatus(tokens, campaignResourceName, status) {
    if (!['ENABLED', 'PAUSED', 'REMOVED'].includes(status)) {
      throw new Error('status must be ENABLED, PAUSED, or REMOVED');
    }
    const customerId = requireEnv('GOOGLE_ADS_CUSTOMER_ID');
    return googleAdsMutate(tokens.accessToken, customerId, 'campaigns', [
      {
        update: { resourceName: campaignResourceName, status },
        updateMask: 'status',
      },
    ]);
  },
});
