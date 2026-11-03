// Shared helpers for the server-rendered SEO pages (api/script/[slug].js, api/game.js, api/sitemap.js).
const fs = require('fs');
const path = require('path');

const ORIGIN = process.env.SITE_ORIGIN || 'https://nexscript-official.vercel.app';
const PROXY = process.env.SB_PROXY || 'https://scriptblox-proxy-pzq8.vercel.app';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const titleCase = s => String(s || '').replace(/-+/g, ' ').trim().replace(/\b[a-z]/g, c => c.toUpperCase());
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '\u2026' : s; };
const first = v => (Array.isArray(v) ? v[0] : v);
const safeDecode = t => { try { return decodeURIComponent(t); } catch (e) { return String(t || ''); } };

let TPL = null;
function template() {
  if (!TPL) TPL = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  return TPL;
}

async function getJson(url, ms = 7000, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: Object.assign({ 'User-Agent': 'NexScriptBot/1.0' }, headers || {}) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; } finally { clearTimeout(t); }
}

// same shape the website uses for ScriptBlox answers
function pickList(d) {
  const r = (d && d.result) || d || {};
  return Array.isArray(r) ? r : Array.isArray(r.scripts) ? r.scripts : Array.isArray(r.items) ? r.items : (d && Array.isArray(d.scripts)) ? d.scripts : [];
}

const gameSlugOf = s => slugify(s && s.game && s.game.name) || 'universal';
const scriptPath = s => '/s/' + gameSlugOf(s) + '/script/' + encodeURIComponent(s.slug);
const absImage = u => {
  if (!u || typeof u !== 'string') return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === '/') return 'https://scriptblox.com' + u;
  return null;
};
const ldJson = obj => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';

// Fills the website's own index.html with page-specific head tags and readable content inside #root.
// The app boots over the top of it, so people see the normal site and crawlers see real text.
function render(opt) {
  let html = template();
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["'](?:description|robots|twitter:[a-z:]+)["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[a-z:_]+["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  const img = opt.image || (ORIGIN + '/android-chrome-512x512.png');
  const head = '\n<title>' + esc(opt.title) + '</title>' +
    '\n<meta name="description" content="' + esc(opt.desc) + '">' +
    '\n<meta name="robots" content="' + esc(opt.robots || 'index,follow,max-image-preview:large') + '">' +
    '\n<link rel="canonical" href="' + esc(opt.canonical) + '">' +
    '\n<meta property="og:type" content="' + esc(opt.ogType || 'website') + '">' +
    '\n<meta property="og:site_name" content="NexScript">' +
    '\n<meta property="og:title" content="' + esc(opt.title) + '">' +
    '\n<meta property="og:description" content="' + esc(opt.desc) + '">' +
    '\n<meta property="og:image" content="' + esc(img) + '">' +
    '\n<meta property="og:url" content="' + esc(opt.canonical) + '">' +
    '\n<meta name="twitter:card" content="summary_large_image">' +
    '\n<meta name="twitter:title" content="' + esc(opt.title) + '">' +
    '\n<meta name="twitter:description" content="' + esc(opt.desc) + '">' +
    '\n<meta name="twitter:image" content="' + esc(img) + '">' +
    (opt.ld ? '\n' + opt.ld : '') + '\n';
  html = html.replace('</head>', head + '</head>');
  const style = '<style>.nx-ssr{max-width:760px;margin:0 auto;padding:24px;font-family:Inter,system-ui,sans-serif;color:#e2e8f0;line-height:1.6}.nx-ssr a{color:#93c5fd}.nx-ssr h1{font-size:28px;margin:8px 0}.nx-ssr h2{font-size:20px;margin:24px 0 8px}.nx-ssr pre{white-space:pre-wrap;word-break:break-all;background:#05071a;padding:12px;border-radius:10px;font-size:12px;max-height:420px;overflow:auto}.nx-ssr li{margin:4px 0}</style>';
  const marker = '<div id="root" class="relative z-10"></div>';
  if (html.indexOf(marker) < 0) return html;
  return html.replace(marker, '<div id="root" class="relative z-10">' + style + '<main class="nx-ssr">' + (opt.body || '') + '</main></div>');
}

function send(res, status, html, cache) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(status).send(html);
}

const howTo = game => '<h2>How to use ' + esc(game) + ' scripts</h2><ol>' +
  '<li>Open the script and copy the Lua code.</li>' +
  '<li>Join the ' + esc(game) + ' game on Roblox.</li>' +
  '<li>Open your executor, paste the code and run it.</li>' +
  '<li>If the script asks for a key, follow the steps it shows.</li></ol>' +
  '<p>Scripts can break the Roblox Terms of Service and may get an account banned. Use them at your own risk, never share your password or .ROBLOSECURITY cookie, and be careful with heavily obfuscated code.</p>';

module.exports = { ORIGIN, PROXY, esc, slugify, titleCase, clip, first, safeDecode, getJson, pickList, gameSlugOf, scriptPath, absImage, ldJson, render, send, howTo };
