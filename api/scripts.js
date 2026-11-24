// api/scripts.js
// Satu fungsi untuk tiga pekerjaan, karena paket Hobby Vercel dibatasi 12 fungsi per deploy:
//   ?mode=list    daftar/pencarian script (ScriptBlox + RScripts)   <- /api/all-scripts
//   ?mode=detail  detail satu script                               <- /api/script-detail
//   ?mode=page    halaman menu dengan meta embed (/trending dst)    <- /:view
// Rewrite di vercel.json mengarahkan alamat lama ke sini, jadi index.html tidak perlu diubah.
const fs = require('fs');
const path = require('path');

const SB_CDN = process.env.SB_CDN || 'https://scriptblox.com';
const absImage = (url) =>
  url ? (url.startsWith('http') ? url : `${SB_CDN}${url}`) : null;

// ═══════════════════════ mode=list (dulu api/all-scripts.js) ═══════════════════════
async function listHandler(req, res) {
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
}

// ═══════════════════════ mode=detail (dulu api/script-detail.js) ═══════════════════════
async function detailHandler(req, res) {
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
}

// ═══════════════════════ mode=page (dulu api/page.js) ═══════════════════════

const SITE = (process.env.SITE_ORIGIN || 'https://nexscript-official.vercel.app').replace(/\/+$/, '');
const IMAGE = SITE + '/android-chrome-512x512.png';

// [judul EN, deskripsi EN, judul ID, deskripsi ID, noindex]
const PAGES = {
  feed: ['Script Feed', 'Endless feed of popular free Roblox scripts. Scroll, copy and run, no key hunting.', 'Feed Script', 'Feed tanpa batas berisi script Roblox gratis yang lagi populer. Scroll, salin, langsung pakai.'],
  videos: ['Roblox Shorts', 'Quick Roblox short videos: tricks, script showcases and funny moments. Swipe through them like Shorts.', 'Shorts Roblox', 'Video pendek Roblox: trik, pamer script, dan momen lucu. Geser terus kayak Shorts.'],
  rewards: ['Rewards', 'Earn XP, level up, spin daily, finish missions and unlock frames and titles on NexScript.', 'Hadiah', 'Kumpulin XP, naik level, putar harian, selesaikan misi, dan buka bingkai serta gelar di NexScript.'],
  quiz: ['Roblox Quiz', 'Test your Roblox and scripting knowledge, answer quizzes and earn XP.', 'Kuis Roblox', 'Uji pengetahuan Roblox dan scripting kamu, jawab kuis dan dapatkan XP.'],
  ai: ['Nexa AI Assistant', 'Chat with Nexa, an AI that helps with Roblox Luau: write scripts, fix errors and learn how things work.', 'Asisten AI Nexa', 'Ngobrol sama Nexa, AI yang bantu soal Roblox Luau: bikin script, benerin error, dan belajar dari nol.'],
  wallet: ['Wallet and Membership', 'Top up Monux and upgrade to Pro or Premium for higher limits and an ad-free experience.', 'Dompet dan Membership', 'Top up Monux dan upgrade ke Pro atau Premium buat limit lebih besar dan tanpa iklan.', true],
  review: ['Review', 'Staff area.', 'Review', 'Area staf.', true],
  trending: ['Trending Roblox Scripts', 'The hottest Roblox scripts right now. See what everyone is running today, copy in one tap.', 'Script Roblox Trending', 'Script Roblox yang lagi paling rame sekarang. Lihat yang dipakai semua orang, salin sekali tap.'],
  newest: ['Newest Roblox Scripts', 'Freshly released Roblox scripts, updated constantly. Be the first to try the latest ones.', 'Script Roblox Terbaru', 'Script Roblox yang baru rilis, diperbarui terus. Jadi yang pertama nyobain.'],
  views: ['Most Viewed Roblox Scripts', 'The most viewed Roblox scripts of all time. Proven favorites from the community.', 'Script Roblox Paling Banyak Dilihat', 'Script Roblox yang paling banyak dilihat sepanjang masa. Favorit yang sudah terbukti.'],
  rated: ['Top Rated Roblox Scripts', 'Roblox scripts the community rated highest. Quality picks that actually work.', 'Script Roblox Rating Tertinggi', 'Script Roblox dengan rating tertinggi dari komunitas. Pilihan berkualitas yang beneran jalan.'],
  verified: ['Verified Roblox Scripts', 'Verified Roblox scripts checked for you. Safer picks with a verified badge.', 'Script Roblox Terverifikasi', 'Script Roblox terverifikasi. Pilihan lebih aman dengan badge verified.'],
  keyless: ['Keyless Roblox Scripts', 'Roblox scripts with no key system. Copy, paste and run without link shorteners.', 'Script Roblox Tanpa Key', 'Script Roblox tanpa sistem key. Salin, tempel, jalan, tanpa ribet link shortener.'],
  fav: ['My Favorites', 'Your saved Roblox scripts, ready whenever you need them.', 'Favorit Saya', 'Script Roblox yang kamu simpan, siap dipakai kapan saja.', true],
  community: ['NexScript Community', 'Discord-style community: servers, group chats, DMs, voice channels, friends and push notifications.', 'Komunitas NexScript', 'Komunitas gaya Discord: server, grup, DM, channel suara, teman, dan notifikasi.'],
  cscripts: ['Community Scripts', 'Roblox scripts uploaded by the NexScript community. Browse, copy and share your own.', 'Script Komunitas', 'Script Roblox yang diunggah komunitas NexScript. Cari, salin, dan bagikan punyamu.'],
  chat: ['Global Chat', 'Chat live with Roblox players and scripters from everywhere in the NexScript global chat.', 'Chat Global', 'Ngobrol langsung dengan pemain dan scripter Roblox dari mana saja di chat global NexScript.'],
  games: ['Roblox Games', 'Browse Roblox scripts by game. Pick your game and find scripts made for it.', 'Game Roblox', 'Cari script Roblox berdasarkan game. Pilih game kamu dan temukan script-nya.'],
  upload: ['Upload a Script', 'Share your Roblox script with the community. Every upload is reviewed before it goes live.', 'Unggah Script', 'Bagikan script Roblox kamu ke komunitas. Tiap unggahan ditinjau dulu sebelum tayang.'],
  guide: ['Guide and FAQ', 'How to use Roblox scripts safely: step-by-step guide and answers to common questions.', 'Panduan dan FAQ', 'Cara pakai script Roblox dengan aman: panduan langkah demi langkah dan jawaban pertanyaan umum.'],
  legal: ['Terms and Privacy', 'NexScript terms of use and privacy policy.', 'Syarat dan Privasi', 'Syarat penggunaan dan kebijakan privasi NexScript.'],
  account: ['Account', 'Manage your NexScript profile.', 'Akun', 'Atur profil NexScript kamu.', true],
  settings: ['Settings', 'NexScript settings.', 'Pengaturan', 'Pengaturan NexScript.', true],
  about: ['About NexScript', 'NexScript is a free Roblox script hub. Search, browse and copy scripts, with community, AI and rewards.', 'Tentang NexScript', 'NexScript adalah penemu script Roblox gratis. Cari, lihat, dan salin script, plus komunitas, AI, dan hadiah.'],
  donate: ['Support NexScript', 'Help keep NexScript free and fast. Every donation goes into running the site.', 'Dukung NexScript', 'Bantu NexScript tetap gratis dan cepat. Setiap donasi dipakai buat biaya operasional situs.'],
  admin: ['Admin', 'Admin area.', 'Admin', 'Area admin.', true],
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pickLang(req) {
  const q = req.query && req.query.lang;
  if (q === 'id' || q === 'en') return q;
  const al = String((req.headers && req.headers['accept-language']) || '').toLowerCase();
  return /^\s*id\b/.test(al) ? 'id' : 'en';
}

// ganti isi atribut content dari satu tag meta; kalau tag belum ada, tambahkan di akhir <head>
function setMeta(html, attr, key, value) {
  const re = new RegExp('<meta\\s+' + attr + '="' + key + '"[^>]*>', 'i');
  const tag = '<meta ' + attr + '="' + key + '" content="' + esc(value) + '">';
  return re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => tag + '\n</head>');
}

