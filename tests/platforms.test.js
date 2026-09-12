'use strict';
require('./helpers/setupEnv');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const platforms = require('../src/platforms');

test('all 8 expected platforms are registered with unique ids', () => {
  const ids = platforms.all.map((p) => p.id).sort();
  assert.deepEqual(ids, ['google', 'linkedin', 'meta', 'pinterest', 'reddit', 'snapchat', 'tiktok', 'twitter']);
});

test('every platform exposes the required interface', () => {
  for (const p of platforms.all) {
    assert.equal(typeof p.id, 'string', `${p.id}: missing id`);
    assert.equal(typeof p.name, 'string', `${p.id}: missing name`);
    assert.equal(typeof p.isConfigured, 'function', `${p.id}: missing isConfigured`);
    assert.equal(typeof p.getSummary, 'function', `${p.id}: missing getSummary`);
    assert.equal(typeof p.listCampaigns, 'function', `${p.id}: missing listCampaigns`);
    assert.equal(typeof p.createCampaign, 'function', `${p.id}: missing createCampaign`);
    assert.equal(typeof p.setCampaignStatus, 'function', `${p.id}: missing setCampaignStatus`);
    assert.ok(p.redirectUri.endsWith(`/auth/${p.id}/callback`), `${p.id}: bad redirectUri`);
  }
});

test('isConfigured() is false with no env credentials set', () => {
  for (const p of platforms.all) {
    assert.equal(p.isConfigured(), false, `${p.id} should not be configured in a clean test env`);
  }
});

test('platforms.get() returns null for an unknown id', () => {
  assert.equal(platforms.get('not-a-real-platform'), null);
});

const REQUIRED_FIELDS = {
  meta: { name: 'n', objective: 'o' },
  google: { name: 'n', dailyBudgetMicros: 1 },
  reddit: { name: 'n', objective: 'o', dailyBudgetCents: 1 },
  pinterest: { name: 'n', objectiveType: 'o', dailySpendCapCents: 1 },
  linkedin: { name: 'n', campaignGroupUrn: 'urn:x', dailyBudgetAmount: '1' },
  snapchat: { name: 'n', objective: 'o' },
};

test('createCampaign fails with a clear "env var not set" message, not a network error, when the ad account id is missing', async () => {
  const fakeTokens = { accessToken: 'fake' };
  for (const [id, body] of Object.entries(REQUIRED_FIELDS)) {
    const platform = platforms.get(id);
    await assert.rejects(
      () => platform.createCampaign(fakeTokens, body),
      (err) => {
        assert.match(err.message, /is not set/, `${id}: expected a missing-env-var message, got: ${err.message}`);
        return true;
      }
    );
  }
});

test('createCampaign rejects a body missing required fields before any network/env check', async () => {
  const fakeTokens = { accessToken: 'fake' };
  for (const id of Object.keys(REQUIRED_FIELDS)) {
    const platform = platforms.get(id);
    await assert.rejects(() => platform.createCampaign(fakeTokens, {}), /requires/i, `${id} should validate required fields`);
  }
});

test('tiktok and twitter campaign methods explain the auth mismatch instead of attempting a call', async () => {
  // Both explanations mention "dedicated" (a separate connection is
  // needed); the specifics differ (TikTok-for-Business app vs OAuth 1.0a).
  for (const id of ['tiktok', 'twitter']) {
    const platform = platforms.get(id);
    await assert.rejects(() => platform.listCampaigns(), /dedicated/i);
    await assert.rejects(() => platform.createCampaign(), /dedicated/i);
    await assert.rejects(() => platform.setCampaignStatus(), /dedicated/i);
  }
});

test('setCampaignStatus rejects an invalid status value for every platform that supports it', async () => {
  const fakeTokens = { accessToken: 'fake' };
  const supported = platforms.all.filter((p) => !['tiktok', 'twitter'].includes(p.id));
  for (const platform of supported) {
    await assert.rejects(
      () => platform.setCampaignStatus(fakeTokens, 'id123', 'NOT_A_REAL_STATUS'),
      /status must be/i,
      `${platform.id} should validate the status value`
    );
  }
});
