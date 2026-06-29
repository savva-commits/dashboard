// Vercel serverless function: syncs the food log across devices via a
// private GitHub repo (see api/_github.js), keyed by calendar date.
//
// GET  /api/food-log?date=YYYY-MM-DD   -> { log: [...] }
// POST /api/food-log {date, log}        -> { ok: true }

const { readSyncData, updateSyncData } = require('./_github');

module.exports = async (req, res) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    const date = req.query.date;
    if (!date) { res.status(400).json({ error: 'missing_date' }); return; }
    try {
      const { content } = await readSyncData();
      const log = (content.foodLogs && content.foodLogs[date]) || [];
      res.status(200).json({ log });
    } catch (err) {
      res.status(502).json({ error: 'sync_read_failed', detail: String(err.message || err) });
    }
    return;
  }

  if (req.method === 'POST') {
    const { date, log } = req.body || {};
    if (!date || !Array.isArray(log)) { res.status(400).json({ error: 'invalid_body' }); return; }
    try {
      await updateSyncData(content => {
        content.foodLogs = content.foodLogs || {};
        content.foodLogs[date] = log;
        return content;
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: 'sync_write_failed', detail: String(err.message || err) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
