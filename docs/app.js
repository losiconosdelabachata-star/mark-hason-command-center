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
  twitch: { hint: "Not available — Twitch has no public self-serve ads/campaign API. This connection is analytics-only.", placeholder: '', disabled: true },
  kick: { hint: "Not available — Kick has no public ads/campaign API. This connection is analytics-only.", placeholder: '', disabled: true },
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

// ---- demo mode ----
// For showing the product to someone (a pitch, a walkthrough) before real
// credentials exist. Every number below is illustrative sample data, not
// Julieth's real figures — the persistent banner and pill say so everywhere
// this data surfaces, and it's never written anywhere the real dashboard
// would mistake it for a live account.
const LS_DEMO_MODE = 'mhc_demo_mode';
function isDemoMode() { try { return localStorage.getItem(LS_DEMO_MODE) === '1'; } catch { return false; } }
function setDemoMode(on) { try { localStorage.setItem(LS_DEMO_MODE, on ? '1' : '0'); } catch { /* per-viewer only */ } }

const DEMO_PLATFORM_META = {
  meta: { name: 'Meta (Facebook & Instagram)', category: 'social+ads' },
  google: { name: 'Google (YouTube, Google Ads, AdSense)', category: 'video+ads' },
  reddit: { name: 'Reddit', category: 'social+ads' },
  pinterest: { name: 'Pinterest', category: 'social+ads' },
  tiktok: { name: 'TikTok', category: 'social' },
  twitter: { name: 'X (Twitter)', category: 'social' },
  linkedin: { name: 'LinkedIn', category: 'social+ads' },
  snapchat: { name: 'Snapchat', category: 'social+ads' },
  twitch: { name: 'Twitch', category: 'social' },
  kick: { name: 'Kick', category: 'social' },
};

const DEMO_SUMMARY = {
  // Note: real Meta/YouTube APIs return these particular fields as STRINGS
  // (a well-documented quirk noted elsewhere in this file and the backend
  // README) — using real numbers here instead so the auto-chart actually
  // lights up for a demo/pitch. This is the one place demo data
  // deliberately diverges from a real API's exact response shape.
  meta: {
    pages: [{ name: 'Julieth Tapia Co', category: 'Artist', fan_count: 45213, instagram_business_account: { id: '17841400000000' } }],
    adAccounts: [{ name: 'Julieth Tapia Co Ads', amount_spent: 18450, currency: 'USD' }],
  },
  google: {
    youtube: [{ snippet: { title: 'Julieth Tapia Co' }, statistics: { subscriberCount: 8420, viewCount: 192300, videoCount: 64 } }],
    adsense: [{ displayName: 'Julieth Tapia Co AdSense' }],
    googleAds: { status: 'not_configured', note: 'Set GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID' },
  },
  reddit: { name: 'julitaco3', totalKarma: 4820, linkKarma: 3100, commentKarma: 1720 },
  pinterest: { username: 'julitaco3', followerCount: 12400, monthlyViews: 341000, accountType: 'BUSINESS' },
  tiktok: { display_name: 'Julieth Tapia Co', follower_count: 22100, likes_count: 187000, video_count: 96 },
  twitter: { username: 'julitaco3', metrics: { followers_count: 6700, following_count: 320, tweet_count: 1240 } },
  linkedin: { id: 'abc123', firstName: 'Julieth', lastName: 'Tapia' },
  snapchat: { display_name: 'Julieth Tapia Co', organization_id: 'org_9182' },
  twitch: { displayName: 'julitaco3', loginName: 'julitaco3', viewCount: 15600, followers: 890 },
  kick: { slug: 'julitaco3', followers_count: 540 },
};

