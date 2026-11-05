export default async function handler(req, res) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
  const SITE_URL = 'https://nexscript-official.vercel.app';

  try {
    // Cek 1: Website hidup?
    const checkSite = await fetch(SITE_URL);
    // Cek 2: Sitemap hidup?
    const checkSitemap = await fetch(`${SITE_URL}/sitemap.xml`);
    // Cek 3: API ScriptBlox proxy hidup?
    const checkApi = await fetch(`${SITE_URL}/api/script/tes`);

    const isHealthy = checkSite.ok && checkSitemap.ok;

    const embed = {
      title: isHealthy ? '✅ NexScript is save' : '🚨 NexScript need help!',
      color: isHealthy ? 5763719 : 15548997,
      fields: [
        { name: 'Website', value: checkSite.ok ? '✅ Online' : '❌ Down', inline: true },
        { name: 'Sitemap', value: checkSitemap.ok ? '✅ OK' : '❌ Error', inline: true },
        { name: 'API Proxy', value: checkApi.ok ? '✅ OK' : '⚠️ Error', inline: true },
      ],
      footer: { text: `Patroli rutin • ${new Date().toLocaleString('id-ID')}` }
    };

    if (DISCORD_WEBHOOK) {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: isHealthy ? null : '<@&> Woy owner paskib, web down!',
          embeds: [embed] 
        })
      });
    }

    return res.status(200).json({ healthy: isHealthy });

  } catch (e) {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `🔥 Guard bot error: ${e.message}` })
    });
    return res.status(500).json({ error: e.message });
  }
}
