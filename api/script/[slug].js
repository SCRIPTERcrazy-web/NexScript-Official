// api/script/[slug].js
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
    const { slug } = req.query;
    if (!slug) return res.status(400).send('Missing slug');

    try {
        // 1. Ubah slug jadi judul pencarian (misal: run-for-brainrots -> run for brainrots)
        const query = slug.replace(/-/g, ' ');

        // 2. Tembak proxy search lu (PASTI JALAN)
        const apiUrl = `https://scriptblox-proxy-pzq8.vercel.app/api/search?q=${encodeURIComponent(query)}&max=1`;
        const apiRes = await fetch(apiUrl);
        
        if (!apiRes.ok) throw new Error(`Proxy returned ${apiRes.status}`);
        
        const json = await apiRes.json();
        
        // 3. Ambil script pertama dari hasil search
        const scripts = json.result?.scripts || json.scripts || [];
        const script = scripts.length > 0 ? scripts[0] : null;

        if (!script) throw new Error('Script not found in search results');

        // 4. Ambil data asli dari hasil search
        const title = script.title || slug;
        const game = script.game?.name || 'Roblox';
        
        // Gambar asli
        let image = script.image;
        if (image && !image.startsWith('http')) {
            image = `https://scriptblox.com${image}`;
        }
        if (!image) {
            image = 'https://nexscript-official.vercel.app/android-chrome-512x512.png';
        }

        const desc = `Download free ${title} for ${game}. Verified and working script on NexScript!`;

        // 5. Sunting HTML lu
        const htmlPath = path.join(process.cwd(), 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        html = html.replace(/<title>.*?<\/title>/, `<title>${title} - NexScript</title>`);
        html = html.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${desc}">`);

        const ogTags = `
            <meta property="og:title" content="${title} - NexScript">
            <meta property="og:description" content="${desc}">
            <meta property="og:image" content="${image}">
            <meta name="twitter:image" content="${image}">
            <meta name="twitter:card" content="summary_large_image">
        `;
        
        html = html.replace('</head>', `${ogTags}</head>`);

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);

    } catch (e) {
        console.error('Dynamic Meta Error:', e.message);
        const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        res.status(200).send(html);
    }
};
