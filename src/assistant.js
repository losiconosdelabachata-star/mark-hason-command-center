// "Mark" — the AI co-pilot living inside the dashboard. Named after the
// human Mark this whole tool is built for, on purpose.
//
// Scope, deliberately: Mark can see platform connection status, chat, and
// propose a campaign draft via the propose_campaign_draft tool — he never
// calls createCampaign/setCampaignStatus himself. A draft is just JSON
// handed back to the dashboard for a human to review in the actual
// create-campaign form; nothing is created or activated by anything Mark
// says. That boundary is enforced by never wiring his tool output into
// src/platforms/*.js at all, not just by asking him nicely in the prompt.
'use strict';

const platforms = require('./platforms');
const tokenStore = require('./tokenStore');

const ANTHROPIC_VERSION = '2023-06-01';
const MAX_HISTORY_MESSAGES = 20; // bound token usage on long-running conversations

// Only these platforms have a real createCampaign() — tiktok/twitter need a
// separate Ads connection (see README), so don't let Mark suggest drafts
// for platforms that would just fail if a human tried to act on them.
const CAMPAIGN_CAPABLE = ['meta', 'google', 'reddit', 'pinterest', 'linkedin', 'snapchat'];

const PROPOSE_DRAFT_TOOL = {
  name: 'propose_campaign_draft',
  description:
    'Propose a draft ad campaign for a human to review in the dashboard. This never creates or ' +
    'launches anything by itself — it only fills a suggestion into the create-campaign form. Only ' +
    'use this for a platform that is actually connected.',
  input_schema: {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: CAMPAIGN_CAPABLE, description: 'Which platform this draft is for.' },
      name: { type: 'string', description: 'Campaign name.' },
      fields: {
        type: 'object',
        description:
          "That platform's other required fields — e.g. for meta: {\"objective\": \"OUTCOME_TRAFFIC\"}; " +
          'for google: {"dailyBudgetMicros": 5000000}. See the backend README\'s campaign field table.',
      },
      rationale: { type: 'string', description: 'One or two sentences explaining the suggestion, shown to the human.' },
    },
    required: ['platform', 'name', 'fields'],
  },
};

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildSystemPrompt() {
  const connected = new Set(tokenStore.listConnected());
  const statusLines = platforms.all.map((p) => {
    const state = connected.has(p.id) ? 'connected' : p.isConfigured() ? 'configured, not connected' : 'not configured';
    const campaigns = CAMPAIGN_CAPABLE.includes(p.id) ? 'campaign drafts supported' : 'campaign drafts not supported yet';
    return `- ${p.name} (${p.id}): ${state} — ${campaigns}`;
  });

  return [
    "You are Mark — the AI marketing co-pilot inside Julieth Tapia Co's (@julitaco3) Mark Hason Command Center.",
    'You help whoever is chatting with you (likely Mark, her manager) think through campaigns and read the connected platforms.',
    '',
    'Current platform status:',
    ...statusLines,
    '',
    'Hard rules:',
    '- You cannot create, launch, activate, or pause anything yourself. You have no tool for it.',
    '- To suggest a campaign, call propose_campaign_draft. That only fills a draft into the dashboard — a human still has to review it and click Create, and separately click Activate before it can spend money. Never say you "created" or "launched" a campaign; say you "drafted" or "suggested" one.',
    "- Don't propose a draft for a platform that isn't connected — say what's needed to connect it first instead.",
    '- Be direct and specific. Keep replies short unless asked to go deep.',
  ].join('\n');
}

async function chat(history) {
  if (!isConfigured()) {
    throw new Error('Mark is not configured yet — set ANTHROPIC_API_KEY on the backend.');
  }

  const trimmed = history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: trimmed,
      tools: [PROPOSE_DRAFT_TOOL],
    }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Anthropic API returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`Anthropic API error (${res.status}): ${json.error?.message || text.slice(0, 300)}`);
  }

  const textBlocks = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text);
  const toolUse = (json.content || []).find((b) => b.type === 'tool_use' && b.name === 'propose_campaign_draft');

  return {
    reply: textBlocks.join('\n\n').trim() || (toolUse ? "Here's a draft:" : ''),
    draft: toolUse ? toolUse.input : null,
  };
}

module.exports = { isConfigured, chat, CAMPAIGN_CAPABLE };
