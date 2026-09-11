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

## Status: scaffold, not yet connected to any real account

Every platform module implements the real OAuth2 endpoints and a real
analytics call for that provider, but **no credentials are configured yet**.
Nothing here can access Julieth's actual accounts until someone (Mark)
registers a developer app on each platform they want and supplies the
resulting client id/secret. Until then, `/api/status` reports every
platform as `configured: false` and the server runs safely with zero risk of
touching a live account.

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
GET  /api/status                 → connection state of every platform
GET  /auth/:platform/start       → begin that platform's OAuth flow
POST /auth/:platform/disconnect  → forget stored tokens for that platform
GET  /api/:platform/summary      → analytics snapshot for one connected platform
GET  /api/summary                → snapshot for every connected platform at once
```

## Architecture

```
server.js                  Express app, mounts /auth and /api
src/oauthClient.js         Generic OAuth2 (+ PKCE) authorize/exchange/refresh
src/tokenStore.js          Encrypted-at-rest token storage (single JSON file)
src/crypto.js              AES-256-GCM helpers backing the token store
src/middleware/            Admin API key gate
src/platforms/*.js         One config + getSummary() per platform
src/routes/auth.js         /auth/:platform/start|callback|disconnect
src/routes/api.js          /api/status, /api/:platform/summary, /api/summary
```

Adding a platform means adding one file under `src/platforms/` with its
OAuth endpoints, scope, and a `getSummary()` — nothing else in the app needs
to change; `src/platforms/index.js` picks it up automatically.

## Deploying

Any host that supports environment variables and a long-running (or
serverless) Node process works — Render and Railway are the simplest for a
plain Express app like this. Set `PUBLIC_BASE_URL` to the deployed URL and
update each platform's redirect URI registration to match before
reconnecting.

## Security notes

- Tokens are encrypted at rest (AES-256-GCM) and never logged.
- All `/auth/*` and `/api/*` routes require the `x-api-key` header — the
  server fails closed if `ADMIN_API_KEYS` isn't set, rather than defaulting
  open.
- `.env` and `data/` (the encrypted token store + local dev encryption key)
  are gitignored — never commit real credentials or tokens.
- This backend only ever *reads* analytics by default. None of the
  `getSummary()` calls place spend or launch a campaign — building actual
  campaign-creation endpoints is a deliberate next step, not something to
  wire up silently.

## Roadmap

1. ✅ OAuth + encrypted token storage + read-only analytics summaries (this repo).
2. Pick which platforms Julieth/Mark actually want live (all 8 are scaffolded;
   not all need real credentials).
3. Deploy the backend somewhere with secret support (Render/Railway/Vercel).
4. Build the dashboard frontend (separate piece, per your earlier direction) that
   calls this backend's `/api/summary`.
5. Only after review: campaign-creation/write endpoints, kept behind extra
   confirmation since they spend real money.
