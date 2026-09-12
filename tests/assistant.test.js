'use strict';
require('./helpers/setupEnv');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const assistant = require('../src/assistant');

test('isConfigured() is false with no ANTHROPIC_API_KEY', () => {
  assert.equal(assistant.isConfigured(), false);
});

test('chat() refuses to call the API when not configured', async () => {
  await assert.rejects(() => assistant.chat([{ role: 'user', content: 'hi' }]), /not configured/i);
});

test('chat() sends the trimmed history, system prompt, and the propose_campaign_draft tool', async (t) => {
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let capturedBody;
  t.mock.method(global, 'fetch', async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ content: [{ type: 'text', text: 'Hi, I am Marino 007.' }] }),
    };
  });

  try {
    const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` }));
    const result = await assistant.chat(history);

    assert.equal(result.reply, 'Hi, I am Marino 007.');
    assert.equal(result.draft, null);
    assert.equal(capturedBody.messages.length, 20, 'should trim to the last 20 messages');
    assert.equal(capturedBody.messages.at(-1).content, 'msg 29');
    assert.ok(capturedBody.system.includes('You are Marino 007'));
    assert.ok(capturedBody.tools.some((tool) => tool.name === 'propose_campaign_draft'));
  } finally {
    process.env.ANTHROPIC_API_KEY = original;
  }
});

test('chat() extracts a campaign draft from a tool_use response block', async (t) => {
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        content: [
          { type: 'text', text: "Here's an idea." },
          {
            type: 'tool_use',
            name: 'propose_campaign_draft',
            input: { platform: 'reddit', name: 'Spring Sale', fields: { objective: 'CLICKS', dailyBudgetCents: 1000 } },
          },
        ],
      }),
  }));

  try {
    const result = await assistant.chat([{ role: 'user', content: 'suggest a reddit campaign' }]);
    assert.equal(result.reply, "Here's an idea.");
    assert.deepEqual(result.draft, { platform: 'reddit', name: 'Spring Sale', fields: { objective: 'CLICKS', dailyBudgetCents: 1000 } });
  } finally {
    process.env.ANTHROPIC_API_KEY = original;
  }
});

test('chat() surfaces a clear error on a non-OK API response', async (t) => {
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  t.mock.method(global, 'fetch', async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { message: 'invalid x-api-key' } }),
  }));

  try {
    await assert.rejects(() => assistant.chat([{ role: 'user', content: 'hi' }]), /invalid x-api-key/);
  } finally {
    process.env.ANTHROPIC_API_KEY = original;
  }
});

test('CAMPAIGN_CAPABLE excludes tiktok and twitter, matching their platform modules', () => {
  assert.ok(!assistant.CAMPAIGN_CAPABLE.includes('tiktok'));
  assert.ok(!assistant.CAMPAIGN_CAPABLE.includes('twitter'));
  assert.ok(assistant.CAMPAIGN_CAPABLE.includes('meta'));
  assert.equal(assistant.CAMPAIGN_CAPABLE.length, 6);
});
