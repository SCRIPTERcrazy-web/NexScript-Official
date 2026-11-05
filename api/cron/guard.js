export default async function handler(req, res) {
  const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
  const SITE_URL = 'https://nexscript-official.vercel.app';

  try {
    const [site, sitemap, api] = await Promise.all([
      fetch(SITE_URL, { cache: 'no-store' }),
      fetch(`${SITE_URL}/sitemap.xml`, { cache: 'no-store' }),
      fetch(`${SITE_URL}/api/game?game=blox-fruits`, { cache: 'no-store' }).catch(() => ({ ok: false }))
    ]);

    const isHealthy = site.ok && sitemap.ok;

    const embed = {
      title: isHealthy ? '✅ NexScript Status: Operational' : '🚨 NexScript Status: Issues Detected',
      color: isHealthy ? 0x57F287 : 0xED4245,
      fields: [
        { name: '🌐 Website', value: site.ok ? '`Online` ✅' : '`Offline` ❌', inline: true },
        { name: '🗺️ Sitemap', value: sitemap.ok ? '`Healthy` ✅' : '`Error` ❌', inline: true },
        { name: '⚙️ API Proxy', value: api.ok ? '`Operational` ✅' : '`Degraded` ⚠️', inline: true },
        { name: '⏰ Last Check', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
      ],
      description: isHealthy 
        ? 'All systems are running smoothly. No action needed.'
        : 'Our team has been notified. We are investigating.',
      footer: { text: 'NexScript Auto-Guard • Patrol every 6h' },
      timestamp: new Date().toISOString()
    };

    if (DISCORD_WEBHOOK) {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: 'NexScript Guard',
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/1087/1087815.png',
          embeds: [embed] 
        })
      });
    }

    return res.status(200).json({ healthy: isHealthy });

  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
