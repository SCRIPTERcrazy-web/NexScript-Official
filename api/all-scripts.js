// api/all-scripts.js
const SB_CDN = process.env.SB_CDN || 'https://scriptblox.com';
const absImage = (url) =>
  url ? (url.startsWith('http') ? url : `${SB_CDN}${url}`) : null;

module.exports = async function handler(req, res) {
  // ── Validasi input ────────────────────────────────────────────────
  const q = (req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = '20';

  // ── Helper: fetch + timeout ───────────────────────────────────────
  const fetchWithTimeout = async (url, opts = {}, ms = 8000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  // ── Fetch dua sumber paralel ──────────────────────────────────────
  const fetchSB = async () => {
    try {
      const r = await fetchWithTimeout(
        `https://scriptblox-proxy-pzq8.vercel.app/api/search?q=${encodeURIComponent(q)}&page=${page}`,
        {},
        8000
      );
      if (!r.ok) return { ok: false, data: [], hasNext: false };
      const j = await r.json();
      const data = j.result?.scripts || j.scripts || j.data || [];
      return {
        ok: true,
        data: Array.isArray(data) ? data : [],
        hasNext: Array.isArray(data) && data.length > 0,
      };
    } catch {
      return { ok: false, data: [], hasNext: false };
    }
  };

  const fetchRSC = async () => {
    const key = process.env.RSCRIPTS_API_KEY;
    if (!key) return { ok: false, data: [], hasNext: false };
    try {
      const r = await fetchWithTimeout(
        `https://api.rscripts.net/v1/search?q=${encodeURIComponent(q)}&limit=${limit}&page=${page}`,
        { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
        6000
      );
      if (!r.ok) return { ok: false, data: [], hasNext: false };
      const j = await r.json();
      const data = j.data?.scripts || [];
      const hasNext = j.meta?.pagination?.scripts?.hasNextPage === true;
      return { ok: true, data: Array.isArray(data) ? data : [], hasNext };
    } catch {
      return { ok: false, data: [], hasNext: false };
    }
  };

  const [sb, rsc] = await Promise.all([fetchSB(), fetchRSC()]);
  const sbData = sb.data;
  const rscData = rsc.data;

  // ── Normalisasi ───────────────────────────────────────────────────
  const isValidDate = (v) => {
    if (!v) return false;
    const d = new Date(v);
    return !isNaN(d.getTime());
  };

  const normalizeSB = (s) => ({
    _id: s._id ? `sb-${s._id}` : `sb-${s.slug || s.title || 'unknown'}`,
    slug: s.slug || '',
    title: s.title || 'Untitled',
    game: s.game
      ? { name: s.game.name || 'Universal', imageUrl: absImage(s.game.imageUrl) }
      : null,
    image: absImage(s.image) || absImage(s.game?.imageUrl) || null,
    verified: !!s.verified,
    key: !!s.key,
    keyless: !!s.keyless,
    views: s.views || 0,
    likeCount: s.likeCount || 0,
    dislikeCount: s.dislikeCount || 0,
    executes: s.executes || 0,
    isPatched: !!s.isPatched,
    isUniversal: !!s.isUniversal,
    isHub: !!s.isHub,
    createdAt: isValidDate(s.createdAt) ? s.createdAt : null,
    source: 'ScriptBlox',
  });

  const normalizeRSC = (s) => ({
    _id: `rsc-${s.id}`,
    slug: s.slug || '',
    title: s.title || 'Untitled',
    game: s.game
      ? { name: s.game.title || 'Universal', imageUrl: s.game.thumbnailUrl || null }
      : { name: 'Universal', imageUrl: null },
    image: s.imageUrl || s.game?.thumbnailUrl || null,
    verified: !!s.creator?.isVerified,
    key: !!s.isKeySystem,
    keyless: !s.isKeySystem,
    views: s.views || 0,
    likeCount: s.likes || 0,
    dislikeCount: s.dislikes || 0,
    executes: 0,
    isPatched: false,
    isUniversal: !s.game?.title,
    isHub: false,
    createdAt: null, // RSC nggak punya timestamp
    source: 'RScripts',
    rawScriptUrl: s.rawScript || null,
  });

  // ── Interleave (adil) ─────────────────────────────────────────────
  const mixed = [];
  const maxLen = Math.max(sbData.length, rscData.length);
  for (let i = 0; i < maxLen; i++) {
    if (sbData[i]) mixed.push(normalizeSB(sbData[i]));
    if (rscData[i]) mixed.push(normalizeRSC(rscData[i]));
  }

  const hasMore = sb.hasNext || rsc.hasNext;

  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
  );

  return res.status(200).json({
    result: {
      scripts: mixed,
      nextPage: hasMore ? page + 1 : null,
    },
    meta: {
      sbOk: sb.ok,
      rscOk: rsc.ok,
      sbCount: sbData.length,
      rscCount: rscData.length,
      sbHasNext: sb.hasNext,
      rscHasNext: rsc.hasNext,
    },
  });
};
