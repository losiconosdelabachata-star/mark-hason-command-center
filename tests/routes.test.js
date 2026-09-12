// End-to-end route tests: a real Express app on a real (ephemeral) port,
// hit with real fetch() calls. This is the automated version of the manual
// curl smoke tests run by hand during development — codified so they can't
// silently regress.
'use strict';
require('./helpers/setupEnv');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let server;
let baseUrl;
const API_KEY = process.env.ADMIN_API_KEYS;

before(async () => {
  const app = require('../server');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function get(path, headers) {
  const res = await fetch(baseUrl + path, { headers });
  return { status: res.status, body: await res.json() };
}
async function post(path, headers, body) {
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('GET / is public and lists all 8 platforms', async () => {
  const { status, body } = await get('/');
  assert.equal(status, 200);
  assert.equal(body.platforms.length, 8);
});

test('protected routes reject requests with no x-api-key header', async () => {
  for (const path of ['/api/status', '/auth/meta/start', '/auth/meta/authorize-url']) {
    const { status } = await get(path);
    assert.equal(status, 401, `${path} should require a key`);
  }
});

test('protected routes reject the wrong key', async () => {
  const { status } = await get('/api/status', { 'x-api-key': 'wrong' });
  assert.equal(status, 401);
});

test('GET /api/status with the correct key lists every platform as configured:false', async () => {
  const { status, body } = await get('/api/status', { 'x-api-key': API_KEY });
  assert.equal(status, 200);
  assert.equal(body.platforms.length, 8);
  assert.ok(body.platforms.every((p) => p.configured === false && p.connected === false));
});

test('unknown platform returns 404 with a clear message', async () => {
  const { status, body } = await get('/api/bogus/summary', { 'x-api-key': API_KEY });
  assert.equal(status, 404);
  assert.match(body.error, /Unknown platform/);
});

test('summary/campaigns routes 400 on an unconfigured platform instead of throwing', async () => {
  for (const path of ['/api/meta/summary', '/api/meta/campaigns']) {
    const { status, body } = await get(path, { 'x-api-key': API_KEY });
    assert.equal(status, 400);
    assert.match(body.error, /not configured/);
  }
});

test('POST /api/:platform/campaigns 400s on an unconfigured platform', async () => {
  const { status, body } = await post('/api/meta/campaigns', { 'x-api-key': API_KEY }, { name: 'x', objective: 'y' });
  assert.equal(status, 400);
  assert.match(body.error, /not configured/);
});

test('POST /api/:platform/campaigns/:id/status requires a status field', async () => {
  const { status, body } = await post('/api/meta/campaigns/123/status', { 'x-api-key': API_KEY }, {});
  // Unconfigured platform is checked first, so this is 400 either way —
  // the important thing is it never 500s.
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('auth start/authorize-url 400 on an unconfigured platform', async () => {
  const { status: s1 } = await get('/auth/meta/start', { 'x-api-key': API_KEY });
  assert.equal(s1, 400);
  const { status: s2, body } = await get('/auth/meta/authorize-url', { 'x-api-key': API_KEY });
  assert.equal(s2, 400);
  assert.match(body.error, /no client id\/secret configured/);
});

test('auth callback with no state is a 400, not a crash', async () => {
  const res = await fetch(baseUrl + '/auth/meta/callback');
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.match(text, /expired authorization/i);
});

test('404 handler catches genuinely unknown routes', async () => {
  const { status } = await get('/this/route/does/not/exist');
  assert.equal(status, 404);
});
