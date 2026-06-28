// Vercel serverless function: proxies the WHOOP OAuth token exchange/refresh
// so the client secret never reaches the browser. Deployed separately from
// GitHub Pages (which still serves the static dashboard).
//
// Required environment variables (set in Vercel project settings):
//   WHOOP_CLIENT_ID
//   WHOOP_CLIENT_SECRET
//   WHOOP_REDIRECT_URI       e.g. https://savva-commits.github.io/dashboard/
//   ALLOWED_ORIGIN           e.g. https://savva-commits.github.io

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

module.exports = async (req, res) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { grant_type, code, refresh_token } = req.body || {};
  if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
    res.status(400).json({ error: 'invalid_grant_type' });
    return;
  }

  const params = new URLSearchParams({
    grant_type,
    client_id: process.env.WHOOP_CLIENT_ID,
    client_secret: process.env.WHOOP_CLIENT_SECRET
  });

  if (grant_type === 'authorization_code') {
    if (!code) { res.status(400).json({ error: 'missing_code' }); return; }
    params.set('code', code);
    params.set('redirect_uri', process.env.WHOOP_REDIRECT_URI);
  } else {
    if (!refresh_token) { res.status(400).json({ error: 'missing_refresh_token' }); return; }
    params.set('refresh_token', refresh_token);
    params.set('scope', 'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline');
  }

  try {
    const whoopRes = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await whoopRes.json();
    res.status(whoopRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'whoop_token_proxy_failed' });
  }
};
