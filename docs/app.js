// Mark Hason Command Center — dashboard frontend.
// Plain JS, no build step, no framework — this is a static file GitHub
// Pages serves as-is. It talks to the backend (a separate repo/deploy) over
// its JSON API, authenticating with an admin API key that lives ONLY in
// this browser's localStorage. The page itself has no secrets baked in —
// anyone can view its source, they just can't do anything with it without
// the key.
'use strict';

const DEFAULT_BASE_URL = 'https://mark-hason-command-center-production.up.railway.app';
const LS_BASE_URL = 'mhc_base_url';
const LS_API_KEY = 'mhc_api_key';

// Per-platform hints for the "create campaign" form's extra-fields JSON —
// these mirror the required-body-fields table in the backend README.
const CAMPAIGN_HINTS = {
  meta: { hint: 'Required: objective (e.g. OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_AWARENESS)', placeholder: '{\n  "objective": "OUTCOME_TRAFFIC"\n}' },
  google: { hint: 'Required: dailyBudgetMicros (1 USD = 1,000,000 micros)', placeholder: '{\n  "dailyBudgetMicros": 5000000\n}' },
  reddit: { hint: 'Required: objective, dailyBudgetCents', placeholder: '{\n  "objective": "CLICKS",\n  "dailyBudgetCents": 1000\n}' },
  pinterest: { hint: 'Required: objectiveType, dailySpendCapCents', placeholder: '{\n  "objectiveType": "AWARENESS",\n  "dailySpendCapCents": 1000\n}' },
  linkedin: { hint: 'Required: campaignGroupUrn (create the group in Campaign Manager first), dailyBudgetAmount', placeholder: '{\n  "campaignGroupUrn": "urn:li:sponsoredCampaignGroup:123",\n  "dailyBudgetAmount": "50"\n}' },
  snapchat: { hint: 'Required: objective (e.g. AWARENESS, APP_INSTALLS, WEB_CONVERSIONS)', placeholder: '{\n  "objective": "AWARENESS"\n}' },
  tiktok: { hint: 'Not available yet — TikTok Ads needs a separate TikTok-for-Business connection. See README.', placeholder: '', disabled: true },
  twitter: { hint: 'Not available yet — X Ads API uses OAuth 1.0a, a separate connection from X analytics. See README.', placeholder: '', disabled: true },
};

// ---- tiny state + storage helpers ----

function getSettings() {
  return {
    baseUrl: localStorage.getItem(LS_BASE_URL) || DEFAULT_BASE_URL,
    apiKey: localStorage.getItem(LS_API_KEY) || '',
  };
}

function saveSettings(baseUrl, apiKey) {
  localStorage.setItem(LS_BASE_URL, baseUrl);
  localStorage.setItem(LS_API_KEY, apiKey);
}

function clearSettings() {
  localStorage.removeItem(LS_BASE_URL);
  localStorage.removeItem(LS_API_KEY);
}

let statusCache = [];
let currentPlatform = null;

// ---- API ----

