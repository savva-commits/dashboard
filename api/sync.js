// Vercel serverless function: generic cross-device sync for everything
// besides the food log (which has its own date-keyed endpoint). Backed by
// the same private GitHub repo as api/food-log.js.
//
// GET  /api/sync?key=savedRecipes        -> { value: ... }
// POST /api/sync {key, value}             -> { ok: true }

const { readSyncData, updateSyncData } = require('./_github');

const ALLOWED_KEYS = ['savedRecipes', 'runningPbs', 'gym1rms', 'workoutHistory', 'weeklyTargets', 'dailyTotals'];

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
    const key = req.query.key;
    if (!ALLOWED_KEYS.includes(key)) { res.status(400).json({ error: 'invalid_key' }); return; }
    try {
      const { content } = await readSyncData();
      res.status(200).json({ value: content[key] !== undefined ? content[key] : null });
    } catch (err) {
      res.status(502).json({ error: 'sync_read_failed' });
    }
    return;
  }

  if (req.method === 'POST') {
    const { key, value } = req.body || {};
    if (!ALLOWED_KEYS.includes(key)) { res.status(400).json({ error: 'invalid_key' }); return; }
    try {
      await updateSyncData(content => { content[key] = value; return content; });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: 'sync_write_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
