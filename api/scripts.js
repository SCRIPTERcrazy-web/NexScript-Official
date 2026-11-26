// api/scripts.js
// Satu fungsi untuk tiga pekerjaan, karena paket Hobby Vercel dibatasi 12 fungsi per deploy:
//   ?fn=list      daftar/pencarian script (ScriptBlox + RScripts)   <- /api/all-scripts
//   ?fn=detail    detail satu script                               <- /api/script-detail
//   ?fn=page      halaman menu dengan meta embed (/trending dst)    <- /:view
//   ?fn=discord   verifikasi Discord sebelum upload                 <- /api/discord-callback
// Rewrite di vercel.json mengarahkan alamat lama ke sini, jadi index.html tidak perlu diubah.
const fs = require('fs');
const path = require('path');

const SB_CDN = process.env.SB_CDN || 'https://scriptblox.com';
const absImage = (url) =>
  url ? (url.startsWith('http') ? url : `${SB_CDN}${url}`) : null;

// ═══════════════════════ fn=list (dulu api/all-scripts.js) ═══════════════════════
async function listHandler(req, res) {
  // ── Validasi input ────────────────────────────────────────────────
  const q = (req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const browse = req.query.browse === '1';   // tanpa kata kunci: halaman Home/Trending/Newest/dst
  const limit = String(Math.min(48, Math.max(1, parseInt(req.query.max || '20', 10) || 20)));

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
  // parameter browse yang diteruskan apa adanya ke proxy ScriptBlox (/api/fetch)
  const SB_PASS = ['mode', 'sortBy', 'order', 'verified', 'keyless', 'universal', 'key', 'patched', 'max'];
  const sbUrl = () => {
    if (!browse) return `https://scriptblox-proxy-pzq8.vercel.app/api/search?q=${encodeURIComponent(q)}&page=${page}`;
    const u = new URLSearchParams({ page: String(page) });
    for (const k of SB_PASS) if (req.query[k] !== undefined && req.query[k] !== '') u.set(k, String(req.query[k]).slice(0, 20));
    return `https://scriptblox-proxy-pzq8.vercel.app/api/fetch?${u.toString()}`;
  };

  const fetchSB = async () => {
    try {
      const r = await fetchWithTimeout(sbUrl(), {}, 8000);
      if (!r.ok) return { ok: false, data: [], hasNext: false };
      const j = await r.json();
      const data = j.result?.scripts || j.scripts || j.data || [];
      const list = Array.isArray(data) ? data : [];
      return {
        ok: true,
        data: list,
        hasNext: browse && j.result && 'nextPage' in j.result ? !!j.result.nextPage : list.length > 0,
      };
    } catch {
      return { ok: false, data: [], hasNext: false };
    }
  };

  // urutan ScriptBlox (sortBy) -> urutan RScripts (sort)
  const RSC_SORT = { views: 'most-views', createdAt: 'newest', updatedAt: 'newest', likeCount: 'most-likes' };

  const fetchRSC = async () => {
    const key = process.env.RSCRIPTS_API_KEY;
    if (!key) return { ok: false, data: [], hasNext: false };
    if (browse && req.query.mode === 'paid') return { ok: true, data: [], hasNext: false };   // RScripts tidak punya filter berbayar
    try {
      let url;
      if (browse) {
        const u = new URLSearchParams({ page: String(page), limit, sort: RSC_SORT[req.query.sortBy] || 'recommended' });
        if (req.query.verified === '1') u.set('verifiedOnly', 'true');
        if (req.query.keyless === '1' || req.query.key === '0') u.set('noKeySystem', 'true');
        if (req.query.mode === 'free') u.set('freeOnly', 'true');
        url = `https://api.rscripts.net/v1/scripts?${u.toString()}`;
      } else {
        url = `https://api.rscripts.net/v1/search?q=${encodeURIComponent(q)}&limit=${limit}&page=${page}`;
      }
      const r = await fetchWithTimeout(
        url,
        { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
        6000
      );
      if (!r.ok) return { ok: false, data: [], hasNext: false };
      const j = await r.json();
      const data = browse ? j.data : j.data?.scripts;
      const hasNext = browse ? j.meta?.hasNextPage === true : j.meta?.pagination?.scripts?.hasNextPage === true;
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
    isPatched: !!s.isPatched,
    isUniversal: !s.game?.title,
    isHub: false,
    createdAt: isValidDate(s.createdAt) ? s.createdAt : null,
    updatedAt: isValidDate(s.lastUpdatedAt) ? s.lastUpdatedAt : null,
    source: 'RScripts',
    rawScriptUrl: s.rawScript || null,
  });

  // browse: hasil proxy ScriptBlox dibiarkan apa adanya (id lama tetap sama untuk favorit), hanya RScripts yang dinormalisasi
  if (browse && !sb.ok) return res.status(502).json({ error: 'ScriptBlox upstream error' });
  const sbItem = browse ? (s) => s : normalizeSB;

  // ── Gabung: diurutkan kalau ada sortBy, selain itu selang-seling (adil) ──
  let mixed = [];
  const maxLen = Math.max(sbData.length, rscData.length);
  for (let i = 0; i < maxLen; i++) {
    if (sbData[i]) mixed.push(sbItem(sbData[i]));
    if (rscData[i]) mixed.push(normalizeRSC(rscData[i]));
  }
  const sortBy = browse ? String(req.query.sortBy || '') : '';
  if (RSC_SORT[sortBy]) {
    const val = (x) => sortBy === 'createdAt' || sortBy === 'updatedAt'
      ? (new Date(x[sortBy] || x.createdAt).getTime() || 0)
      : Number(x[sortBy]) || 0;
    mixed = mixed.map((x, i) => [x, i]).sort((a, b) => (val(b[0]) - val(a[0])) || (a[1] - b[1])).map((p) => p[0]);
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

// ═══════════════════════ fn=detail (dulu api/script-detail.js) ═══════════════════════
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

    const detailRes = await fetchWithTimeout(
      `https://api.rscripts.net/v1/scripts/${encodeURIComponent(slug)}`,
      { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
      6000
    );
    if (detailRes.status === 404) return res.status(404).json({ error: 'Script not found' });
    if (!detailRes.ok) return res.status(502).json({ error: 'RScripts upstream error' });

    const detailJson = await detailRes.json();
    const found = detailJson.data;
    if (!found || !found.slug) return res.status(404).json({ error: 'Script not found' });

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
        isPatched: !!found.isPatched,
        isUniversal: !found.game?.title,
        isHub: false,
        createdAt: found.createdAt && !isNaN(new Date(found.createdAt)) ? found.createdAt : null,
        source: 'RScripts',
        script: found.script || null,
        rawScriptUrl: found.rawScript || null,
      },
    });
  } catch (e) {
    console.error('script-detail error:', e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ═══════════════════════ fn=page (dulu api/page.js) ═══════════════════════

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
  dashboard: ['Creator Dashboard', 'Track your uploaded scripts, views and level in one place.', 'Dasbor Kreator', 'Pantau script yang kamu unggah, views, dan levelmu di satu tempat.', true],
  myscripts: ['My Scripts', 'Your uploaded Roblox scripts and their review status.', 'Script Saya', 'Script Roblox yang kamu unggah dan status tinjauannya.', true],
  appearance: ['Appearance', 'Pick a NexScript theme: Halloween, Matrix, Cosmic, Christmas and more.', 'Tampilan', 'Pilih tema NexScript: Halloween, Matrix, Kosmik, Natal, dan lainnya.', true],
  security: ['Account Settings', 'Account info, sign-in security and privacy.', 'Pengaturan Akun', 'Info akun, keamanan login, dan privasi.', true],
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


// ═══════════════════════ fn=discord (verifikasi Discord sebelum upload) ═══════════════════════
// act=start     (login)  -> { url }  alamat otorisasi Discord
// act=callback  (browser) -> alihkan balik ke /upload?dv=ok atau ?dv=err&r=<alasan>
// act=status    (login)  -> { configured, linked, ok, steps:{linked,email,guild}, username }
// Env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID (wajib). Opsional: DISCORD_BOT_TOKEN
// (cek anggota server tanpa login ulang), DISCORD_MIN_AGE_DAYS (umur akun minimum). Tabel: discord_links.
const crypto = require('crypto');
let G = null;
try { G = require('./guard.js'); } catch (e) { /* coba lokasi lain */ }
if (!G || typeof G.cors !== 'function') {
  try { G = require('../lib/guard.js'); } catch (e) { /* ditangani di bawah */ }
}
const DC = () => ({
  id: process.env.DISCORD_CLIENT_ID, secret: process.env.DISCORD_CLIENT_SECRET, guild: process.env.DISCORD_GUILD_ID,
  bot: process.env.DISCORD_BOT_TOKEN, minAge: Math.max(0, Number(process.env.DISCORD_MIN_AGE_DAYS) || 0),
});
const dcOk = (c) => !!(c.id && c.secret && c.guild);
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sign = (c, body) => b64u(crypto.createHmac('sha256', 'nx-discord:' + c.secret).update(body).digest());
const makeState = (c, uid) => { const body = b64u(JSON.stringify({ u: uid, t: Date.now() })); return body + '.' + sign(c, body); };
function readState(c, st) {
  try {
    const [body, mac] = String(st || '').split('.');
    if (!body || !mac) return null;
    const a = Buffer.from(sign(c, body)), b = Buffer.from(mac);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const o = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return o && o.u && Date.now() - o.t < 15 * 60 * 1000 ? o : null;
  } catch (e) { return null; }
}
const redirectUri = () => (process.env.SITE_ORIGIN || 'https://nexscript-official.vercel.app').replace(/\/+$/, '') + '/api/discord-callback';
const siteUrl = () => (process.env.SITE_ORIGIN || 'https://nexscript-official.vercel.app').replace(/\/+$/, '');

async function dcTimeout(url, opts, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 8000);
  try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}
async function dbReq(method, pathq, body, extra) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase env missing');
  const r = await dcTimeout(url + '/rest/v1/' + pathq, {
    method, headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) { /* vazio */ }
  return { ok: r.ok, status: r.status, data: j };
}
const snowflakeMs = (id) => { try { return Number((BigInt(id) >> 22n) + 1420070400000n); } catch (e) { return 0; } };

async function inGuild(c, discordId, userToken) {
  if (c.bot) {
    const r = await dcTimeout(`https://discord.com/api/v10/guilds/${c.guild}/members/${discordId}`, { headers: { Authorization: 'Bot ' + c.bot } });
    return r.status === 200;
  }
  if (!userToken) return null;                                   // tidak bisa dicek tanpa token pengguna
  const r = await dcTimeout('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: 'Bearer ' + userToken } });
  if (!r.ok) return false;
  const l = await r.json().catch(() => []);
  return Array.isArray(l) && l.some((g) => String(g.id) === String(c.guild));
}
const rowOk = (c, row) => !!(row && row.email_verified && row.in_guild &&
  (!c.minAge || (row.account_created && Date.now() - new Date(row.account_created).getTime() >= c.minAge * 864e5)));
const stepsOf = (c, row) => ({ linked: !!row, email: !!(row && row.email_verified), guild: !!(row && row.in_guild) });

async function discordHandler(req, res) {
  const act = String((req.query && req.query.act) || '');
  const c = DC();
  if (!G || typeof G.cors !== 'function') return res.status(500).json({ error: 'guard.js not found' });

  // ── callback: Discord mengalihkan browser ke sini ──
  if (act === 'callback') {
    const back = (q) => { res.statusCode = 302; res.setHeader('Location', siteUrl() + '/upload?' + q); res.setHeader('Cache-Control', 'no-store'); return res.end(); };
    if (!dcOk(c)) return back('dv=err&r=cfg');
    const st = readState(c, req.query.state);
    if (!st || !req.query.code) return back('dv=err&r=state');
    try {
      const tr = await dcTimeout('https://discord.com/api/v10/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: redirectUri() }).toString(),
      });
      const tj = await tr.json().catch(() => ({}));
      if (!tr.ok || !tj.access_token) return back('dv=err&r=fail');
      const ur = await dcTimeout('https://discord.com/api/v10/users/@me', { headers: { Authorization: 'Bearer ' + tj.access_token } });
      const u = await ur.json().catch(() => ({}));
      if (!ur.ok || !u.id) return back('dv=err&r=fail');
      // satu akun Discord hanya boleh terhubung ke satu akun NexScript (cegah akun alt)
      const dup = await dbReq('GET', 'discord_links?select=user_id&discord_id=eq.' + encodeURIComponent(u.id) + '&user_id=neq.' + encodeURIComponent(st.u));
      if (dup.ok && Array.isArray(dup.data) && dup.data.length) return back('dv=err&r=dup');
      const guildOk = await inGuild(c, u.id, tj.access_token);
      const created = snowflakeMs(u.id);
      const row = {
        user_id: st.u, discord_id: String(u.id), username: String(u.global_name || u.username || '').slice(0, 60),
        email_verified: u.verified === true && !!u.email, in_guild: guildOk === true,
        account_created: created ? new Date(created).toISOString() : null, checked_at: new Date().toISOString(),
      };
      const up = await dbReq('POST', 'discord_links?on_conflict=user_id', row, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      if (!up.ok) return back(up.status === 409 ? 'dv=err&r=dup' : 'dv=err&r=fail');
      if (!row.email_verified) return back('dv=err&r=email');
      if (!row.in_guild) return back('dv=err&r=guild');
      if (!rowOk(c, row)) return back('dv=err&r=age');
      return back('dv=ok');
    } catch (e) { console.error('[discord] callback', e && e.message); return back('dv=err&r=fail'); }
  }

  // ── start / status: butuh login ──
  const originOk = G.cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!originOk) return res.status(403).json({ error: 'Forbidden' });
  res.setHeader('Cache-Control', 'no-store');
  if (!dcOk(c)) return res.status(200).json({ configured: false });
  const user = await G.getUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  if (!G.allow('dc:' + user.id, 20, 60000)) return res.status(429).json({ error: 'Slow down.' });

  if (act === 'start') {
    const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri(), response_type: 'code', scope: 'identify email guilds', state: makeState(c, user.id) });
    return res.status(200).json({ configured: true, url: 'https://discord.com/oauth2/authorize?' + q.toString() });
  }
  if (act === 'status') {
    const g = await dbReq('GET', 'discord_links?select=*&user_id=eq.' + encodeURIComponent(user.id));
    let row = g.ok && Array.isArray(g.data) ? g.data[0] : null;
    if (row && c.bot) {                                          // dengan bot, keanggotaan bisa dicek ulang kapan saja
      try { const now = await inGuild(c, row.discord_id, null); if (now !== null && now !== row.in_guild) { row = { ...row, in_guild: now }; await dbReq('PATCH', 'discord_links?user_id=eq.' + encodeURIComponent(user.id), { in_guild: now, checked_at: new Date().toISOString() }, { Prefer: 'return=minimal' }); } } catch (e) { /* pakai data lama */ }
    }
    return res.status(200).json({ configured: true, linked: !!row, ok: rowOk(c, row), steps: stepsOf(c, row), username: row ? row.username : null, recheck: row && !c.bot ? 'relink' : null });
  }
  return res.status(400).json({ error: 'act must be start, callback or status' });
}

// ═══════════════════════ pintu masuk ═══════════════════════
module.exports = async function handler(req, res) {
  // pakai "fn", bukan "mode": halaman daftar sudah memakai ?mode=free|paid
  const fn = String((req.query && req.query.fn) || '');
  try {
    if (fn === 'list') return await listHandler(req, res);
    if (fn === 'detail') return await detailHandler(req, res);
    if (fn === 'page') return await pageHandler(req, res);
    if (fn === 'discord') return await discordHandler(req, res);
    return res.status(400).json({ error: 'fn must be list, detail, page or discord' });
  } catch (e) {
    console.error('[scripts] ' + fn + ' failed:', e && e.message);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal error' });
  }
};
