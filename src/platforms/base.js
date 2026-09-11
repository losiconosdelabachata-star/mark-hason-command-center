// Shared scaffolding every platform module builds on top of.
'use strict';

function redirectUriFor(platformId) {
  const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/auth/${platformId}/callback`;
}

/**
 * Wrap a platform config with the bits every module needs: env-driven
 * credentials, a computed redirect_uri, and an isConfigured() check the
 * routes/status endpoint uses to hide platforms nobody has set up yet.
 */
function definePlatform(def) {
  return {
    ...def,
    redirectUri: redirectUriFor(def.id),
    isConfigured() {
      return Boolean(def.clientId && def.clientSecret);
    },
  };
}

/** Small fetch wrapper that throws with useful context on non-2xx responses. */
async function apiGet(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`GET ${url} returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`GET ${url} failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

module.exports = { redirectUriFor, definePlatform, apiGet };
