// api/script/[slug].js
module.exports = async function handler(req, res) {
    const rawSlug = req.query.slug;
    if (!rawSlug) return res.status(400).send('Missing slug');
    const slug = decodeURIComponent(Array.isArray(rawSlug) ? rawSlug[0] : rawSlug);

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
    let gameName = '';
    let scriptCode = '';

    try {
        const apiUrl = `https://scriptblox-proxy-pzq8.vercel.app/api/search?q=${encodeURIComponent(slug.replace(/-/g, ' '))}&max=1`;
        const apiRes = await fetch(apiUrl, { headers: { 'User-Agent': 'NexScriptBot/1.0' } });

        if (apiRes.ok) {
            const json = await apiRes.json();
            const scripts = json?.result?.scripts || json?.scripts || [];
            const script = scripts[0];

            if (script) {
                title = script.title || title;
                gameName = script.game?.name || '';
                scriptCode = script.script || '';
                desc = `Download free ${title}${gameName ? ' for ' + gameName : ''}. Verified and working script on NexScript!`;

                let img = script.image;
                if (img && !img.startsWith('http')) img = `https://scriptblox.com${img}`;
                if (img) image = img;
            }
        }
    } catch (e) {
        console.error('[api/script] proxy error:', e.message);
    }

    // Baca index.html
    let html;
    try {
        const htmlRes = await fetch(origin + '/index.html', { headers: { 'User-Agent': 'NexScriptBot/1.0' } });
        if (!htmlRes.ok) throw new Error('HTTP ' + htmlRes.status);
        html = await htmlRes.text();
    } catch (e) {
        const fs = require('fs');
        const path = require('path');
        html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    }

    // Hapus meta lama
    html = html
        .replace(/<title>[\s\S]*?<\/title>/i, '')
        .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
        .replace(/<meta\s+property=["']og:title["'][^>]*>/gi, '')
        .replace(/<meta\s+property=["']og:description["'][^>]*>/gi, '')
        .replace(/<meta\s+property=["']og:image["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:title["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:description["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:image["'][^>]*>/gi, '')
        .replace(/<meta\s+name=["']twitter:card["'][^>]*>/gi, '');

    // INJECT: meta tags + window.NEXSCRIPT_INITIAL_DATA
    const meta = `
<title>${esc(title)} - NexScript</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="NexScript">
<meta property="og:title" content="${esc(title)} - NexScript">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${origin}/s/${encodeURIComponent(gameName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'universal')}/script/${encodeURIComponent(slug)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} - NexScript">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${origin}/s/${encodeURIComponent(gameName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'universal')}/script/${encodeURIComponent(slug)}">
<script>window.NEXSCRIPT_INITIAL_DATA=${JSON.stringify({slug,title,gameName,scriptCode,image})};</script>
`;
    html = html.replace('</head>', meta + '</head>');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).send(html);
};
