// /sitemap.xml  (see vercel.json). Built from the most viewed scripts, so it stays fresh without editing a file.
const S = require('../lib/seo.js');

const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async function handler(req, res) {
  const pages = [1, 2, 3, 4]; // 4 pages per category so the ScriptBlox API is not overloaded
  const urlsViews = pages.map(p => S.PROXY + '/api/fetch?page=' + p + '&mode=free&sortBy=views&order=desc&max=20');
  const urlsNewest = pages.map(p => S.PROXY + '/api/fetch?page=' + p + '&mode=free&sortBy=createdAt&order=desc&max=20');
  const results = await Promise.all([...urlsViews, ...urlsNewest].map(u => S.getJson(u, 8000)));
  const scripts = [], games = new Map(), seen = new Set();
  results.forEach(d => S.pickList(d).forEach(s => {
    if (!s || !s.slug || !s.title || seen.has(s.slug)) return;
    seen.add(s.slug);
    scripts.push(s);
    const g = S.gameSlugOf(s);
    if (g !== 'universal' && !games.has(g)) games.set(g, s.updatedAt || s.createdAt);
  }));

  const today = new Date().toISOString().slice(0, 10);
  const day = d => { try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return today; } };
  const urls = [{ loc: S.ORIGIN + '/', lastmod: today, pr: '1.0' }];
  games.forEach((d, g) => urls.push({ loc: S.ORIGIN + '/s/' + g, lastmod: d ? day(d) : today, pr: '0.8' }));
  scripts.forEach(s => urls.push({ loc: S.ORIGIN + S.scriptPath(s), lastmod: day(s.updatedAt || s.createdAt), pr: '0.6' }));

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url><loc>' + x(u.loc) + '</loc><lastmod>' + u.lastmod + '</lastmod><priority>' + u.pr + '</priority></url>').join('\n') + '\n</urlset>\n';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
};
