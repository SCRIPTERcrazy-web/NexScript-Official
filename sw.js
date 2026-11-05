// NexScript service worker: shows push notifications (even when the browser is closed, once the user allowed them).
// Messages from the same channel stack into one notification (like a chat app), with the sender's picture on the left.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'NexScript', body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    const title = d.title || 'NexScript';
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.filter(w => w.visibilityState === 'visible' && w.focused);

    // gather the earlier unread lines of this conversation
    let lines = d.line || d.body ? [d.line || d.body] : [];
    if (d.tag) {
      const old = await self.registration.getNotifications({ tag: d.tag });
      old.forEach(n => { const l = (n.data && n.data.lines) || []; lines = l.concat(lines); });
    }
    lines = lines.slice(-5);

    const opts = {
      body: lines.join('\n'),
      icon: d.icon || '/android-chrome-192x192.png',
      badge: '/badge-96.png',
      image: d.image || undefined,
      tag: d.tag || undefined,
      renotify: !!d.tag,
      vibrate: [120, 60, 120],
      data: { url: d.url || '/', lines },
      timestamp: Date.now(),
    };
    const shown = lines.length > 1 ? title + ' (' + lines.length + ')' : title;

    if (visible.length) {
      // the person is looking at the site: show an in-page toast instead of a system popup
      visible.forEach(w => w.postMessage({ type: 'push', data: d }));
      // browsers require every push to show something, so show it silently and close it right away
      await self.registration.showNotification(shown, Object.assign({}, opts, { silent: true, vibrate: undefined, data: { url: d.url || '/', lines: [] } }));
      const list = await self.registration.getNotifications(d.tag ? { tag: d.tag } : {});
      list.forEach(n => setTimeout(() => n.close(), 400));
      return;
    }
    await self.registration.showNotification(shown, opts);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); w.postMessage({ type: 'open', url }); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