const DEMO_CAMPAIGNS = {
  meta: [
    { id: '120211000001', name: 'Spring Floral Print Sale', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE', daily_budget: '2000' },
    { id: '120211000002', name: 'Instagram Engagement Boost', objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', daily_budget: '1500' },
  ],
  reddit: [{ id: 't_demo_1', name: 'r/painting launch push', configured_status: 'PAUSED', daily_budget_cents: 1000 }],
  pinterest: [{ id: 'pin_demo_1', name: 'Butterfly collection awareness', status: 'ACTIVE', daily_spend_cap: 1200 }],
  linkedin: [],
  snapchat: [{ id: 'snap_demo_1', name: 'Holiday gift bags', status: 'PAUSED' }],
};

const DEMO_GEO = {
  meta: [
    { country: 'US', impressions: 18400, clicks: 920, spend: 312.4 },
    { country: 'CO', impressions: 9200, clicks: 610, spend: 145.1 },
    { country: 'MX', impressions: 6100, clicks: 280, spend: 88.3 },
    { country: 'ES', impressions: 3400, clicks: 150, spend: 52.75 },
    { country: 'GB', impressions: 1800, clicks: 70, spend: 28.1 },
  ],
};

const DEMO_ASSISTANT_REPLY = {
  reply: "Julieth's Instagram and Pinterest are both trending up this month, and Meta's Spring Floral Print Sale campaign is your best performer — $312 spent in the US alone at a solid click rate. Colombia is your #2 market, right behind the US. Want me to draft a campaign to double down on that?",
  draft: {
    platform: 'meta',
    name: 'Colombia Floral Print Push',
    fields: { objective: 'OUTCOME_TRAFFIC' },
    rationale: 'Colombia is already your #2 country by reach with strong click-through — a dedicated campaign there could scale that momentum.',
  },
};

function demoStatusResponse() {
  return {
    platforms: Object.entries(DEMO_PLATFORM_META).map(([id, meta]) => ({ id, ...meta, configured: true, connected: true })),
    assistant: { configured: true },
  };
}

// Mirrors the real backend's response shapes exactly, so every render
// function downstream works unmodified whether the data is real or demo.
function demoResponse(path, method) {
  if (path.startsWith('/auth/')) {
    throw new Error('This is a demo — connecting/disconnecting real accounts is turned off here. Exit demo mode to use real credentials.');
  }
  if (path === '/api/status') return demoStatusResponse();
  if (path === '/api/assistant/chat' && method === 'POST') return DEMO_ASSISTANT_REPLY;
  if (path === '/api/summary') {
    return Object.fromEntries(Object.entries(DEMO_SUMMARY).map(([id, summary]) => [id, { status: 'ok', summary }]));
  }

  const summaryMatch = path.match(/^\/api\/([\w-]+)\/summary$/);
  if (summaryMatch) return { platform: summaryMatch[1], connected: true, summary: DEMO_SUMMARY[summaryMatch[1]] || {} };

  const geoMatch = path.match(/^\/api\/([\w-]+)\/geo$/);
  if (geoMatch) {
    const geo = DEMO_GEO[geoMatch[1]];
    if (!geo) throw new Error(`${DEMO_PLATFORM_META[geoMatch[1]]?.name || geoMatch[1]} doesn't have a geographic breakdown wired up yet.`);
    return { platform: geoMatch[1], geo };
  }

  const campaignsMatch = path.match(/^\/api\/([\w-]+)\/campaigns$/);
  if (campaignsMatch && method === 'GET') {
    if (!(campaignsMatch[1] in DEMO_CAMPAIGNS)) throw new Error(`${DEMO_PLATFORM_META[campaignsMatch[1]]?.name || campaignsMatch[1]} doesn't support campaign listing yet.`);
    return { platform: campaignsMatch[1], campaigns: DEMO_CAMPAIGNS[campaignsMatch[1]] };
  }
  if (campaignsMatch && method === 'POST') {
    return { platform: campaignsMatch[1], status: 'PAUSED', campaign: { id: `demo_${Date.now()}`, status: 'PAUSED' } };
  }

  const statusChangeMatch = path.match(/^\/api\/([\w-]+)\/campaigns\/[^/]+\/status$/);
  if (statusChangeMatch) return { platform: statusChangeMatch[1], result: { success: true } };

  throw new Error('This endpoint has no demo data yet.');
}

// ---- API ----

async function api(path, { method = 'GET', body } = {}) {
  if (isDemoMode()) return demoResponse(path, method, body);

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

// ---- demo mode ----

function updateDemoUI() {
  const on = isDemoMode();
  document.getElementById('demo-banner').hidden = !on;
  document.getElementById('exit-demo-btn').hidden = !on;
}

function enterDemoMode() {
  setDemoMode(true);
  toast("Demo mode on — showing sample data.", 'success');
  refresh();
}

function exitDemoMode() {
  setDemoMode(false);
  toast('Demo mode off.');
  refresh();
}

document.getElementById('view-demo-btn').addEventListener('click', enterDemoMode);
document.getElementById('exit-demo-btn').addEventListener('click', exitDemoMode);
document.getElementById('demo-banner-exit').addEventListener('click', exitDemoMode);

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
    <article class="card" data-platform="${p.id}" data-connected="${p.connected}">
      <div class="card-head">
        <div>
          <h3>${p.name}</h3>
          <p class="card-category">${p.category}</p>
        </div>
        ${statusPill(p)}
      </div>
      ${p.connected ? `<div data-metric-for="${p.id}"></div>` : ''}
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

  loadOverview(platforms);
}

// ---- overview: the "wow at a glance" strip above the platform grid ----
// Deliberately hidden when nothing is connected — no fabricated zeros.

function formatCompactNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

// Picks the single biggest numeric field in a summary as that platform's
// "headline" number for the at-a-glance view — real per-platform semantics
// (is fan_count more meaningful than amount_spent?) would need per-platform
// logic this project has deliberately avoided elsewhere, so "biggest number"
// is the same kind of honest, generic heuristic as extractNumericFields itself.
function headlineMetric(summary) {
  const numeric = extractNumericFields(summary);
  if (!numeric.length) return null;
  return numeric.reduce((best, cur) => (cur.value > best.value ? cur : best));
}

let overviewChart = null;

async function loadOverview(platforms) {
  const section = document.getElementById('overview-section');
  const connected = platforms.filter((p) => p.connected);
  if (connected.length === 0) {
    section.hidden = true;
    if (overviewChart) { overviewChart.destroy(); overviewChart = null; }
    return;
  }
  section.hidden = false;
  document.getElementById('stat-connected').textContent = `${connected.length}/${platforms.length}`;

  try {
    const summaries = await api('/api/summary');
    let totalReach = 0;
    const chartRows = [];
    for (const p of connected) {
      const entry = summaries[p.id];
      if (!entry || entry.status !== 'ok') continue;
      const metric = headlineMetric(entry.summary);
      if (!metric) continue;
      totalReach += metric.value;
      chartRows.push({ label: p.name, value: metric.value });
      const slot = document.querySelector(`[data-metric-for="${p.id}"]`);
      if (slot) {
        const shortLabel = metric.label.split(/[. ]/).pop().replace(/_/g, ' ');
        slot.innerHTML = `<div class="card-metric">${formatCompactNumber(metric.value)}</div><div class="card-metric-label">${escapeHtml(shortLabel)}</div>`;
      }
    }
    document.getElementById('stat-reach').textContent = totalReach > 0 ? formatCompactNumber(totalReach) : '—';

    if (overviewChart) { overviewChart.destroy(); overviewChart = null; }
    if (chartRows.length && window.Chart) {
      overviewChart = new Chart(document.getElementById('overview-chart'), {
        type: 'bar',
        data: {
          labels: chartRows.map((r) => r.label),
          datasets: [{ data: chartRows.map((r) => r.value), backgroundColor: themeColor('--accent'), borderRadius: 6 }],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: themeColor('--text-muted') }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: themeColor('--text-muted') }, grid: { color: themeColor('--border') } },
          },
        },
      });
    }
  } catch (err) {
    toast(`Couldn't load overview: ${err.message}`, 'error');
  }
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
  updateDemoUI();
  const { apiKey } = getSettings();
  if (!apiKey && !isDemoMode()) {
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

// Best-effort: walk a summary object (up to 3 levels deep, arrays included)
// collecting real numeric leaf values, so whatever numbers a platform
// actually returns get a chart for free with no per-platform chart code.
// 3 levels because a real shape like Google's {youtube: [{statistics:
// {subscriberCount}}]} is object -> array -> object -> the number — 2
// wasn't enough and silently produced no chart for Google at all.
// Doesn't catch numeric-looking strings (e.g. YouTube's stats-as-strings) —
// deliberately conservative rather than guessing which strings are metrics.
function extractNumericFields(obj, prefix = '', depth = 0, out = []) {
  if (!obj || typeof obj !== 'object' || depth > 3) return out;

  if (Array.isArray(obj)) {
    // Meta's (and others') summaries are often {pages: [...], adAccounts: [...]}
    // — the numbers live inside array items, not at the top level. Cap at 3
    // items so a long list doesn't turn the chart into an unreadable wall of
    // bars. Only disambiguate with the item's own name when there's more
    // than one — the common case (one page, one ad account) should read as
    // a short "pages fan_count", not a needlessly bracketed single-item label.
    const items = obj.slice(0, 3);
    items.forEach((item, i) => {
      const itemLabel = items.length > 1 ? item?.name || item?.username || item?.title || item?.display_name || i : null;
      extractNumericFields(item, itemLabel != null ? `${prefix} #${itemLabel}` : prefix, depth + 1, out);
    });
    return out;
  }

  for (const [key, value] of Object.entries(obj)) {
    const label = prefix ? `${prefix} ${key}` : key;
    if (typeof value === 'number' && Number.isFinite(value)) {
      out.push({ label, value });
    } else if (value && typeof value === 'object') {
      extractNumericFields(value, label, depth + 1, out);
    }
  }
  return out;
}

function themeColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

let summaryChart = null; // Chart.js instance — destroy before replacing, or it errors on re-render

async function loadSummary(id) {
  const el = document.getElementById('summary-content');
  el.innerHTML = '<p class="hint">Loading…</p>';
  if (summaryChart) { summaryChart.destroy(); summaryChart = null; }
  try {
    const data = await api(`/api/${id}/summary`);
    const numeric = extractNumericFields(data.summary);
    el.innerHTML = `
      ${numeric.length ? `<div style="height:${Math.max(120, numeric.length * 42)}px;"><canvas id="summary-chart" role="img" aria-label="Chart of numeric analytics fields"></canvas></div>` : ''}
      <details ${numeric.length ? '' : 'open'} style="margin-top:${numeric.length ? '1rem' : '0'};">
        <summary>Raw response</summary>${prettyJson(data.summary)}
      </details>
    `;
    if (numeric.length && window.Chart) {
      summaryChart = new Chart(document.getElementById('summary-chart'), {
        type: 'bar',
        data: {
          labels: numeric.map((n) => n.label),
          datasets: [{ data: numeric.map((n) => n.value), backgroundColor: themeColor('--accent'), borderRadius: 4 }],
        },
        options: {
          indexAxis: 'y',
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { color: themeColor('--text-muted') }, grid: { color: themeColor('--border') } },
            y: { ticks: { color: themeColor('--text') }, grid: { display: false } },
          },
        },
      });
    }
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
      <div style="margin-top:1.1rem;">
        <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.4rem;">Geographic reach (last 30 days)</label>
        <div id="geo-map-section"><p class="hint">Loading…</p></div>
      </div>
      <details style="margin-top:1rem;"><summary>Raw response</summary>${prettyJson(data.campaigns)}</details>
    `;
    el.querySelectorAll('[data-fill-id]').forEach((btn) => {
      btn.addEventListener('click', () => { document.getElementById('status-campaign-id').value = btn.dataset.fillId; });
    });
    document.getElementById('pause-btn').addEventListener('click', () => setStatus(id, 'PAUSED'));
    document.getElementById('activate-btn').addEventListener('click', () => setStatus(id, 'ACTIVE'));
    loadGeoMap(id);
  } catch (err) {
    el.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
  }
}

// jsvectormap's `series.regions[].scale` is an ORDINAL lookup (exact value
// -> color), not a continuous gradient — there's no normalizeFunction/range
// interpolation in this library despite the option existing in its config
// shape. So the gradient has to be computed by hand: bucket every region's
// raw value to its own pre-computed color, keyed by that exact value, and
// let the ordinal lookup do the rest. (Found this the hard way — the first
// version rendered every region solid black because scale.getValue(12000)
// on a 2-element array is just array[12000], i.e. undefined.)
function lerpColor(hexA, hexB, t) {
  const a = hexA.match(/\w\w/g).map((h) => parseInt(h, 16));
  const b = hexB.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// Country-level ad reach map. Only Meta has this wired up on the backend
// (see backend README) — every other platform's /geo call 501s with a
// clear message, rendered here as plain text rather than an empty map.
async function loadGeoMap(id) {
  const container = document.getElementById('geo-map-section');
  if (!container) return; // tab switched away before this resolved
  try {
    const data = await api(`/api/${id}/geo`);
    const geo = data.geo || [];
    if (!geo.length) {
      container.innerHTML = '<p class="hint">No geographic data in the last 30 days.</p>';
      return;
    }

    const metricOf = (row) => row.impressions ?? row.clicks ?? row.spend ?? 0;
    const nums = geo.map(metricOf);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const lowColor = themeColor('--surface-2');
    const highColor = themeColor('--accent');

    const values = {};
    const scale = {}; // ordinal lookup: exact raw value -> its interpolated color
    for (const row of geo) {
      if (!row.country) continue;
      const v = metricOf(row);
      values[row.country] = v;
      const t = max === min ? 1 : (v - min) / (max - min);
      scale[v] = lerpColor(lowColor, highColor, t);
    }

    container.innerHTML = '<div id="geo-map-canvas" style="height:280px;"></div>';
    window.jsVectorMap({
      selector: '#geo-map-canvas',
      map: 'world',
      backgroundColor: 'transparent',
      zoomButtons: false,
      regionStyle: {
        initial: { fill: themeColor('--gray-bg'), stroke: themeColor('--border') },
        hover: { fill: themeColor('--mark') },
      },
      series: { regions: [{ values, scale, attribute: 'fill' }] },
      onRegionTooltipShow(event, tooltip, code) {
        if (values[code] != null) tooltip.text(`${tooltip.text()}: ${values[code].toLocaleString()} impressions`, false);
      },
    });
  } catch (err) {
    // A 501 ("not wired up for this platform") reads the same as any other
    // error here — plain, honest text, no broken empty map underneath it.
    container.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
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
