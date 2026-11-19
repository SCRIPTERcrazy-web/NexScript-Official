// api/script-detail.js
const SB_CDN = process.env.SB_CDN || 'https://scriptblox.com';
const absImage = (url) =>
  url ? (url.startsWith('http') ? url : `${SB_CDN}${url}`) : null;

module.exports = async function handler(req, res) {
  const slug = (req.query.slug || '').trim().slice(0, 200);
  const source = (req.query.source || '').trim();

  if (!slug) return res.status(400).json({ error: 'slug required' });
  if (!['ScriptBlox', 'RScripts'].includes(source)) {
    return res.status(400).json({ error: 'source must be ScriptBlox or RScripts' });
  }

  const fetchWithTimeout = async (url, opts = {}, ms = 8000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  try {
    // ═══════════════ ScriptBlox ═══════════════
    if (source === 'ScriptBlox') {
      const r = await fetchWithTimeout(
        `https://scriptblox-proxy-pzq8.vercel.app/api/script?slug=${encodeURIComponent(slug)}`,
        {},
        8000
      );
      if (!r.ok) return res.status(502).json({ error: 'ScriptBlox upstream error' });

      const j = await r.json();
      if (j.error) return res.status(404).json({ error: j.error });

      const s = j.script;
      if (!s || (!s.title && !s.slug)) {
        return res.status(404).json({ error: 'Script not found' });
      }

      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=1200');
      return res.status(200).json({
        script: {
          _id: s._id ? `sb-${s._id}` : `sb-${slug}`,
          slug: s.slug || slug,
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
          createdAt: s.createdAt && !isNaN(new Date(s.createdAt)) ? s.createdAt : null,
          source: 'ScriptBlox',
          script: s.script || null,
          rawScriptUrl: null,
        },
      });
    }

    // ═══════════════ RScripts ═══════════════
    const key = process.env.RSCRIPTS_API_KEY;
    if (!key) return res.status(500).json({ error: 'RSCRIPTS_API_KEY missing' });

    const searchRes = await fetchWithTimeout(
      `https://api.rscripts.net/v1/search?q=${encodeURIComponent(slug)}&limit=5`,
      { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
      6000
    );
    if (!searchRes.ok) return res.status(502).json({ error: 'RScripts upstream error' });

    const searchJson = await searchRes.json();
    const scripts = searchJson.data?.scripts || [];
    const found = scripts.find((s) => s.slug === slug);
    if (!found) return res.status(404).json({ error: 'Script not found' });

    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json({
      script: {
        _id: `rsc-${found.id}`,
        slug: found.slug || slug,
        title: found.title || 'Untitled',
        description: found.description || null,
        game: found.game
          ? { name: found.game.title || 'Universal', imageUrl: found.game.thumbnailUrl || null }
          : { name: 'Universal', imageUrl: null },
        image: found.imageUrl || found.game?.thumbnailUrl || null,
        verified: !!found.creator?.isVerified,
        creator: found.creator?.username || null,
        key: !!found.isKeySystem,
        keyless: !found.isKeySystem,
        views: found.views || 0,
        likeCount: found.likes || 0,
        dislikeCount: found.dislikes || 0,
        executes: 0,
        isPatched: false,
        isUniversal: !found.game?.title,
        isHub: false,
        createdAt: null,
        source: 'RScripts',
        script: null,
        rawScriptUrl: found.rawScript || null,
      },
    });
  } catch (e) {
    console.error('script-detail error:', e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
};
