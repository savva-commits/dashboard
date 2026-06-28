// Vercel serverless function: proxies WHOOP API data requests (recovery,
// sleep, etc.) from the browser. WHOOP's API doesn't send CORS headers for
// browser-based calls, so direct fetch() from GitHub Pages silently fails.
// This forwards the request server-side and adds the CORS headers itself.
//
// Required environment variable:
//   ALLOWED_ORIGIN   e.g. https://savva-commits.github.io

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';

module.exports = async (req, res) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const path = req.query.path;
  const authHeader = req.headers.authorization;
  if (!path || !path.startsWith('/v1/')) {
    res.status(400).json({ error: 'invalid_path' });
    return;
  }
  if (!authHeader) {
    res.status(401).json({ error: 'missing_authorization' });
    return;
  }

  try {
    const whoopRes = await fetch(WHOOP_API_BASE + path, {
      headers: { Authorization: authHeader }
    });
    const text = await whoopRes.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { error: text || 'empty_response' }; }
    res.status(whoopRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'whoop_data_proxy_failed', detail: String(err) });
  }
};
