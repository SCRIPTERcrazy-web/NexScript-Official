// GET /api/ice -> { iceServers }   (logged-in users only; keeps TURN passwords out of the page source)
// Free Google STUN is always included. For people behind strict networks (many phone carriers) add a TURN server:
//   Option A: TURN_URLS (comma separated, e.g. turn:host:3478,turns:host:5349), TURN_USERNAME, TURN_CREDENTIAL
//   Option B: METERED_DOMAIN (e.g. yourapp.metered.live) + METERED_API_KEY
const G = require('../lib/guard.js');

module.exports = async function handler(req, res) {
  const originOk = G.cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!originOk) return res.status(403).json({ error: 'Forbidden' });
  const user = await G.getUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in.', code: 'login' });
  if (!G.allow('ice:' + user.id, 20, 60000)) return res.status(429).json({ error: 'Slow down.' });

  res.setHeader('Cache-Control', 'no-store');
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

  if (process.env.METERED_DOMAIN && process.env.METERED_API_KEY) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000);
    try {
      const r = await fetch('https://' + process.env.METERED_DOMAIN + '/api/v1/turn/credentials?apiKey=' + encodeURIComponent(process.env.METERED_API_KEY), { signal: ac.signal });
      if (r.ok) { const a = await r.json(); if (Array.isArray(a) && a.length) return res.status(200).json({ iceServers: servers.concat(a), turn: true }); }
    } catch (e) { /* fall through to the other options */ } finally { clearTimeout(t); }
  }
  if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({ urls: process.env.TURN_URLS.split(',').map(s => s.trim()).filter(Boolean), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return res.status(200).json({ iceServers: servers, turn: servers.length > 1 });
};
