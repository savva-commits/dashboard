// Vercel serverless function: syncs the Week planner across devices via the
// same private GitHub repo as api/food-log.js, keyed by week-start (Monday)
// ISO date.
//
// GET  /api/week?week=YYYY-MM-DD   -> { tasks: [...] }   (tasks: null if no plan saved yet)
// POST /api/week?week=YYYY-MM-DD {tasks}  -> { ok: true }   (full replace)

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
    const week = req.query.week;
    if (!week) { res.status(400).json({ error: 'missing_week' }); return; }
    try {
      const { content } = await readSyncData();
      const tasks = (content.weekPlans && content.weekPlans[week]) || null;
      res.status(200).json({ tasks });
    } catch (err) {
      res.status(502).json({ error: 'sync_read_failed', detail: String(err.message || err) });
    }
    return;
  }

  if (req.method === 'POST') {
    const week = req.query.week;
    const { tasks } = req.body || {};
    if (!week || !Array.isArray(tasks)) { res.status(400).json({ error: 'invalid_body' }); return; }
    try {
      await updateSyncData(content => {
        content.weekPlans = content.weekPlans || {};
        content.weekPlans[week] = tasks;
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
