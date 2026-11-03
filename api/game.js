// URL served here:  /s/<game>   e.g. /s/steal-an-egg  (see vercel.json)
const S = require('../lib/seo.js');

module.exports = async function handler(req, res) {
  const raw = S.safeDecode(S.first(req.query.game) || '').trim();
  const slug = S.slugify(raw);
  if (!slug || slug.length > 80) {
    return S.send(res, 404, S.render({ title: 'Not found - NexScript', desc: 'Free Roblox scripts on NexScript.', canonical: S.ORIGIN + '/', robots: 'noindex,follow', body: '<h1>Not found</h1><p><a href="/">Back to NexScript</a></p>' }), 'public, s-maxage=300');
  }
  if (raw !== slug) {                                   // one address per game: /s/Steal-An-Egg -> /s/steal-an-egg
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    res.setHeader('Location', '/s/' + slug);
    return res.status(301).end();
  }

  const q = slug.replace(/-/g, ' ');
  const d = await S.getJson(S.PROXY + '/api/search?q=' + encodeURIComponent(q) + '&page=1&max=20');
  const all = S.pickList(d).filter(x => x && x.slug && x.title);
  const exact = all.filter(x => S.gameSlugOf(x) === slug);
  const list = exact.length ? exact : all;
  const canonical = S.ORIGIN + '/s/' + slug;
  const year = new Date().getFullYear();

  if (d && !all.length) {
    return S.send(res, 404, S.render({ title: S.titleCase(slug) + ' Script - NexScript', desc: 'Free Roblox scripts on NexScript.', canonical, robots: 'noindex,follow', body: '<h1>No ' + S.esc(S.titleCase(slug)) + ' scripts found yet</h1><p><a href="/">Browse all free Roblox scripts</a></p>' }), 'public, s-maxage=600');
  }
  if (!d) {
    return S.send(res, 200, S.render({ title: S.titleCase(slug) + ' Script - NexScript', desc: 'Free Roblox scripts on NexScript.', canonical, robots: 'noindex,follow', body: '<h1>' + S.esc(S.titleCase(slug)) + ' scripts</h1><p><a href="/">Browse free Roblox scripts on NexScript</a></p>' }), 'public, s-maxage=30');
  }

  const gameName = exact.length ? exact[0].game.name : S.titleCase(slug);
  const title = gameName + ' Script - Free ' + gameName + ' Roblox Scripts (' + year + ') | NexScript';
  const top = list.slice(0, 2).map(x => x.title).join(' / ');
  const desc = S.clip('Free ' + gameName + ' scripts for Roblox: ' + list.length + ' scripts' + (top ? ', like ' + top : '') + '. Copy the Lua code and run it with your executor.', 158);
  const image = S.absImage(list[0].game && list[0].game.imageUrl) || S.absImage(list[0].image);
  const tagsOf = x => [x.verified && 'Verified', x.keyless && 'Keyless', x.key && 'Key', x.isPatched && 'Patched'].filter(Boolean).join(', ');

  const body = '<nav aria-label="Breadcrumb"><a href="/">NexScript</a> &rsaquo; ' + S.esc(gameName) + ' scripts</nav>' +
    '<h1>' + S.esc(gameName) + ' Scripts</h1>' +
    '<p>Free ' + S.esc(gameName) + ' Roblox scripts, listed from the community. Open a script to copy its Lua code, then run it with your executor.</p>' +
    '<ul>' + list.map(x => '<li><a href="' + S.esc(S.scriptPath(x)) + '">' + S.esc(x.title) + '</a>' + (tagsOf(x) ? ' &ndash; ' + S.esc(tagsOf(x)) : '') + (typeof x.views === 'number' ? ' &ndash; ' + x.views + ' views' : '') + '</li>').join('') + '</ul>' +
    S.howTo(gameName) +
    '<p><a href="/">NexScript home</a></p>';

  const ld = S.ldJson({
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'NexScript', item: S.ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: gameName + ' scripts', item: canonical }] },
      { '@type': 'CollectionPage', name: title, url: canonical, description: desc, about: { '@type': 'VideoGame', name: gameName },
        mainEntity: { '@type': 'ItemList', itemListElement: list.slice(0, 20).map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: S.ORIGIN + S.scriptPath(x), name: x.title })) } }
    ]
  });

  return S.send(res, 200, S.render({ title, desc, canonical, image, ld, body, robots: exact.length ? 'index,follow,max-image-preview:large' : 'noindex,follow' }));
};
