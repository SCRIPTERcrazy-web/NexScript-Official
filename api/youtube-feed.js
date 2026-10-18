// Vercel serverless function: POST /api/youtube-feed
// Serves random Shorts from a growing pool (Supabase), enforces the daily limit per tier,
// and only calls the YouTube API when the pool is short (inside a daily budget).
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   YOUTUBE_API_KEY             Google API key with "YouTube Data API v3" enabled
//   SUPABASE_URL                https://xxxx.supabase.co
//   SUPABASE_PUBLISHABLE_KEY    your publishable key
//   SUPABASE_SERVICE_ROLE_KEY   SECRET, only here
//   GUEST_SALT                  (optional) any random text, used to hash guest IPs
//   ALLOWED_ORIGIN              (optional) https://nexscript-official.vercel.app
const crypto = require('crypto');

const LIMITS = { guest: 30, free: 100, pro: 300, premium: 1000 };
const YT_DAILY_CAP = 9000; // YouTube gives 10,000 units a day; one search costs 100
const TOPICS = {
  roblox: ['roblox script showcase', 'roblox funny moments', 'roblox gameplay shorts'],
  blox: ['blox fruits shorts', 'blox fruits funny moments', 'blox fruits tips'],
  meme: ['funny memes shorts', 'meme compilation shorts', 'relatable memes'],
  comedy: ['comedy skit shorts', 'funny skit', 'stand up comedy shorts'],
  dance: ['dance shorts', 'dance challenge', 'choreography shorts'],
  history: ['3d animated history shorts', 'history animation 3d', 'animated history facts', 'ancient history animation shorts', 'world war history animated'],
  gaming: ['gaming clips shorts', 'epic gaming moments', 'minecraft shorts', 'fortnite funny moments'],
  anime: ['anime edit shorts', 'anime moments', 'anime amv shorts'],
  satisfying: ['satisfying video shorts', 'oddly satisfying', 'satisfying slime'],
  animals: ['cute animals shorts', 'funny animals', 'cat shorts'],
  sports: ['football skills shorts', 'basketball highlights shorts', 'sports fails shorts'],
  cars: ['supercar shorts', 'car edits', 'drift shorts'],
  science: ['science facts shorts', 'amazing science experiments', 'space facts shorts'],
  cooking: ['quick recipe shorts', 'street food shorts', 'cooking hacks'],
  music: ['music cover shorts', 'guitar cover shorts', 'singing shorts'],
  art: ['drawing timelapse shorts', 'digital art shorts', 'painting shorts'],
  magic: ['magic tricks shorts', 'card tricks revealed', 'illusion shorts'],
  tech: ['tech tips shorts', 'cool gadgets shorts', 'phone tricks'],
};
const BAD = /(fuck|shit|bitch|nigg|porn|sex|nude|nsfw|xxx|18\+|anjing|kontol|memek|bangsat|bokep|ngentot|jancok)/i;
const pickRandom = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// Open /api/youtube-feed in a browser to see what is missing (no secrets are shown).
async function health(res) {
  const env = process.env;
  const out = {
    env: {
      YOUTUBE_API_KEY: !!env.YOUTUBE_API_KEY, SUPABASE_URL: !!env.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: !!env.SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
    },
    supabase: {}, pool: null, youtube: null,
  };
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
    const call = async (name, args) => {
      try {
        const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: h, body: JSON.stringify(args) });
        out.supabase[name] = r.ok ? 'ok' : 'missing or failed (HTTP ' + r.status + ') - run the SQL files';
      } catch { out.supabase[name] = 'unreachable'; }
    };
    await call('pick_shorts', { p_topics: ['health'], p_exclude: [], p_n: 1 });
    await call('take_shorts', { p_subject: 'health', p_limit: 1, p_want: 0 });
    await call('take_delivered', { p_subject: 'health', p_cap: 1, p_want: 0 });
    await call('take_yt_budget', { p_cost: 0, p_cap: 9000 });
    try {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/shorts_pool?select=id&limit=1`, { headers: { ...h, Prefer: 'count=exact', Range: '0-0' } });
      const cr = r.headers.get('content-range') || '';
      out.pool = r.ok ? Number(cr.split('/')[1]) : 'table missing (HTTP ' + r.status + ')';
    } catch { out.pool = 'unreachable'; }
  }
  if (env.YOUTUBE_API_KEY) {
    try {
      const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=id&id=jNQXAC9IVRw&key=' + env.YOUTUBE_API_KEY);
      const d = await r.json().catch(() => ({}));
      out.youtube = { ok: r.ok, status: r.status, reason: r.ok ? null : ((d.error && d.error.errors && d.error.errors[0] && d.error.errors[0].reason) || (d.error && d.error.message) || 'unknown') };
    } catch { out.youtube = { ok: false, reason: 'unreachable' }; }
  }
  return res.status(200).json(out);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return health(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, GUEST_SALT } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });
  const sbH = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  const rpc = async (fn, args) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sbH, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(fn + ' ' + r.status);
    return r.json();
  };

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const n = Math.max(1, Math.min(8, parseInt(body.n, 10) || 6));
  let topics = Array.isArray(body.topics) ? body.topics.filter((t) => TOPICS[t]) : [];
  if (!topics.length || (Array.isArray(body.topics) && body.topics.includes('mix'))) topics = shuffle(Object.keys(TOPICS)).slice(0, 5);
  const exclude = (Array.isArray(body.exclude) ? body.exclude : []).filter((x) => typeof x === 'string' && /^[\w-]{11}$/.test(x)).slice(-200);

  // who is asking, and which tier are they on
  let subject, tier = 'guest';
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let uid = null;
    if (token) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_PUBLISHABLE_KEY } });
      if (r.ok) { const u = await r.json(); uid = u && u.id; }
    }
    if (uid) {
      subject = 'u:' + uid; tier = 'free';
      const r = await fetch(`${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${uid}&select=tier,expires_at`, { headers: sbH });
      const rows = r.ok ? await r.json() : [];
      if (rows[0] && rows[0].expires_at && new Date(rows[0].expires_at) > new Date() && LIMITS[rows[0].tier]) tier = rows[0].tier;
    } else {
      const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
      subject = 'g:' + crypto.createHash('sha256').update(ip + '|' + (GUEST_SALT || 'nx')).digest('hex').slice(0, 24);
    }
  } catch { return res.status(502).json({ error: 'Could not verify your account' }); }
  const limit = LIMITS[tier];

  // reset time: next midnight in WIB (UTC+7)
  const wib = new Date(Date.now() + 7 * 3600e3);
  const resetAt = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() + 1) - 7 * 3600e3;

  // The page reports each Short the person really watched (about 2.5 seconds on screen). Only that counts.
  if (body.action === 'view') {
    try {
      const took = await rpc('take_shorts', { p_subject: subject, p_limit: limit, p_want: 1 });
      return res.status(200).json({ counted: took.allowed > 0, tier, limit, remaining: Math.max(0, limit - took.used), resetAt });
    } catch { return res.status(502).json({ error: 'Could not count the view' }); }
  }

  let step = 'usage';
  let ytReason = null;
  try {
    const status = await rpc('take_shorts', { p_subject: subject, p_limit: limit, p_want: 0 });
    if (status.used >= limit) return res.status(429).json({ error: 'Daily limit reached', tier, limit, remaining: 0, resetAt });
    const nWant = Math.min(n, limit - status.used); // never hand out more than what is left

    step = 'pool';
    let items = await rpc('pick_shorts', { p_topics: topics, p_exclude: exclude, p_n: nWant });
    if (items.length < nWant && YOUTUBE_API_KEY) {
      // pool is short: fetch more from YouTube (inside the daily budget), then pick again
      step = 'youtube';
      const topic = pickRandom(topics);
      let ok = true;
      try { ok = await rpc('take_yt_budget', { p_cost: 100, p_cap: YT_DAILY_CAP }); } catch { ok = true; }
      if (!ok) ytReason = 'daily-budget';
      if (ok) {
        const params = new URLSearchParams({
          part: 'snippet', type: 'video', videoEmbeddable: 'true', videoDuration: 'short', safeSearch: 'strict', maxResults: '50',
          order: pickRandom(['relevance', 'date', 'viewCount', 'rating']), q: pickRandom(TOPICS[topic]) + ' #shorts', key: YOUTUBE_API_KEY,
        });
        const yr = await fetch('https://www.googleapis.com/youtube/v3/search?' + params);
        if (!yr.ok) { const ed = await yr.json().catch(() => ({})); ytReason = (ed.error && ed.error.errors && ed.error.errors[0] && ed.error.errors[0].reason) || ('http-' + yr.status); }
        if (yr.ok) {
          const d = await yr.json();
          const rows = (d.items || []).filter((it) => it.id && it.id.videoId && !BAD.test(it.snippet.title || '')).map((it) => ({ id: it.id.videoId, topic, title: it.snippet.title, channel: it.snippet.channelTitle }));
          if (rows.length) {
            await fetch(`${SUPABASE_URL}/rest/v1/shorts_pool`, { method: 'POST', headers: { ...sbH, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) });
            items = await rpc('pick_shorts', { p_topics: topics, p_exclude: exclude, p_n: nWant });
          }
        }
      }
    }
    items = items.filter((it) => !BAD.test(it.title || ''));
    if (!items.length) return res.status(200).json({ items: [], reason: ytReason || (YOUTUBE_API_KEY ? 'pool-empty' : 'no-youtube-key'), tier, limit, remaining: Math.max(0, limit - status.used), resetAt });
    // anti-cheat ceiling on how much can be handed out per day (about twice the limit)
    let okCount = items.length;
    try { okCount = await rpc('take_delivered', { p_subject: subject, p_cap: limit * 2 + 20, p_want: items.length }); } catch { okCount = items.length; }
    if (!okCount) return res.status(429).json({ error: 'Daily limit reached', tier, limit, remaining: Math.max(0, limit - status.used), resetAt });
    items = items.slice(0, okCount);
    return res.status(200).json({ items, tier, limit, remaining: Math.max(0, limit - status.used), resetAt });
  } catch (e) {
    return res.status(502).json({ error: 'Could not load Shorts', step, detail: String((e && e.message) || e).slice(0, 120) });
  }
};
