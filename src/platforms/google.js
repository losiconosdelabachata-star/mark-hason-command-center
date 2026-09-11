// Google — one OAuth connection shared across YouTube Data/Analytics,
// Google Ads, and AdSense (they're all "Google" from the user's perspective).
// App setup: https://console.cloud.google.com/apis/credentials
//
// Google Ads additionally needs a developer token (GOOGLE_ADS_DEVELOPER_TOKEN)
// and a target customer id (GOOGLE_ADS_CUSTOMER_ID) — approval for the
// developer token can take days/weeks, so that part of the summary degrades
// gracefully to "not configured" until it's supplied.
'use strict';

const { definePlatform, apiGet } = require('./base');

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
});
