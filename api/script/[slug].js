// api/script/[slug].js
module.exports = async function handler(req, res) {
    // 1. Parse URL & ambil slug (support 3 format URL)
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    let rawSlug = null;
    
    const detailMatch = urlObj.pathname.match(/^(?:\/api\/script\/|\/script\/|\/s\/[^/]+\/script\/)([^/]+)/);
    if (detailMatch) {
        rawSlug = detailMatch[1];
    }

    if (!rawSlug) return res.status(400).send('Missing slug');
    const slug = decodeURIComponent(rawSlug);

    // 2. Fungsi escape HTML
    const esc = s => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const origin = 'https://nexscript-official.vercel.app';
    const fallbackImage = origin + '/android-chrome-512x512.png';

    let title = slug.replace(/-/g, ' ');
    let desc = 'Free Roblox script on NexScript. Copy and run it with your favorite executor.';
    let image = fallbackImage;

    // 3. Fetch data script dari ScriptBlox Proxy
    try {
        const apiUrl = `https://scriptblox-proxy-pzq8.vercel.app/api/search?q=${encodeURIComponent(slug.replace(/-/g, ' '))}&max=1`;
        const apiRes = await fetch(apiUrl, { headers: { 'User-Agent': 'NexScriptBot/1.0' } });

        if (apiRes.ok) {
            const json = await apiRes.json();
            const scripts = json?.result?.scripts || json?.scripts || [];
            const script = scripts[0];

            if (script) {
                title = script.title || title;
                const game = script.game?.name || 'Roblox';
                desc = `Download free ${title} for ${game}. Verified and working script on NexScript!`;

                let img = script.image;
                if (img && !img.startsWith('http')) img = `https://scriptblox.com${img}`;
                if (img) image = img;
            }
        }
    } catch (e) {
        console.error('[api/script] proxy error:', e.message);
    }

    // 4. Baca index.html pake fs (ANTI DEADLOCK)
    let html;
    try {
        const fs = require('fs');
        const path = require('path');
        html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    } catch (e) {
        console.error('[api/script] read index.html failed:', e.message);
        return res.status(500).send('Failed to load page');
    }

    // 5. Hapus OG tags lama
    html = html
        .replace(/<title>[\s\S]*?<\/title>/i, '')
        .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
        .replace(/<meta\s+property=["']og:title["'][^>]*>/gi, '')
        .replace(/<meta\s+property=["']og:description["'][^>]*>/gi, '')
        .replace(/<meta\s+property=["']og:image["'][^>]*>/gi, '')
        .replace(/<meta\s+property=["']og:url["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:title["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:description["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:image["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:card["'][^>]*>/gi, '')
        .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');

    // 6. Bikin URL Canonical & OG:URL baru
    const gameMatch = urlObj.pathname.match(/^\/s\/([^/]+)\/script\//);
    const gameSlug = gameMatch ? gameMatch[1] : 'universal';
    const canonicalUrl = `${origin}/s/${gameSlug}/script/${encodeURIComponent(slug)}`;

    // 7. Inject meta tags baru
    const meta = `
<title>${esc(title)} - NexScript</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="NexScript">
<meta property="og:title" content="${esc(title)} - NexScript">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${canonicalUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} - NexScript">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${canonicalUrl}">
`;
    html = html.replace('</head>', meta + '</head>');

    // 8. Return response + Cache
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200, stale-while-revalidate=86400');
    return res.status(200).send(html);
};
