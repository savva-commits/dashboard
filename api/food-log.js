// Vercel serverless function: syncs the food log across devices via an
// Upstash Redis store (REST API), keyed by calendar date.
//
// Requires a Vercel KV store created in the project's Storage tab and
// linked to this project — that automatically sets KV_REST_API_URL and
// KV_REST_API_TOKEN as environment variables, no extra config needed here.
//
// GET  /api/food-log?date=YYYY-MM-DD   -> { log: [...] }
// POST /api/food-log {date, log}        -> { ok: true }

module.exports = async (req, res) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Vercel retired the native "KV" product in favor of the Upstash
  // marketplace integration, which sets UPSTASH_REDIS_REST_* instead of
  // KV_REST_API_* — support whichever one ends up linked to this project.
  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({ error: 'kv_not_configured' });
    return;
  }

  if (req.method === 'GET') {
    const date = req.query.date;
    if (!date) { res.status(400).json({ error: 'missing_date' }); return; }
    try {
      const kvRes = await fetch(`${KV_URL}/get/${encodeURIComponent('food_log:' + date)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await kvRes.json();
      let log = [];
      if (data.result) { try { log = JSON.parse(data.result); } catch (e) {} }
      res.status(200).json({ log });
    } catch (err) {
      res.status(502).json({ error: 'kv_read_failed' });
    }
    return;
  }

  if (req.method === 'POST') {
    const { date, log } = req.body || {};
    if (!date || !Array.isArray(log)) { res.status(400).json({ error: 'invalid_body' }); return; }
    try {
      const kvRes = await fetch(`${KV_URL}/set/${encodeURIComponent('food_log:' + date)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        body: JSON.stringify(log)
      });
      if (!kvRes.ok) { res.status(502).json({ error: 'kv_write_failed' }); return; }
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: 'kv_write_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
