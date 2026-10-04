// Vercel serverless function: POST /api/admin-stats
// Keeps the admin password and the Adsterra API key on the server.
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   ADMIN_PASSWORD     the admin password you type on the Admin page
//   ADSTERRA_API_KEY   your Adsterra publisher API key
//   ALLOWED_ORIGIN     (optional) e.g. https://scriptercrazy-web.github.io  -> restricts CORS
const crypto = require('crypto');

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ADMIN_PASSWORD, ADSTERRA_API_KEY } = process.env;
  if (!ADMIN_PASSWORD || !ADSTERRA_API_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { password, publisherId } = body || {};

  // constant-time password check + small delay to slow down guessing
  const okPw = crypto.timingSafeEqual(sha(password || ''), sha(ADMIN_PASSWORD));
  if (!okPw) { await sleep(500); return res.status(401).json({ error: 'Unauthorized' }); }

  if (!/^\d{1,12}$/.test(String(publisherId || ''))) {
    return res.status(400).json({ error: 'Invalid publisher ID' });
  }

  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const url = `https://api3.adsterratools.com/publisher/${publisherId}/stats.json?start_date=${start}&end_date=${end}&group_by=date`;

  try {
    const r = await fetch(url, {
      headers: { 'X-API-Key': ADSTERRA_API_KEY, Authorization: 'Bearer ' + ADSTERRA_API_KEY, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(r.status === 403 || r.status === 404 ? r.status : 502).json({ error: 'Adsterra error ' + r.status });
    const d = await r.json();
    return res.status(200).json({ items: d.items || d.result || [] });
  } catch (e) {
    return res.status(502).json({ error: 'Upstream request failed' });
  }
};
