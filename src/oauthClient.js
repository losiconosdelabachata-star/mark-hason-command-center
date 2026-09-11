// Generic OAuth 2.0 authorization-code-grant client, config-driven so every
// platform in src/platforms/*.js can reuse it instead of reimplementing the
// dance. Handles the two flavors that differ across providers:
//   - tokenAuthMethod: 'body' (client_id/secret in the POST body — most
//     providers) vs 'basic' (HTTP Basic auth header — Reddit).
//   - PKCE (required by X/Twitter, optional-but-fine for others).
'use strict';

const crypto = require('crypto');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makePkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * @param {object} cfg platform config (see src/platforms/*.js)
 * @param {string} state CSRF state token
 * @param {string} [pkceVerifier] pass the verifier back in for the callback leg
 */
function buildAuthUrl(cfg, state, pkceVerifier) {
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set(cfg.clientIdParam || 'client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', state);
  if (cfg.extraAuthParams) {
    for (const [k, v] of Object.entries(cfg.extraAuthParams)) url.searchParams.set(k, v);
  }
  if (cfg.usePKCE && pkceVerifier) {
    const challenge = base64url(crypto.createHash('sha256').update(pkceVerifier).digest());
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

async function tokenRequest(cfg, params) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams(params);

  if (cfg.tokenAuthMethod === 'basic') {
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
    headers['User-Agent'] = cfg.userAgent || 'mark-hason-command-center/0.1';
  } else {
    // Most providers use client_id/client_secret; a few (TikTok) use
    // different field names — cfg.clientIdParam/clientSecretParam let a
    // platform module override without a whole new auth method.
    body.set(cfg.clientIdParam || 'client_id', cfg.clientId);
    body.set(cfg.clientSecretParam || 'client_secret', cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${cfg.id}: token endpoint returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`${cfg.id}: token request failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function exchangeCode(cfg, code, pkceVerifier) {
  const params = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
  };
  if (cfg.usePKCE && pkceVerifier) params.code_verifier = pkceVerifier;
  if (cfg.extraTokenParams) Object.assign(params, cfg.extraTokenParams);

  const json = await tokenRequest(cfg, params);
  return normalizeTokenResponse(json);
}

async function refreshAccessToken(cfg, refreshToken) {
  const json = await tokenRequest(cfg, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return normalizeTokenResponse(json, refreshToken);
}

function normalizeTokenResponse(json, fallbackRefreshToken) {
  const expiresInSec = Number(json.expires_in) || 3600;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || fallbackRefreshToken || null,
    tokenType: json.token_type || 'bearer',
    scope: json.scope || null,
    obtainedAt: Date.now(),
    expiresAt: Date.now() + expiresInSec * 1000,
  };
}

module.exports = { buildAuthUrl, exchangeCode, refreshAccessToken, makePkcePair };
