'use strict';
require('./helpers/setupEnv');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const requireApiKey = require('../src/middleware/requireApiKey');

function fakeReqRes(headerValue) {
  const req = { get: (name) => (name.toLowerCase() === 'x-api-key' ? headerValue : undefined) };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const next = () => { next.called = true; };
  next.called = false;
  return { req, res, next };
}

test('fails closed (503) when ADMIN_API_KEYS is not set at all', () => {
  const original = process.env.ADMIN_API_KEYS;
  delete process.env.ADMIN_API_KEYS;
  try {
    const { req, res, next } = fakeReqRes('anything');
    requireApiKey(req, res, next);
    assert.equal(res.statusCode, 503);
    assert.equal(next.called, false);
  } finally {
    process.env.ADMIN_API_KEYS = original;
  }
});

test('rejects (401) a missing header', () => {
  const { req, res, next } = fakeReqRes(undefined);
  requireApiKey(req, res, next);
  assert.equal(res.statusCode, 401);
  assert.equal(next.called, false);
});

test('rejects (401) a wrong key', () => {
  const { req, res, next } = fakeReqRes('totally-wrong-key');
  requireApiKey(req, res, next);
  assert.equal(res.statusCode, 401);
  assert.equal(next.called, false);
});

test('calls next() and sets no error status for the correct key', () => {
  const { req, res, next } = fakeReqRes(process.env.ADMIN_API_KEYS);
  requireApiKey(req, res, next);
  assert.equal(next.called, true);
  assert.equal(res.statusCode, null);
});

test('accepts any one of multiple comma-separated keys', () => {
  const original = process.env.ADMIN_API_KEYS;
  process.env.ADMIN_API_KEYS = 'key-one, key-two ,key-three';
  try {
    for (const key of ['key-one', 'key-two', 'key-three']) {
      const { req, res, next } = fakeReqRes(key);
      requireApiKey(req, res, next);
      assert.equal(next.called, true, `${key} should be accepted`);
    }
  } finally {
    process.env.ADMIN_API_KEYS = original;
  }
});
