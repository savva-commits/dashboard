// Shared helper: reads/writes a single JSON file in a private GitHub repo
// used as the cross-device sync backend (replaces the never-linked Vercel
// KV store). The token here is server-side only — it's never sent to the
// browser, only used inside this Vercel function.

const GITHUB_TOKEN = process.env.GITHUB_SYNC_TOKEN;
const REPO = 'savva-commits/dashboard-data';
const FILE_PATH = 'sync-data.json';
const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

async function readSyncData() {
  if (!GITHUB_TOKEN) throw new Error('github_sync_token_not_configured');
  const res = await fetch(API_URL, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error('github_read_failed_' + res.status);
  const json = await res.json();
  const content = JSON.parse(Buffer.from(json.content, 'base64').toString('utf-8'));
  return { content, sha: json.sha };
}

async function writeSyncData(content, sha) {
  const res = await fetch(API_URL, {
    method: 'PUT',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Update sync data',
      content: Buffer.from(JSON.stringify(content)).toString('base64'),
      sha
    })
  });
  if (!res.ok) throw new Error('github_write_failed_' + res.status);
  return res.json();
}

// Read-modify-write with one retry on a 409 (stale sha from a concurrent
// write from another device) — re-reads the latest version and reapplies
// the same mutation.
async function updateSyncData(mutator) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { content, sha } = await readSyncData();
    const updated = mutator(content);
    try {
      await writeSyncData(updated, sha);
      return updated;
    } catch (err) {
      lastErr = err;
      if (!String(err.message).includes('409')) throw err;
    }
  }
  throw lastErr;
}

module.exports = { readSyncData, writeSyncData, updateSyncData };
