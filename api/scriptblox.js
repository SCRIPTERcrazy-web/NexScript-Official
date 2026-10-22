export default async function handler(req, res) {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Path tidak valid' });

  const targetUrl = `https://scriptblox-proxy-pzq8.vercel.app/api/${Array.isArray(path) ? path.join('/') : path}`;

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) return res.status(response.status).json({ error: 'Error dari ScriptBlox' });
    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mengambil data' });
  }
}
