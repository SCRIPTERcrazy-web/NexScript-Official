// api/script/[slug].js
module.exports = async function handler(req, res) {
    const rawSlug = req.query.slug;
    if (!rawSlug) return res.status(400).send('Missing slug');
    const slug = decodeURIComponent(Array.isArray(rawSlug) ? rawSlug[0] : rawSlug);

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const origin = 'https://nexscript-official.vercel.app';
    const fallbackImage = origin + '/android-chrome-512x512.png';

    let title = slug.replace(/-/g, ' ');
    let desc = 'Free Roblox script on NexScript. Copy and run it with your favorite executor.';
    let image = fallbackImage;
    let gameName = '';
    let scriptCode = '';
    let gameSlug = 'universal';

    try {
        const apiUrl = `https://scriptblox-proxy-pzq8.vercel.app/api/script?slug=${encodeURIComponent(slug)}`;
        const apiRes = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexScriptBot/1.0)', 'Accept': 'application/json' } });
        
        if (apiRes.ok) {
            const json = await apiRes.json();
            const script = json?.script || json?.result?.script || json?.result || null;

            if (script && script.slug === slug) {
                title = script.title || title;
                gameName = script.game?.name || '';
                scriptCode = script.script || '';
                if (gameName) gameSlug = gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'universal';
                desc = `Download free ${title}${gameName ? ' for ' + gameName : ''}. Verified and working script on NexScript!`;

                let img = script.image;
                if (img && !img.startsWith('http')) img = `https://scriptblox-proxy-pzq8.vercel.app/api/image?url=${encodeURIComponent(img)}`;
                if (img) image = img;
            }
        }
    } catch (e) { console.error('[api/script] fetch error:', e.message); }

    let html;
    try {
        const htmlRes = await fetch(origin + '/index.html', { headers: { 'User-Agent': 'NexScriptBot/1.0' } });
        if (!htmlRes.ok) throw new Error('HTTP ' + htmlRes.status);
        html = await htmlRes.text();
    } catch (e) {
        try { html = require('fs').readFileSync(require('path').join(process.cwd(), 'index.html'), 'utf8'); } 
        catch (e2) { return res.status(500).send('Failed to load page'); }
    }

    html = html.replace(/<title>[\s\S]*?<\/title>/i, '')
        .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
        .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
        .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');

    const canonicalUrl = `${origin}/s/${gameSlug}/script/${encodeURIComponent(slug)}`;
    // FIX XSS: Ganti karakter < jadi \u003c di JSON stringify
    const safeData = JSON.stringify({slug, title, gameName, scriptCode, image}).replace(/</g, '\\u003c');

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
<script>window.NEXSCRIPT_INITIAL_DATA=${safeData};</script>
`;
    html = html.replace('</head>', meta + '</head>');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).send(html);
};
