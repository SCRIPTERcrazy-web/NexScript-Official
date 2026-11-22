// api/page.js
// Halaman server untuk tiap menu NexScript (/trending, /newest, /ai, dst).
// Tujuan: tiap halaman punya judul + deskripsi sendiri di <head>, jadi link yang
// dibagikan ke Discord, WhatsApp, Telegram, Twitter/X, Google, dll tampil sebagai embed.
// Crawler tidak menjalankan JavaScript, makanya meta harus ada di HTML dari server.
//
// Cara kerja: baca index.html dari disk, ganti meta-nya, kirim. Aplikasi React tetap
// jalan normal di browser. Butuh "includeFiles": "index.html" di vercel.json untuk fungsi ini.
const fs = require('fs');
const path = require('path');

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

let cache = null;
function readIndex() {
  if (cache) return cache;
  cache = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  return cache;
}

module.exports = async function handler(req, res) {
  const view = String((req.query && req.query.view) || '').toLowerCase();
  const p = Object.prototype.hasOwnProperty.call(PAGES, view) ? PAGES[view] : null;
  if (!p) { res.statusCode = 302; res.setHeader('Location', '/'); return res.end(); }

  const lang = pickLang(req);
  const title = (lang === 'id' ? p[2] : p[0]) + ' - NexScript';
  const desc = lang === 'id' ? p[3] : p[1];
  const url = SITE + '/' + view;

  let html;
  try { html = readIndex(); } catch (e) {
    // index.html tidak ikut ke fungsi (includeFiles belum diatur): arahkan ke versi hash
    res.statusCode = 302; res.setHeader('Location', '/#/' + view); return res.end();
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
    a + '<h1>' + esc(title) + '</h1><p>' + esc(desc) + '</p>' + c);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Vary', 'Accept-Language');
  res.end(html);
};
