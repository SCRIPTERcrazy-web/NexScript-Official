// api/script/[slug].js
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
    const { slug } = req.query;
    if (!slug) return res.status(400).send('Missing slug');

    try {
        // 1. Tembak Proxy ScriptBlox lu (Bebas CORS dari server)
        // Format search di proxy lu kan: /api/search?q=...
        const apiUrl = `https://scriptblox-proxy-pzq8.vercel.app/api/search?q=${encodeURIComponent(slug)}&max=1`;
        const apiRes = await fetch(apiUrl);
        
        if (!apiRes.ok) throw new Error(`Proxy returned ${apiRes.status}`);
        
        const json = await apiRes.json();
        
        // 2. Ambil script pertama dari hasil search proxy
        const scripts = json.result?.scripts || json.scripts || [];
        const script = scripts.length > 0 ? scripts[0] : null;

        // 3. Tentukan Judul, Deskripsi, dan Gambar (pakai data dari proxy)
        const title = script ? script.title : slug.replace(/-/g, ' ');
        const game = script ? (script.game?.name || 'Roblox') : 'Roblox';
        
        const desc = script && script.description 
            ? script.description.replace(/"/g, '&quot;') 
            : `Download working ${title} script for ${game}. Copy-paste ready code on NexScript!`;
            
        // Gambar asli dari proxy lu
        const image = (script && script.image) 
            ? (script.image.startsWith('http') ? script.image : `https://scriptblox.com${script.image}`) 
            : 'https://nexscript-official.vercel.app/android-chrome-512x512.png';

        // 4. Baca index.html asli lu
        const htmlPath = path.join(process.cwd(), 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // 5. Suntik data ke HTML
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

        // 6. Kirim ke Google/User
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);

    } catch (e) {
        console.error('Dynamic Meta Error:', e.message);
        // Fallback: kalau error, kirim HTML biasa
        const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        res.status(200).send(html);
    }
};
