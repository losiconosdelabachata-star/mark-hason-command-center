'use strict';
require('./helpers/setupEnv');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const oauth = require('../src/oauthClient');

test('buildAuthUrl includes the required OAuth2 params', () => {
  const cfg = {
    id: 'demo',
    authorizeUrl: 'https://example.com/authorize',
    clientId: 'client-123',
    redirectUri: 'http://localhost:3000/auth/demo/callback',
    scope: 'read write',
  };
  const url = new URL(oauth.buildAuthUrl(cfg, 'state-abc'));
  assert.equal(url.origin + url.pathname, 'https://example.com/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client-123');
  assert.equal(url.searchParams.get('redirect_uri'), cfg.redirectUri);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'read write');
  assert.equal(url.searchParams.get('state'), 'state-abc');
});

test('buildAuthUrl respects clientIdParam override (TikTok uses client_key)', () => {
  const cfg = {
    authorizeUrl: 'https://example.com/authorize',
    clientId: 'ck-123',
    clientIdParam: 'client_key',
    redirectUri: 'http://localhost/cb',
    scope: 'x',
  };
  const url = new URL(oauth.buildAuthUrl(cfg, 'state'));
  assert.equal(url.searchParams.get('client_key'), 'ck-123');
  assert.equal(url.searchParams.has('client_id'), false);
});

test('buildAuthUrl adds extraAuthParams', () => {
  const cfg = {
    authorizeUrl: 'https://example.com/authorize',
    clientId: 'c',
    redirectUri: 'http://localhost/cb',
    scope: 'x',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  };
  const url = new URL(oauth.buildAuthUrl(cfg, 'state'));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
});

test('buildAuthUrl adds a PKCE code_challenge when usePKCE + verifier are given', () => {
  const cfg = {
    authorizeUrl: 'https://example.com/authorize',
    clientId: 'c',
    redirectUri: 'http://localhost/cb',
    scope: 'x',
    usePKCE: true,
  };
  const { verifier } = oauth.makePkcePair();
  const url = new URL(oauth.buildAuthUrl(cfg, 'state', verifier));
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('makePkcePair returns a fresh, distinct pair every call', () => {
  const a = oauth.makePkcePair();
  const b = oauth.makePkcePair();
  assert.notEqual(a.verifier, b.verifier);
  assert.notEqual(a.challenge, b.challenge);
  assert.ok(a.verifier.length > 0 && a.challenge.length > 0);
});

test('exchangeCode posts to tokenUrl and normalizes the response', async (t) => {
  const calls = [];
  t.mock.method(global, 'fetch', async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
    };
  });

  const cfg = {
    id: 'demo',
    tokenUrl: 'https://example.com/token',
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'http://localhost/cb',
  };
  const tokens = await oauth.exchangeCode(cfg, 'auth-code-123');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, cfg.tokenUrl);
  const body = new URLSearchParams(calls[0].opts.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'auth-code-123');
  assert.equal(body.get('client_id'), 'c');
  assert.equal(body.get('client_secret'), 's');

  assert.equal(tokens.accessToken, 'at');
  assert.equal(tokens.refreshToken, 'rt');
  assert.ok(tokens.expiresAt > Date.now());
});

test('exchangeCode with tokenAuthMethod "basic" sends an Authorization header, not body creds', async (t) => {
  const calls = [];
  t.mock.method(global, 'fetch', async (url, opts) => {
    calls.push(opts);
    return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'at', expires_in: 3600 }) };
  });

  const cfg = {
    id: 'reddit',
    tokenUrl: 'https://example.com/token',
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'http://localhost/cb',
    tokenAuthMethod: 'basic',
  };
  await oauth.exchangeCode(cfg, 'code');

  const expectedBasic = 'Basic ' + Buffer.from('c:s').toString('base64');
  assert.equal(calls[0].headers.Authorization, expectedBasic);
  const body = new URLSearchParams(calls[0].body);
  assert.equal(body.get('client_id'), null);
});

test('exchangeCode throws a clear error on a non-OK response', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ error: 'invalid_grant' }),
  }));
  const cfg = { id: 'demo', tokenUrl: 'https://example.com/token', clientId: 'c', clientSecret: 's', redirectUri: 'x' };
  await assert.rejects(() => oauth.exchangeCode(cfg, 'bad-code'), /invalid_grant/);
});

test('refreshAccessToken falls back to the original refresh token if the response omits one', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ access_token: 'new-at', expires_in: 3600 }),
  }));
  const cfg = { id: 'demo', tokenUrl: 'https://example.com/token', clientId: 'c', clientSecret: 's', redirectUri: 'x' };
  const tokens = await oauth.refreshAccessToken(cfg, 'old-refresh-token');
  assert.equal(tokens.accessToken, 'new-at');
  assert.equal(tokens.refreshToken, 'old-refresh-token');
});
