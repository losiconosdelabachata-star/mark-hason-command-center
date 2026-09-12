# Mark Hason Command Center — backend

A single backend that connects Julieth Tapia Co's (@julitaco3) marketing
accounts — Meta (Facebook/Instagram), Google (YouTube, Google Ads, AdSense),
Reddit, Pinterest, TikTok, X, LinkedIn, and Snapchat — through each
platform's real OAuth2 flow, and exposes one consistent API for pulling
analytics summaries.

**This repo is the backend/API only.** It has no UI yet — the dashboard
frontend for Mark to actually look at is a separate piece of work, built
once this backend is deployed and at least one platform is connected end to
end. See [Architecture](#architecture) for why they're split.

## Live deployment

- **Dashboard (open this one):** https://losiconosdelabachata-star.github.io/mark-hason-command-center/
- **Backend API:** https://mark-hason-command-center-production.up.railway.app

The dashboard is a static page (this repo's `docs/` folder, served by GitHub
Pages) that talks to the backend over its JSON API. **The repo is public**
so free GitHub Pages hosting works — there are no real secrets in it (the
admin key and every platform's client secret live only in Railway's env
vars and, for the admin key, the browser of whoever opens the dashboard).

`ADMIN_API_KEYS` on the backend is comma-separated, so each person gets
their **own** key instead of sharing one — easy to tell apart in logs and to
revoke individually later. Mark's personal link is:

```
https://losiconosdelabachata-star.github.io/mark-hason-command-center/?key=<his-key>
```

Opening that link auto-saves his key to his browser's localStorage and
immediately scrubs `?key=...` from the address bar (so it doesn't linger in
history or get bookmarked in plain sight) — he never has to copy-paste
anything. Anyone opening the dashboard without a `?key=` still gets the
normal "enter admin key" prompt and can paste one in by hand via Settings.

The backend URL only answers `GET /` with no key. Every `/auth/*` and
`/api/*` route requires the `x-api-key` header — treat that key like a
password (store it in a password manager, don't paste it into chat tools or
commit it anywhere).

**Both halves auto-deploy on push to `master`, through two different
mechanisms:**
- The dashboard (`docs/`) is rebuilt by GitHub Pages automatically on any
  push that touches it.
- The backend deploys via `.github/workflows/deploy.yml` — it waits for
  `.github/workflows/test.yml` to pass, then runs `railway up` using a
  `RAILWAY_TOKEN` repo secret. (We went this route instead of Railway's own
  GitHub integration because that needs its GitHub App installed with
  access to this repo via a one-time browser consent step, which — as this
  README once incorrectly claimed was already done — is easy to think
  you've set up when you haven't. A repo secret is easy to verify from the
  CLI: `gh secret list`.)

To set up or rotate that secret: Railway dashboard → this project →
Settings → Tokens → create a Project Token scoped to the production
environment, then:

```bash
gh secret set RAILWAY_TOKEN --repo losiconosdelabachata-star/mark-hason-command-center
```

Manual deploy still works any time you want to force one without waiting
for CI:

```bash
railway login      # first time only, on whichever machine is deploying
railway link        # select: mark-hason-command-center
railway up
```

To add or rotate a platform's credentials once Mark has them:

```bash
railway variables --set "META_CLIENT_ID=..." --set "META_CLIENT_SECRET=..."
```

Setting a variable triggers an automatic redeploy.

## Status: scaffold, not yet connected to any real account

Every platform module implements the real OAuth2 endpoints and a real
analytics call for that provider, but **no credentials are configured yet**.
Nothing here can access Julieth's actual accounts until someone (Mark)
registers a developer app on each platform they want and supplies the
resulting client id/secret. Until then, `/api/status` reports every
platform as `configured: false` and the server runs safely with zero risk of
touching a live account.

## Marino 007 — the AI co-pilot

The dashboard has a chat widget (bottom-left) for "Marino 007," an AI
co-pilot backed by the Anthropic API. His scope is deliberately narrow:

- He can see every platform's connection status and chat about it.
- He can **propose a campaign draft** (via a `propose_campaign_draft` tool
  call) — the dashboard renders that as a card with an **"Open in form"**
  button, which pre-fills the real create-campaign form. A human still has
  to review it and click Create, then separately click Activate. Nothing
  Marino says can create, activate, or pause a campaign by itself — the code
  literally has no path from his tool output into `src/platforms/*.js`.
- Chat history persists in the browser (localStorage) per viewer, same
  pattern as the admin key and backend URL.

Configure with `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default
`claude-sonnet-5`) — until set, the chat widget clearly reports Marino 007 as
not configured instead of failing silently. See `src/assistant.js` for the
system prompt and tool definition.

## Why this isn't just a GitHub Pages site

GitHub Pages only serves static files — it cannot run server code or hold
secrets. Every platform here requires a client secret and, once connected, a
refresh token — both of which must stay server-side and encrypted. Exposing
them in client-side JavaScript (what GitHub Pages would force) means anyone
who views the page source can read them, including on ad accounts that can
spend money. So this backend needs a real host (Render, Railway, Vercel,
Fly.io, etc.) with environment-variable secrets support — the source still
lives in this GitHub repo either way, and a future static frontend (e.g. on
GitHub Pages) would call this backend's API rather than talking to the
platforms directly.

## Setup

```bash
npm install
cp .env.example .env
```

Generate the two secrets `.env` needs regardless of which platforms you connect:

```bash
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ADMIN_API_KEYS=' + require('crypto').randomBytes(24).toString('hex'))"
```

Paste both into `.env`. `ADMIN_API_KEYS` is the `x-api-key` header every
`/auth/*` and `/api/*` request must send — without it the server refuses
those routes outright (fails closed).

### Connecting a platform

For each platform you want, `.env.example` has the exact env var names and a
link to where to register a developer app. In short, for every platform:

1. Register an app in that platform's developer console.
2. Set the redirect/callback URL to `<PUBLIC_BASE_URL>/auth/<platform-id>/callback`
   (e.g. `http://localhost:3000/auth/meta/callback` for local dev).
3. Copy the client id + secret into `.env`.
4. Restart the server, then visit (with your API key) `/auth/<platform-id>/start`.

Platform ids: `meta`, `google`, `reddit`, `pinterest`, `tiktok`, `twitter`,
`linkedin`, `snapchat`.

Several platforms (Meta ads scopes, Google Ads, LinkedIn Marketing,
Snapchat, TikTok Business) require a business-verification / app-review step
on their side before campaign-level (not just read-only) access actually
works — that approval is outside this repo and can take from same-day to a
few weeks depending on the platform. `/api/status` will show a platform as
connected as soon as basic OAuth succeeds even if a deeper ads scope is
still pending review.

### Run it

```bash
npm start
```

Then, sending your `ADMIN_API_KEYS` value as the `x-api-key` header:

```
GET  /api/status                              → connection state of every platform
GET  /auth/:platform/start                    → begin that platform's OAuth flow
POST /auth/:platform/disconnect               → forget stored tokens for that platform
GET  /api/:platform/summary                   → analytics snapshot for one connected platform
GET  /api/summary                             → snapshot for every connected platform at once
GET  /api/:platform/campaigns                 → list existing campaigns
POST /api/:platform/campaigns                 → create a campaign (always PAUSED — see below)
POST /api/:platform/campaigns/:id/status      → { "status": "ACTIVE" | "PAUSED" } — the only call that can start spend
POST /api/assistant/chat                      → { "messages": [{role, content}] } → { reply, draft? } — chat with Marino 007
```

### Campaign creation — paused by default, on purpose

`POST /api/:platform/campaigns` always creates the campaign in a **paused /
draft** state on the platform, regardless of what's in the request body.
Nothing here ever turns spend on as a side effect of creating something.
Going live is a separate, explicit call: `POST
/api/:platform/campaigns/:id/status` with `{"status": "ACTIVE"}`. Treat that
one endpoint as the "this spends real money" button when wiring up the
frontend — everything before it is safe to click around in.

Per-platform request bodies for `POST /api/:platform/campaigns` (see each
`src/platforms/*.js` for the authoritative shape — these APIs are exactly
what each provider's real Ads API expects, but none have been exercised
against a live account yet, so double-check the field names against that
platform's current docs the first time you actually connect it):

| platform  | required body fields |
|-----------|----------------------|
| meta      | `name`, `objective` (e.g. `OUTCOME_TRAFFIC`) |
| google    | `name`, `dailyBudgetMicros` (1 USD = 1,000,000) |
| reddit    | `name`, `objective`, `dailyBudgetCents` |
| pinterest | `name`, `objectiveType`, `dailySpendCapCents` |
| linkedin  | `name`, `campaignGroupUrn` (create the group in Campaign Manager first), `dailyBudgetAmount` |
| snapchat  | `name`, `objective` |
| tiktok    | not wired up — see note below |
| twitter   | not wired up — see note below |

**TikTok and X/Twitter campaign endpoints deliberately throw an explanatory
error instead of a fake success.** Their Ads APIs authenticate completely
differently from the consumer login flow already implemented here (TikTok
Marketing API needs a separate TikTok-for-Business OAuth app; X Ads API uses
OAuth 1.0a, not the OAuth 2.0 token used for X analytics). Wiring those up
is a distinct, small follow-up once Mark decides he actually wants ads on
those two specifically — flagged here rather than silently built as
something that would fail confusingly later.

Every platform also needs its ad-account id set in `.env` before campaign
routes work at all (`META_AD_ACCOUNT_ID`, `GOOGLE_ADS_CUSTOMER_ID`, etc. —
see `.env.example`) — `/api/:platform/campaigns` returns a clear error
naming exactly which one is missing rather than failing silently.

## Architecture

```
server.js                  Express app, mounts /auth and /api
src/oauthClient.js         Generic OAuth2 (+ PKCE) authorize/exchange/refresh
src/tokenStore.js          Encrypted-at-rest token storage (single JSON file)
src/crypto.js              AES-256-GCM helpers backing the token store
src/middleware/            Admin API key gate
src/platforms/*.js         One config + getSummary() per platform
src/assistant.js           Marino 007 — system prompt, propose_campaign_draft tool, Anthropic API call
src/routes/auth.js         /auth/:platform/start|callback|disconnect
src/routes/api.js          /api/status, /api/:platform/summary, /api/summary
src/routes/assistant.js    /api/assistant/chat
```

Adding a platform means adding one file under `src/platforms/` with its
OAuth endpoints, scope, and a `getSummary()` — nothing else in the app needs
to change; `src/platforms/index.js` picks it up automatically.

## Testing

```bash
npm test
```

Uses Node's built-in test runner (`node --test`) — no test framework
dependency. Runs on every push/PR via GitHub Actions
(`.github/workflows/test.yml`). Covers: encryption round-trips and tamper
detection, the OAuth2 client (PKCE, both token-auth styles, refresh
fallback), every platform's config/interface/validation logic (including
that TikTok and X correctly refuse instead of attempting a mismatched-auth
call), Marino 007's system prompt/tool-call parsing, the API-key middleware, the
token store, and end-to-end route behavior against a real Express instance
on an ephemeral port. Nothing here needs real platform or Anthropic
credentials — nothing in this suite makes a real network call to
Meta/Google/Anthropic/etc.

## Deploying

Currently deployed on **Railway** (see [Live deployment](#live-deployment)
above) — a good fit since it runs this as a plain persistent Node process,
no code changes needed. `PUBLIC_BASE_URL` is already set to match the
Railway domain; if you ever move it to a different host or custom domain,
update `PUBLIC_BASE_URL` first and then update every connected platform's
redirect URI registration to match before reconnecting.

## Security notes

- Tokens are encrypted at rest (AES-256-GCM) and never logged.
- All `/auth/*` and `/api/*` routes require the `x-api-key` header — the
  server fails closed if `ADMIN_API_KEYS` isn't set, rather than defaulting
  open.
- `.env` and `data/` (the encrypted token store + local dev encryption key)
  are gitignored — never commit real credentials or tokens.
- Campaigns are always created **paused**. The only endpoint that can start
  spend is the explicit `POST /api/:platform/campaigns/:id/status` call —
  nothing else in this backend flips a campaign live as a side effect.
- TikTok and X campaign endpoints refuse to run rather than silently fail —
  their Ads APIs need credentials this backend doesn't collect yet (see
  "Campaign creation" above).

## Roadmap

1. ✅ OAuth + encrypted token storage + read-only analytics summaries.
2. ✅ Campaign create/list/activate endpoints for Meta, Google Ads, Reddit,
   Pinterest, LinkedIn, Snapchat — paused-by-default, one explicit call to
   go live.
3. Pick which platforms Julieth/Mark actually want live (all 8 are
   scaffolded for analytics; 6 of 8 for campaigns — not all need real
   credentials right away).
4. Deploy the backend somewhere with secret support (Render/Railway/Vercel).
5. Build the dashboard frontend (separate piece, per your earlier direction)
   that calls this backend's `/api/summary` and campaign endpoints.
6. If needed: TikTok-for-Business and X Ads API (OAuth 1.0a) connections,
   which are structurally separate from the analytics connections already
   built for those two platforms.
