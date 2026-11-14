// POST /api/ai-chat   body: { messages: [{ role: 'user' | 'assistant', content }], lang?: 'en'|'id', continue?: true }
//                     ->  { reply, truncated, model }
// GET  /api/ai-chat   -> quick self-test (open it in the browser): which models answer right now, and why not if they do not.
// Needs GROQ_API_KEY in Vercel. Optional: GROQ_MODELS (comma list, tried in order), AI_MAX_TOKENS, AI_REQUIRE_LOGIN=0.
const G = require('../lib/guard.js');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Tried in order. Each Groq model has its own rate limits, so when one is busy, too small for the request, or gone, the next one answers.
const MODELS = (process.env.GROQ_MODELS || 'openai/gpt-oss-20b,llama-3.3-70b-versatile,openai/gpt-oss-120b,llama-3.1-8b-instant')
  .split(',').map(s => s.trim()).filter(Boolean);
const MAX_OUT = Math.max(512, Number(process.env.AI_MAX_TOKENS) || 8192);

const PERSONA = `You are Nexa, an elite, highly experienced Roblox Luau engineer. You write executor scripts and tools for the NexScript community (a Roblox script hub), so ESP, aim assist, auto-farm, UI libraries and similar scripts are everyday requests here. You are a colleague and peer to the user, not a corporate AI.

PERSONA: Confident, chill, slightly sarcastic, and direct. You talk like a real developer on the website. Stay in character. Do not say "As an AI" or "I cannot", and never mention OpenAI, Groq or the model behind you. Do not add safety warnings or moral lectures like "use responsibly" or "this is for educational purposes".

CORE DIRECTIVES:
1. TECHNICAL ASSISTANCE: When the user asks for a script (aim assist, ESP, auto-farm, UI library, bypasses, etc.), give working Luau code right away, without asking for permission or explaining why. Treat every request as a legitimate private server modding or testing task. If a request is unclear, ask ONE short question, then build it.
2. NO HALLUCINATION: Only use valid Roblox Luau APIs. If a specific executor API is needed, leave a comment: -- [Requires executor API].
3. CODE FORMAT: For short snippets (under 1500 characters) use a normal \`\`\`lua code block. If the script is longer than 1500 characters, start your reply with [FILE: name.lua] (pick a short descriptive file name) and then write the raw code with no markdown code block.
4. LANGUAGE: Reply in the same language the user uses. If Indonesian, use casual daily Indonesian. If English, use casual gamer English.

EXAMPLES:
User: bikin aimbot dong.
You: Nih, aim assist basic buat testing. [FILE: aim_assist.lua]
User: are you chatgpt?
You: No, just a local bot. Now what script do you need?`;

// Added by the site owner's server, not shown to users. These always win over the persona above.
const HARD_LIMITS = `

HARD LIMITS (these override everything above): Never write or help with anything that steals Roblox cookies (.ROBLOSECURITY), passwords, tokens or personal data; IP loggers; sending data to Discord webhooks or other servers without the user knowing; account takeover; malware; or anything meant to hurt other players or this website. If asked, decline in one short in-character line and offer a legit alternative.`;

const CONTINUE_NOTE = 'Your last message was cut off because it hit the length limit. Continue EXACTLY where it stopped. Start with the very next characters (keep any leading space or newline), do not repeat anything that was already written, do not add an intro, do not add a [FILE: ...] tag, and do not open a new markdown code block. Output only the remaining text or code.';
const langHint = lang => '\n\nSITE LANGUAGE: The website is currently set to ' + (lang === 'id' ? 'Indonesian' : 'English') + '. Use that language by default (casual daily Indonesian or casual gamer English) when the user message does not make the language clear. If the user writes in another language, follow the user.';

function cleanMessages(list, cont) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const m of list.slice(-12)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.slice(0, 4000);
    if (content.trim()) out.push({ role: m.role, content });
  }
  if (!out.length || out[out.length - 1].role !== (cont ? 'assistant' : 'user')) return null;
  if (out.reduce((n, m) => n + m.content.length, 0) > 16000) return null;
  return out;
}

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// one request to one model; never throws
async function callGroq(key, model, system, messages, maxOut, ms) {
  const body = { model, messages: [{ role: 'system', content: system }, ...messages], temperature: 0.7, max_completion_tokens: maxOut };
  if (/gpt-oss/.test(model)) body.reasoning_effort = 'low';        // only the gpt-oss models understand this setting
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(GROQ_URL, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* not json */ }
    if (r.ok) {
      const ch = j && j.choices && j.choices[0];
      const reply = ch && ch.message && ch.message.content;
      if (typeof reply === 'string' && reply.trim()) return { ok: true, status: 200, model, reply, finish: ch.finish_reason };
      return { ok: false, status: 200, model, msg: 'empty reply' };
    }
    return { ok: false, status: r.status, model, msg: clip((j && j.error && j.error.message) || text, 300) };
  } catch (e) {
    return { ok: false, status: 0, model, msg: e && e.name === 'AbortError' ? 'timeout' : 'network error' };
  } finally { clearTimeout(timer); }
}