async function api(path, { method = 'GET', body } = {}) {
  const { baseUrl, apiKey } = getSettings();
  const res = await fetch(baseUrl.replace(/\/+$/, '') + path, {
    method,
    headers: {
      'x-api-key': apiKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// ---- toasts ----

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ` toast-${type}` : ''}`;
  el.textContent = message;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// ---- settings modal ----

const settingsModal = document.getElementById('settings-modal');
const baseUrlInput = document.getElementById('setting-base-url');
const apiKeyInput = document.getElementById('setting-api-key');

function openSettings() {
  const { baseUrl, apiKey } = getSettings();
  baseUrlInput.value = baseUrl;
  apiKeyInput.value = apiKey;
  settingsModal.showModal();
}

document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('key-gate-btn').addEventListener('click', openSettings);

document.getElementById('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings(baseUrlInput.value.trim(), apiKeyInput.value.trim());
  settingsModal.close();
  toast('Settings saved', 'success');
  refresh();
});

document.getElementById('settings-clear').addEventListener('click', () => {
  clearSettings();
  settingsModal.close();
  toast('Cleared — enter your admin key again to reconnect.');
  refresh();
});

// ---- platform grid ----

const gridEl = document.getElementById('platform-grid');
const keyGateEl = document.getElementById('key-gate');
const summaryPillEl = document.getElementById('connection-summary');

function statusPill(p) {
  if (p.connected) return `<span class="pill pill-green">● Connected</span>`;
  if (p.configured) return `<span class="pill pill-yellow">○ Not connected</span>`;
  return `<span class="pill pill-muted">Not configured</span>`;
}

function renderGrid(platforms) {
  statusCache = platforms;
  const connectedCount = platforms.filter((p) => p.connected).length;
  summaryPillEl.textContent = `${connectedCount}/${platforms.length} connected`;
  summaryPillEl.className = `pill ${connectedCount > 0 ? 'pill-green' : 'pill-muted'}`;

  gridEl.innerHTML = platforms.map((p) => `
    <article class="card" data-platform="${p.id}">
      <div class="card-head">
        <div>
          <h3>${p.name}</h3>
          <p class="card-category">${p.category}</p>
        </div>
        ${statusPill(p)}
      </div>
      <div class="card-actions">
        ${p.connected
          ? `<button class="btn btn-primary btn-sm" data-action="details" data-id="${p.id}">Details</button>
             <button class="btn btn-danger btn-sm" data-action="disconnect" data-id="${p.id}">Disconnect</button>`
          : p.configured
            ? `<button class="btn btn-primary btn-sm" data-action="connect" data-id="${p.id}">Connect</button>`
            : `<span class="hint">Add credentials in the backend's env vars first</span>`
        }
      </div>
    </article>
  `).join('');
}

gridEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'connect') connectPlatform(id);
  if (btn.dataset.action === 'disconnect') disconnectPlatform(id);
  if (btn.dataset.action === 'details') openDetail(id);
});

async function connectPlatform(id) {
  try {
    const { url } = await api(`/auth/${id}/authorize-url`);
    window.location.href = url; // full navigation to the platform's consent screen
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function disconnectPlatform(id) {
  const platform = statusCache.find((p) => p.id === id);
  if (!confirm(`Disconnect ${platform?.name || id}? You'll need to reconnect to use it again.`)) return;
  try {
    await api(`/auth/${id}/disconnect`, { method: 'POST' });
    toast(`${platform?.name || id} disconnected`);
    refresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function refresh() {
  const { apiKey } = getSettings();
  if (!apiKey) {
    keyGateEl.hidden = false;
    gridEl.hidden = true;
    summaryPillEl.textContent = 'no key set';
    summaryPillEl.className = 'pill pill-muted';
    return;
  }
  keyGateEl.hidden = true;
  gridEl.hidden = false;
  try {
    const data = await api('/api/status');
    renderGrid(data.platforms);
  } catch (err) {
    toast(`Couldn't load status: ${err.message}`, 'error');
    summaryPillEl.textContent = 'error';
    summaryPillEl.className = 'pill pill-red';
  }
}

document.getElementById('refresh-btn').addEventListener('click', refresh);

// ---- detail modal (analytics / campaigns / create) ----

const detailModal = document.getElementById('detail-modal');
const detailTitle = document.getElementById('detail-title');

document.getElementById('detail-close').addEventListener('click', () => detailModal.close());

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'campaigns') loadCampaigns(currentPlatform);
  });
});

function openDetail(id) {
  currentPlatform = id;
  const platform = statusCache.find((p) => p.id === id);
  detailTitle.textContent = platform?.name || id;

  // Reset to the summary tab every time it's opened.
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'summary'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-summary'));

  setupCreateForm(id);
  loadSummary(id);
  detailModal.showModal();
}

function prettyJson(value) {
  return `<pre class="raw-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadSummary(id) {
  const el = document.getElementById('summary-content');
  el.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const data = await api(`/api/${id}/summary`);
    el.innerHTML = prettyJson(data.summary);
  } catch (err) {
    el.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
  }
}

// Best-effort extraction of campaign ids from wildly different per-platform
// response shapes, so we can offer clickable chips instead of forcing Mark
// to hunt through raw JSON for an id every time.
function extractCampaignRefs(campaigns) {
  if (!Array.isArray(campaigns)) return [];
  return campaigns.map((c, i) => {
    const id = c.id || c.resourceName || c.campaign?.resourceName || c.campaign?.id || null;
    const name = c.name || c.campaign?.name || `#${i}`;
    return id ? { id, name } : null;
  }).filter(Boolean);
}

