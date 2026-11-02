// api/script/[slug].js
module.exports = async function handler(req, res) {
    let rawSlug = req.query.slug;
    let rawGame = req.query.game || null;

    if (!rawSlug) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const match = urlObj.pathname.match(/^(?:\/api\/script\/|\/script\/|\/s\/[^/]+\/script\/)([^/]+)/);
        if (match) rawSlug = match[1];
        const gm = urlObj.pathname.match(/^\/s\/([^/]+)\/script\//);
        if (!rawGame && gm) rawGame = gm[1];
    }

    if (!rawSlug) return res.status(400).send('Missing slug');
    const slug = decodeURIComponent(Array.isArray(rawSlug) ? rawSlug[0] : rawSlug);
    const gameSlugFromQuery = rawGame ? (Array.isArray(rawGame) ? rawGame[0] : rawGame) : null;

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

    let html;
    try {
        const fs = require('fs');
        const path = require('path');
        html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    } catch (e) {
        console.error('[api/script] read index.html failed:', e.message);
        return res.status(500).send('Failed to load page');
    }

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

    const gameSlug = gameSlugFromQuery || 'universal';
    const canonicalUrl = `${origin}/s/${gameSlug}/script/${encodeURIComponent(slug)}`;

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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200, stale-while-revalidate=86400');
    return res.status(200).send(html);
};