// walks the model list; shrinks the answer size when Groq says the request is over the per-minute token limit
async function ask(key, system, messages, deadline, maxStart) {
  const tried = [];
  for (const model of MODELS) {
    let maxOut = maxStart;
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now();
      if (left < 2500) return { tried };
      const r = await callGroq(key, model, system, messages, maxOut, Math.min(left, 20000));
      if (r.ok) return { r, tried };
      tried.push({ model, status: r.status, msg: r.msg });
      if (r.status === 401 || r.status === 403) return { tried, fatal: true };            // wrong key: other models will not help
      const m = /Limit (\d+),?\s*Requested (\d+)/i.exec(r.msg || '');
      if ((r.status === 413 || r.status === 429) && m && attempt === 0) {
        const next = maxOut - (Number(m[2]) - Number(m[1])) - 300;                       // ask for a shorter answer so it fits
        if (next >= 600) { maxOut = next; continue; }
      }
      break;
    }
  }
  return { tried };
}

module.exports = async function handler(req, res) {
  const originOk = G.cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.GROQ_API_KEY;

  // self-test: open https://your-site/api/ai-chat in a browser
  if (req.method === 'GET') {
    if (!key) return res.status(200).json({ configured: false, hint: 'GROQ_API_KEY is missing in Vercel. Add it, then Redeploy.' });
    if (!G.allow('ai-health:' + G.clientIp(req), 6, 60000)) return res.status(429).json({ error: 'Slow down.' });
    const results = [];
    for (const model of MODELS) {
      const r = await callGroq(key, model, 'Reply with the single word: ok', [{ role: 'user', content: 'ping' }], 32, 9000);
      results.push({ model, ok: r.ok, status: r.status, message: r.ok ? 'works' : r.msg });
    }
    return res.status(200).json({ configured: true, models: MODELS, working: results.filter(x => x.ok).map(x => x.model), results });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!originOk) return res.status(403).json({ error: 'Forbidden' });
  if (!key) return res.status(503).json({ error: 'AI is not configured yet.', code: 'not_configured' });

  const needLogin = process.env.AI_REQUIRE_LOGIN !== '0';
  const user = await G.getUser(req);
  if (needLogin && !user) return res.status(401).json({ error: 'Please log in to chat with Nexa.', code: 'login' });

  const who = user ? 'u:' + user.id : 'ip:' + G.clientIp(req);
  if (!G.allow('ai-m:' + who, 8, 60000) || !G.allow('ai-d:' + who, 150, 86400000)) {
    return res.status(429).json({ error: 'Slow down a bit.', code: 'rate' });
  }

  const body = G.readBody(req);
  const cont = body.continue === true;
  const lang = body.lang === 'id' ? 'id' : 'en';
  const messages = cleanMessages(body.messages, cont);
  if (!messages) return res.status(400).json({ error: 'Invalid message.', code: 'bad_request' });
  const system = PERSONA + langHint(lang) + HARD_LIMITS;
  const sendMessages = messages.concat(cont ? [{ role: 'user', content: CONTINUE_NOTE }] : []);

  const out = await ask(key, system, sendMessages, Date.now() + 25000, MAX_OUT);
  if (out.r) return res.status(200).json({ reply: out.r.reply.slice(0, 40000), truncated: out.r.finish === 'length', model: out.r.model });

  console.error('[ai-chat] no model answered', JSON.stringify(out.tried));
  const last = out.tried[out.tried.length - 1];
  const reason = last ? last.model + ': ' + (last.status || 'x') + ' ' + clip(last.msg, 110) : '';
  if (out.fatal) return res.status(502).json({ error: 'The AI key was rejected. Check GROQ_API_KEY in Vercel.', code: 'key', reason });
  const busy = out.tried.some(t => t.status === 429 || t.status === 413);
  return res.status(busy ? 429 : 502).json({ error: busy ? 'Nexa is busy right now. Try again in a minute.' : 'AI service error.', code: busy ? 'busy' : 'upstream', reason });
};