async function loadCampaigns(id) {
  const el = document.getElementById('campaigns-content');
  el.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const data = await api(`/api/${id}/campaigns`);
    const refs = extractCampaignRefs(data.campaigns);
    el.innerHTML = `
      ${refs.length ? `<p class="hint">Click an id to load it into the box below.</p>
        <div class="card-actions">${refs.map((r) => `<button class="btn btn-ghost btn-sm" data-fill-id="${escapeHtml(r.id)}">${escapeHtml(r.name)}</button>`).join('')}</div>` : ''}
      <label style="display:block;margin-top:0.9rem;font-size:0.85rem;font-weight:600;">Campaign ID
        <input type="text" id="status-campaign-id" style="width:100%;margin-top:0.3rem;padding:0.5rem 0.6rem;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);" />
      </label>
      <div class="card-actions" style="margin-top:0.6rem;">
        <button class="btn btn-sm" id="pause-btn">Set PAUSED</button>
        <button class="btn btn-danger btn-sm" id="activate-btn">Set ACTIVE (spends money)</button>
      </div>
      <details style="margin-top:1rem;"><summary>Raw response</summary>${prettyJson(data.campaigns)}</details>
    `;
    el.querySelectorAll('[data-fill-id]').forEach((btn) => {
      btn.addEventListener('click', () => { document.getElementById('status-campaign-id').value = btn.dataset.fillId; });
    });
    document.getElementById('pause-btn').addEventListener('click', () => setStatus(id, 'PAUSED'));
    document.getElementById('activate-btn').addEventListener('click', () => setStatus(id, 'ACTIVE'));
  } catch (err) {
    el.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
  }
}

