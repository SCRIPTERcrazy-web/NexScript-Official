// api/script/[slug].js
module.exports = async function handler(req, res) {
    const rawSlug = req.query.slug;
    if (!rawSlug) return res.status(400).send('Missing slug');
    const slug = decodeURIComponent(Array.isArray(rawSlug) ? rawSlug[0] : rawSlug);

    // Escape HTML biar aman kalau judul ada " atau <
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
        // 1. Ambil dari proxy search
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
        // Kalau proxy error, tetap render HTML default — jangan 500
        console.error('[api/script] proxy error:', e.message);
    }

    // 2. Baca index.html — pakai fetch ke origin sendiri, BUKAN fs
    let html;
    try {
        const htmlRes = await fetch(origin + '/index.html', { headers: { 'User-Agent': 'NexScriptBot/1.0' } });
        if (!htmlRes.ok) throw new Error('HTTP ' + htmlRes.status);
        html = await htmlRes.text();
    } catch (e) {
        console.error('[api/script] fetch index.html failed:', e.message);
        // Fallback minimal: kalau origin juga nggak bisa di-fetch (self-loop?), coba fs
        try {
            const fs = require('fs');
            const path = require('path');
            html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        } catch (e2) {
            return res.status(500).send('Failed to load page');
        }
    }

    // 3. HAPUS dulu OG/title/description yang lama (biar nggak duplikat)
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

    // 4. Inject meta tags baru di </head>
    const meta = `
<title>${esc(title)} - NexScript</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="NexScript">
<meta property="og:title" content="${esc(title)} - NexScript">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${origin}/script/${encodeURIComponent(slug)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} - NexScript">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${origin}/script/${encodeURIComponent(slug)}">
`;
    html = html.replace('</head>', meta + '</head>');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).send(html);
};
