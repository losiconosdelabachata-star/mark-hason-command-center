// LinkedIn. App setup: https://www.linkedin.com/developers/apps
// Organic profile/company data needs "Sign In with LinkedIn"; running or
// reading ad campaigns needs separate approval into the Marketing Developer
// Platform program on top of this.
'use strict';

const { definePlatform, apiGet } = require('./base');

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
});