async function setStatus(id, status) {
  const campaignId = document.getElementById('status-campaign-id').value.trim();
  if (!campaignId) return toast('Enter a campaign id first', 'error');
  if (status === 'ACTIVE') {
    const platform = statusCache.find((p) => p.id === id);
    if (!confirm(`This will set campaign ${campaignId} on ${platform?.name || id} to ACTIVE and may start spending real money. Continue?`)) return;
  }
  try {
    await api(`/api/${id}/campaigns/${encodeURIComponent(campaignId)}/status`, { method: 'POST', body: { status } });
    toast(`Campaign ${campaignId} set to ${status}`, 'success');
    loadCampaigns(id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function setupCreateForm(id) {
  const hint = CAMPAIGN_HINTS[id] || { hint: '', placeholder: '{}' };
  document.getElementById('create-hint').textContent = hint.hint;
  const extra = document.getElementById('campaign-extra');
  extra.placeholder = hint.placeholder;
  extra.value = '';
  document.getElementById('campaign-name').value = '';
  document.querySelector('#create-campaign-form button[type="submit"]').disabled = Boolean(hint.disabled);
}

document.getElementById('create-campaign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('campaign-name').value.trim();
  const extraRaw = document.getElementById('campaign-extra').value.trim();
  let extra = {};
  if (extraRaw) {
    try { extra = JSON.parse(extraRaw); }
    catch { return toast('Additional fields must be valid JSON', 'error'); }
  }
  try {
    await api(`/api/${currentPlatform}/campaigns`, { method: 'POST', body: { name, ...extra } });
    toast('Campaign created (paused) ✓', 'success');
    document.querySelector('.tab-btn[data-tab="campaigns"]').click();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---- Marino 007: AI co-pilot chat ----
// Chats and can propose a campaign draft via the backend's
// propose_campaign_draft tool — never creates or activates anything itself.
// "Open in form" is the only bridge from a draft to a real action, and it
// just pre-fills the same create-campaign form a human would fill in by
// hand; submitting it is still a separate, manual click.

const LS_MARK_HISTORY = 'mhc_mark_history';
const markPanel = document.getElementById('mark-panel');
const markMessagesEl = document.getElementById('mark-messages');
const markForm = document.getElementById('mark-form');
const markInput = document.getElementById('mark-input');

let markHistory = [];
try { markHistory = JSON.parse(localStorage.getItem(LS_MARK_HISTORY) || '[]'); } catch { markHistory = []; }

function saveMarkHistory() {
  try { localStorage.setItem(LS_MARK_HISTORY, JSON.stringify(markHistory)); } catch { /* per-viewer convenience only */ }
}

function openDraftInForm(draft) {
  if (!draft?.platform) return;
  openDetail(draft.platform);
  document.querySelector('.tab-btn[data-tab="create"]').click();
  document.getElementById('campaign-name').value = draft.name || '';
  document.getElementById('campaign-extra').value = draft.fields ? JSON.stringify(draft.fields, null, 2) : '';
  markPanel.hidden = true;
}

function renderDraftCard(draft, index) {
  const platform = statusCache.find((p) => p.id === draft.platform);
  const fields = Object.entries(draft.fields || {});
  return `
    <div class="mark-draft">
      <div class="mark-draft-label">Campaign draft — ${escapeHtml(platform?.name || draft.platform)}</div>
      <dl>
        <dt>Name</dt><dd>${escapeHtml(draft.name || '')}</dd>
        ${fields.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}
      </dl>
      ${draft.rationale ? `<p class="hint" style="margin-top:.4rem;">${escapeHtml(draft.rationale)}</p>` : ''}
      <div class="mark-draft-actions">
        <button type="button" class="btn btn-primary btn-sm" data-draft-index="${index}">Open in form</button>
      </div>
    </div>
  `;
}

function renderMarkMessages() {
  if (markHistory.length === 0) {
    markMessagesEl.innerHTML = `<p class="mark-msg-empty">Ask Marino 007 about a connected platform, or for a campaign idea.
      He can draft a campaign for you to review — he never creates or activates anything himself.</p>`;
    return;
  }
  markMessagesEl.innerHTML = markHistory.map((msg, i) => {
    const isUser = msg.role === 'user';
    return `
      <div class="mark-msg ${isUser ? 'mark-msg-user' : msg.error ? 'mark-msg-error' : ''}">
        <span class="mark-avatar">${isUser ? 'Y' : 'M'}</span>
        <div style="min-width:0;">
          <div class="mark-msg-bubble">${escapeHtml(msg.content)}</div>
          ${msg.draft ? renderDraftCard(msg.draft, i) : ''}
        </div>
      </div>
    `;
  }).join('');
  markMessagesEl.querySelectorAll('[data-draft-index]').forEach((btn) => {
    btn.addEventListener('click', () => openDraftInForm(markHistory[Number(btn.dataset.draftIndex)]?.draft));
  });
  markMessagesEl.scrollTop = markMessagesEl.scrollHeight;
}

document.getElementById('mark-launcher').addEventListener('click', () => {
  markPanel.hidden = !markPanel.hidden;
  if (!markPanel.hidden) { renderMarkMessages(); markInput.focus(); }
});
document.getElementById('mark-close').addEventListener('click', () => { markPanel.hidden = true; });

markInput.addEventListener('input', () => {
  markInput.style.height = 'auto';
  markInput.style.height = Math.min(markInput.scrollHeight, 96) + 'px';
});
markInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); markForm.requestSubmit(); }
});

markForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = markInput.value.trim();
  if (!text) return;

  markHistory.push({ role: 'user', content: text });
  markInput.value = '';
  markInput.style.height = 'auto';
  const thinkingIndex = markHistory.length;
  markHistory.push({ role: 'assistant', content: '…' });
  saveMarkHistory();
  renderMarkMessages();

  const submitBtn = markForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const payload = markHistory
      .filter((m, i) => i !== thinkingIndex && !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
    const { reply, draft } = await api('/api/assistant/chat', { method: 'POST', body: { messages: payload } });
    markHistory[thinkingIndex] = { role: 'assistant', content: reply || '(no reply)', draft };
  } catch (err) {
    markHistory[thinkingIndex] = { role: 'assistant', content: err.message, error: true };
  }
  submitBtn.disabled = false;
  saveMarkHistory();
  renderMarkMessages();
});

// ---- boot ----

// Magic-link login: a personal link like ?key=... auto-saves that key to
// this browser and never touches the URL bar for more than an instant — so
// whoever it was shared with (e.g. Mark) doesn't have to copy-paste a key
// by hand, and it doesn't linger in their browser history/bookmarks as a
// visible query string afterward.
(function consumeMagicLink() {
  const params = new URLSearchParams(window.location.search);
  const magicKey = params.get('key');
  if (!magicKey) return;
  saveSettings(getSettings().baseUrl, magicKey);
  params.delete('key');
  const rest = params.toString();
  const cleanUrl = window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash;
  window.history.replaceState({}, '', cleanUrl);
})();

refresh();
