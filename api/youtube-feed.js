// Vercel serverless function: GET /api/youtube-feed?topic=scripts&pageToken=...
// Pulls short YouTube videos for the Shorts page. The API key stays on the server.
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   YOUTUBE_API_KEY   a Google Cloud API key with "YouTube Data API v3" enabled
//   ALLOWED_ORIGIN    (optional) https://nexscript-official.vercel.app
const TOPICS = {
  scripts: 'roblox script showcase',
  blox: 'blox fruits script',
  funny: 'roblox funny moments',
  tutorial: 'roblox scripting tutorial',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server not configured' });

  // Only fixed topics are allowed, so nobody can burn the daily quota with random searches
  const topic = TOPICS[req.query.topic] ? req.query.topic : 'scripts';
  const pageToken = typeof req.query.pageToken === 'string' && /^[\w-]{1,100}$/.test(req.query.pageToken) ? req.query.pageToken : '';

  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', videoDuration: 'short',
    safeSearch: 'strict', maxResults: '20', q: TOPICS[topic] + ' #shorts', key,
  });
  if (pageToken) params.set('pageToken', pageToken);

  try {
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + params);
    if (!r.ok) return res.status(502).json({ error: 'YouTube error ' + r.status });
    const d = await r.json();
    const items = (d.items || [])
      .filter((it) => it.id && it.id.videoId)
      .map((it) => ({ id: it.id.videoId, title: it.snippet.title, channel: it.snippet.channelTitle }));
    // Cache for an hour so the free daily quota lasts
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ items, next: d.nextPageToken || null });
  } catch {
    return res.status(502).json({ error: 'Could not reach YouTube' });
  }
};
