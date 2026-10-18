export default async function handler(req, res) {
  // Ambil data dari API ScriptBlox (samain kayak yang lu pake di React)
  try {
    // Kita ambil banyak script biar dapet nama game-nya
    const response = await fetch('https://scriptblox-proxy-pzq8.vercel.app/api/fetch?page=1&mode=free&max=100');
    const data = await response.json();
    
    // Kumpulin nama game unik
    const games = new Set();
    
    // (Asumsi data.result.scripts itu array script)
    const scripts = data.result?.scripts || data.scripts || [];
    
    scripts.forEach(script => {
      if (script.game && script.game.name) {
        // Ubah nama game jadi format URL (Blox Fruits -> blox-fruits)
        const slug = script.game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        games.add(slug);
      }
    });

    // Bikin format XML untuk Sitemap
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // 1. Masukin Halaman Utama
    xml += `  <url><loc>https://nexscript-official.vercel.app/</loc></url>\n`;

    // 2. Looping semua game yang udah dikumpulin
    games.forEach(game => {
      // Daftarin versi English
      xml += `  <url><loc>https://nexscript-official.vercel.app/s/${game}</loc></url>\n`;
      // Daftarin versi Indonesia
      xml += `  <url><loc>https://nexscript-official.vercel.app/s/id/${game}</loc></url>\n`;
    });

    xml += `</urlset>`;

    // Kasih tau browser/Google kalau ini file XML
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(xml);
    
  } catch (error) {
    res.status(500).send('Error generating sitemap');
  }
}
