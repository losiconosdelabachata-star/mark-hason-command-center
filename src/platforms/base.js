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

async function send(method, url, headers, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${method} ${url} returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`${method} ${url} failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

/** Small fetch wrapper that throws with useful context on non-2xx responses. */
const apiGet = (url, headers) => send('GET', url, headers);
const apiPost = (url, headers, body) => send('POST', url, headers, body);
const apiPatch = (url, headers, body) => send('PATCH', url, headers, body);
const apiPut = (url, headers, body) => send('PUT', url, headers, body);
const apiPostForm = async (url, headers, formBody) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(formBody),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`POST ${url} returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`POST ${url} failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
};

/** Throws a clear, actionable error when a required env var (e.g. an ad account id) is missing. */
function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set.${hint ? ` ${hint}` : ''}`);
  }
  return value;
}

module.exports = { redirectUriFor, definePlatform, apiGet, apiPost, apiPatch, apiPut, apiPostForm, requireEnv };
