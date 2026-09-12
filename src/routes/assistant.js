// Chat endpoint for "Marino 007", the AI co-pilot. Same admin-key gate as
// everything else — this is Mark's (the human's) private tool, not a public
// chatbot.
'use strict';

const express = require('express');
const assistant = require('../assistant');
const requireApiKey = require('../middleware/requireApiKey');

const router = express.Router();
router.use(requireApiKey);

router.post('/chat', async (req, res) => {
  // Validate the caller's input before checking server-side config — a
  // malformed request should read the same regardless of whether Marino
  // happens to be configured (see the identical fix in src/platforms/*.js).
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Body must include a non-empty "messages" array.' });
  }
  for (const m of messages) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') {
      return res.status(400).json({ error: 'Each message needs {role: "user"|"assistant", content: string}.' });
    }
  }

  if (!assistant.isConfigured()) {
    return res.status(400).json({ error: 'Marino 007 is not configured yet — set ANTHROPIC_API_KEY on the backend.' });
  }

  try {
    const result = await assistant.chat(messages);
    res.json(result);
  } catch (err) {
    console.error('[assistant] chat failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
