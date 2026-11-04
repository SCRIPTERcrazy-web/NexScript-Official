// Small helpers shared by api/ai-chat.js and api/bypass.js: CORS, login check, simple rate limit.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

function cors(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', allowed || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (allowed && req.headers.origin && req.headers.origin !== allowed) return false; // only our own website may call
  return true;
}

// Asks Supabase who the token belongs to. Returns the user or null.
async function getUser(req) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token || !SUPABASE_URL || !SUPABASE_KEY) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', { signal: ac.signal, headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';

// Best-effort limit kept in memory. Each serverless instance counts on its own, so treat it as a speed bump, not a wall.
const buckets = new Map();
function allow(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { buckets.set(key, arr); return false; }
  arr.push(now); buckets.set(key, arr);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  return true;
}

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' ? b : {};
}

module.exports = { cors, getUser, clientIp, allow, readBody };
