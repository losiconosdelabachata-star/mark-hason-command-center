'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const platforms = require('./src/platforms');
const assistant = require('./src/assistant');
const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes/api');
const assistantRoutes = require('./src/routes/assistant');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'Mark Hason Command Center — backend',
    status: 'ok',
    platforms: platforms.all.map((p) => ({ id: p.id, name: p.name, configured: p.isConfigured() })),
    assistant: { configured: assistant.isConfigured() },
    note: 'This is the API/OAuth backend only. The dashboard frontend is built separately.',
  });
});

app.use('/auth', authRoutes);
// More specific mount first — apiRoutes has a catch-all-ish /:platform/*
// pattern that would otherwise need to fall through on every request here.
app.use('/api/assistant', assistantRoutes);
app.use('/api', apiRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Only auto-start a listener when this file is run directly (`node server.js`
// / `npm start`) — not when tests `require('../server')` to get the app and
// bind it to their own ephemeral port instead.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    const configuredCount = platforms.all.filter((p) => p.isConfigured()).length;
    console.log(`Mark Hason Command Center backend listening on :${PORT}`);
    console.log(`Platforms configured: ${configuredCount}/${platforms.all.length}`);
    if (!process.env.ADMIN_API_KEYS) {
      console.warn('WARNING: ADMIN_API_KEYS is not set — all /auth and /api routes will refuse requests until it is.');
    }
  });
}

module.exports = app;
