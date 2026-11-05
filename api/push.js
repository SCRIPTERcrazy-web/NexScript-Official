// Web Push for NexScript Community.
//   GET  /api/push?action=key                         -> { key }  (public VAPID key the browser needs to subscribe)
//   POST /api/push { action:'test' }                  -> sends a test notification to the logged-in user
//   POST /api/push { kind:'post', id }                -> notifies the other members of a channel about a message you just sent
//   POST /api/push { kind:'friend'|'friend_accept', id } -> friend request / accepted
// Needs: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
const G = require('../lib/guard.js');

const SB = process.env.SUPABASE_URL, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB = process.env.VAPID_PUBLIC_KEY, PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@nexscript-official.vercel.app';

let wp = null;
function webpush() {
  if (!wp) { wp = require('web-push'); wp.setVapidDetails(SUBJECT, PUB, PRIV); }
  return wp;
}

// talks to the database with the server key (never sent to the browser)
async function db(path, opt) {
  opt = opt || {};
  const r = await fetch(SB + '/rest/v1/' + path, {
    method: opt.method || 'GET',
    headers: { apikey: SRK, Authorization: 'Bearer ' + SRK, 'Content-Type': 'application/json' },
    body: opt.body,
  });
  if (!r.ok) throw new Error('db ' + r.status);
  if (opt.method === 'DELETE') return null;
  return r.json().catch(() => null);
}

const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '\u2026' : s; };
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const UUID = /^[0-9a-f-]{36}$/i;

// only our own storage may supply pictures for notifications
const ownPicture = u => (typeof u === 'string' && SB && u.indexOf(SB + '/storage/') === 0) ? u : undefined;
async function senderPicture(userId) {
  try { const r = await db('profiles?user_id=eq.' + userId + '&select=avatar_url'); return ownPicture(r && r[0] && r[0].avatar_url); } catch (e) { return undefined; }
}

async function sendTo(userIds, payload) {
  const ids = Array.from(new Set(userIds)).filter(x => UUID.test(x));
  if (!ids.length) return { sent: 0, total: 0 };
  let subs = [];
  for (const part of chunks(ids, 40)) {
    const rows = await db('push_subs?user_id=in.(' + part.join(',') + ')&select=id,user_id,endpoint,p256dh,auth');
    subs = subs.concat(rows || []);
  }
  const lib = webpush();
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const part of chunks(subs, 20)) {
    await Promise.all(part.map(async s => {
      try {
        await lib.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: 'normal' });
        sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) { try { await db('push_subs?id=eq.' + s.id, { method: 'DELETE' }); } catch (x) { /* ignore */ } }
        else console.error('[push] send failed', e && e.statusCode);
      }
    }));
  }
  return { sent, total: subs.length };
}

