// Vercel serverless function: POST /api/submit-script
// Accepts a script upload only from a logged-in Supabase user who passed the Turnstile captcha.
// The script is saved as "pending" and appears publicly after you approve it in Supabase.
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   SUPABASE_URL                e.g. https://xxxx.supabase.co
//   SUPABASE_PUBLISHABLE_KEY    your publishable key (sb_publishable_...)
//   SUPABASE_SERVICE_ROLE_KEY   SECRET. Only ever stored here, never in the website code or in chat.
//   TURNSTILE_SECRET            (optional) Cloudflare Turnstile secret key. Captcha is only checked when this is set.
//   ALLOWED_ORIGIN              (optional) https://scriptercrazy-web.github.io
const MAX_PER_HOUR = 5;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // 1) must be logged in
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please log in first.' });
  let user;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!r.ok) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    user = await r.json();
  } catch { return res.status(502).json({ error: 'Could not verify login.' }); }
  if (!user || !user.id) return res.status(401).json({ error: 'Please log in first.' });
  if (!user.email_confirmed_at) return res.status(403).json({ error: 'Please confirm your email before uploading.' });

  // 2) validate input
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = str(body.name), info = str(body.info), description = str(body.description), script = str(body.script);
  const author = str(body.author).slice(0, 30) || 'Anonymous';
  if (name.length < 3 || name.length > 80) return res.status(400).json({ error: 'Name must be 3-80 characters.' });
  if (info.length < 1 || info.length > 120) return res.status(400).json({ error: 'Information must be 1-120 characters.' });
  if (description.length > 1000) return res.status(400).json({ error: 'Description is too long (max 1000).' });
  if (script.length < 1 || script.length > 50000) return res.status(400).json({ error: 'Script must be 1-50000 characters.' });

  // 3) captcha (only checked when TURNSTILE_SECRET is set)
  if (TURNSTILE_SECRET) {
  const captchaToken = str(body.captchaToken);
  if (!captchaToken) return res.status(400).json({ error: 'Please complete the captcha.' });
  try {
    const form = new URLSearchParams({ secret: TURNSTILE_SECRET, response: captchaToken });
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (ip) form.set('remoteip', ip);
    const v = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })).json();
    if (!v.success) return res.status(403).json({ error: 'Captcha failed. Please try again.' });
  } catch { return res.status(502).json({ error: 'Could not verify captcha.' }); }
  }

  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

  // 4) rate limit per user
  try {
    const since = new Date(Date.now() - 3600e3).toISOString();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_scripts?user_id=eq.${user.id}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=${MAX_PER_HOUR}`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    if (rows.length >= MAX_PER_HOUR) return res.status(429).json({ error: 'Too many uploads. Try again in an hour.' });
  } catch { /* if the check fails, continue */ }

  // 5) save as pending
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_scripts`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: user.id, name, info, description, script, author, status: 'pending' }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Could not save the script.' });
  } catch { return res.status(502).json({ error: 'Could not save the script.' }); }

  return res.status(201).json({ ok: true });
};
