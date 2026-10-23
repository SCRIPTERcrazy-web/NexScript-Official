export default async function handler(req, res) {
  // 1. Ambil path dari URL (misal: fetch?page=1&mode=free)
  const { path } = req.query;
  
  if (!path) {
    return res.status(400).json({ error: 'Path tidak valid' });
  }

  // 2. Susun URL asli ScriptBlox
  const targetUrl = `https://scriptblox-proxy-pzq8.vercel.app/api/${path}`;

  try {
    // 3. Teruskan request ke ScriptBlox
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NexScript-Bot/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `ScriptBlox Error: ${response.status}` });
    }

    const data = await response.json();

    // 4. Kasih header CORS biar aman & Cache biar cepat
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    
    // 5. Kirim balik datanya ke website React lu
    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ error: 'Gagal mengambil data dari ScriptBlox' });
  }
}