async function notifyPost(user, id) {
  if (!Number.isInteger(id) || id <= 0) return { sent: 0, error: 'bad id' };
  const posts = await db('chat_posts?id=eq.' + id + '&select=id,channel_id,user_id,author,display_name,kind,body,media_path,created_at');
  const post = posts && posts[0];
  if (!post || post.user_id !== user.id) return { sent: 0, error: 'not yours' };
  if (Date.now() - new Date(post.created_at).getTime() > 120000) return { sent: 0, error: 'too old' };

  const chs = await db('chat_channels?id=eq.' + post.channel_id + '&select=id,name,space_id');
  const ch = chs && chs[0]; if (!ch) return { sent: 0 };
  const sps = await db('chat_spaces?id=eq.' + ch.space_id + '&select=id,name,kind');
  const sp = sps && sps[0]; if (!sp) return { sent: 0 };
  const members = (await db('chat_members?space_id=eq.' + sp.id + '&select=user_id,notify&limit=500')) || [];

  // who was @mentioned
  const names = Array.from(new Set((String(post.body || '').match(/@[A-Za-z0-9_]{3,20}/g) || []).map(x => x.slice(1)))).slice(0, 10);
  const mentioned = new Set();
  if (names.length) {
    const rows = await db('profiles?select=user_id,username&or=(' + names.map(n => 'username.ilike.' + n).join(',') + ')');
    (rows || []).forEach(r => mentioned.add(r.user_id));
  }

  const to = [], toMention = [];
  members.forEach(m => {
    if (m.user_id === user.id || m.notify === 'none') return;
    const hit = mentioned.has(m.user_id);
    if (m.notify === 'mentions' && !hit) return;
    (hit ? toMention : to).push(m.user_id);
  });

  // looks like a chat app: sender's picture on the left, "#channel - server" as the title, "name: message" as the text
  const who = post.display_name || post.author || 'Someone';
  const text = post.kind === 'image' ? '\uD83D\uDCF7 Photo' : clip(post.body, 140);
  const dm = sp.kind === 'dm';
  const title = dm ? who : sp.kind === 'group' ? sp.name : '#' + ch.name + ' \u00B7 ' + sp.name;
  const line = dm ? text : who + ': ' + text;
  const icon = await senderPicture(user.id);
  const image = post.kind === 'image' && post.media_path && SB ? SB + '/storage/v1/object/public/chat-media/' + encodeURI(post.media_path) : undefined;
  const base = { line, body: line, tag: 'ch:' + ch.id, url: '/?open=' + ch.id + '#/community', icon, image };
  const a = await sendTo(to, Object.assign({ title }, base));
  const b = await sendTo(toMention, Object.assign({}, base, { title: '@ ' + title }));
  return { sent: a.sent + b.sent };
}

async function notifyFriend(user, id, kind) {
  if (!Number.isInteger(id) || id <= 0) return { sent: 0, error: 'bad id' };
  const rows = await db('friendships?id=eq.' + id + '&select=id,requester,addressee,status');
  const f = rows && rows[0]; if (!f) return { sent: 0 };
  const me = await db('profiles?user_id=eq.' + user.id + '&select=username,display_name,avatar_url');
  const icon = ownPicture(me && me[0] && me[0].avatar_url);
  const name = (me && me[0] && (me[0].display_name || me[0].username)) || 'Someone';
  if (kind === 'friend' && f.requester === user.id && f.status === 'pending') {
    return sendTo([f.addressee], { title: 'New friend request', body: name + ' wants to be your friend.', tag: 'fr:' + f.id, url: '/#/community', icon });
  }
  if (kind === 'friend_accept' && f.addressee === user.id && f.status === 'accepted') {
    return sendTo([f.requester], { title: 'Friend request accepted', body: name + ' is now your friend.', tag: 'fr:' + f.id, url: '/#/community', icon });
  }
  return { sent: 0 };
}

module.exports = async function handler(req, res) {
  const originOk = G.cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    if (req.query && req.query.action === 'key') return res.status(200).json({ key: PUB || null });
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!originOk) return res.status(403).json({ error: 'Forbidden' });
  if (!PUB || !PRIV || !SB || !SRK) return res.status(503).json({ error: 'Notifications are not configured yet.', code: 'not_configured' });

  const user = await G.getUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in.', code: 'login' });
  if (!G.allow('push:' + user.id, 40, 60000)) return res.status(429).json({ error: 'Slow down.', code: 'rate' });

  const b = G.readBody(req);
  try {
    if (b.action === 'test') return res.status(200).json(await sendTo([user.id], { title: 'NexScript', body: 'Notifications are working.', tag: 'test', url: '/#/community' }));
    if (b.kind === 'post') return res.status(200).json(await notifyPost(user, Number(b.id)));
    if (b.kind === 'friend' || b.kind === 'friend_accept') return res.status(200).json(await notifyFriend(user, Number(b.id), b.kind));
    return res.status(400).json({ error: 'Bad request' });
  } catch (e) {
    console.error('[push]', e && e.message);
    return res.status(500).json({ error: 'Could not send notifications.' });
  }
};
