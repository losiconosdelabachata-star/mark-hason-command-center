// Gates every /auth/* and /api/* route behind a shared-secret API key
// (x-api-key header). This backend holds live OAuth tokens for real ad
// accounts, so it must never be left open on the public internet.
//
// If ADMIN_API_KEYS is unset, the server refuses all requests to protected
// routes and logs a loud warning — "no key configured" must fail closed,
// not open.
'use strict';

function parseKeys() {
  return (process.env.ADMIN_API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function requireApiKey(req, res, next) {
  const validKeys = parseKeys();
  if (validKeys.length === 0) {
    return res.status(503).json({
      error: 'Server not configured: set ADMIN_API_KEYS before using any /auth or /api routes.',
    });
  }
  const provided = req.get('x-api-key');
  if (!provided || !validKeys.includes(provided)) {
    return res.status(401).json({ error: 'Missing or invalid x-api-key header.' });
  }
  next();
}

module.exports = requireApiKey;