// Cari index.html: hasil build (dist/) dulu, lalu public/ dan root. Dicoba dari cwd dan dari folder fungsi.
const CANDIDATES = ['dist/index.html', 'public/index.html', 'index.html'];
let cache = null;
function readIndex() {
  if (cache) return cache;
  const bases = [process.cwd(), path.join(__dirname, '..'), '/var/task'];
  const tried = [];
  for (const base of bases) {
    for (const rel of CANDIDATES) {
      const f = path.join(base, rel);
      if (tried.indexOf(f) >= 0) continue;
      tried.push(f);
      try { cache = fs.readFileSync(f, 'utf8'); return cache; } catch (e) { /* coba berikutnya */ }
    }
  }
  const err = new Error('index.html not found. Tried: ' + tried.join(', '));
  err.tried = tried;
  throw err;
}

async function pageHandler(req, res) {
  const view = String((req.query && req.query.view) || '').toLowerCase();
  const p = Object.prototype.hasOwnProperty.call(PAGES, view) ? PAGES[view] : null;
  if (!p) { res.statusCode = 302; res.setHeader('Location', '/'); return res.end(); }

  const lang = pickLang(req);
  const title = (lang === 'id' ? p[2] : p[0]) + ' - NexScript';
  const desc = lang === 'id' ? p[3] : p[1];
  const url = SITE + '/' + view;

  let html;
  try { html = readIndex(); } catch (e) {
    // jangan diam-diam: tulis ke log Vercel dan tampilkan errornya
    console.error('[page] ' + e.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('NexScript page error: ' + e.message + '\nCek "includeFiles" untuk api/page.js di vercel.json.');
  }

  html = html.replace(/<title>[\s\S]*?<\/title>/i, () => '<title>' + esc(title) + '</title>');
  html = html.replace(/<link\s+rel="canonical"[^>]*>/i, () => '<link rel="canonical" href="' + url + '">');
  html = setMeta(html, 'name', 'description', desc);
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', desc);
  html = setMeta(html, 'property', 'og:url', url);
  html = setMeta(html, 'property', 'og:image', IMAGE);
  html = setMeta(html, 'property', 'og:locale', lang === 'id' ? 'id_ID' : 'en_US');
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', desc);
  if (p[4]) html = setMeta(html, 'name', 'robots', 'noindex,nofollow');

  // teks sederhana di dalam #root untuk crawler; React menggantinya saat aplikasi mulai
  html = html.replace(/(<div id="root"[^>]*>)(\s*)(<\/div>)/i, (m, a, b, c) =>
    a + '<div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden"><h1>' + esc(title) + '</h1><p>' + esc(desc) + '</p></div>' + c);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Vary', 'Accept-Language');
  res.end(html);
}

// ═══════════════════════ pintu masuk ═══════════════════════
module.exports = async function handler(req, res) {
  const mode = String((req.query && req.query.mode) || '');
  try {
    if (mode === 'list') return await listHandler(req, res);
    if (mode === 'detail') return await detailHandler(req, res);
    if (mode === 'page') return await pageHandler(req, res);
    return res.status(400).json({ error: 'mode must be list, detail or page' });
  } catch (e) {
    console.error('[scripts] ' + mode + ' failed:', e && e.message);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal error' });
  }
};
