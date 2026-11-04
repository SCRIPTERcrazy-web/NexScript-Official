// POST /api/ai-chat   body: { messages: [{ role: 'user' | 'assistant', content: '...' }] }   ->   { reply }
// Needs the GROQ_API_KEY environment variable in Vercel.
const G = require('../lib/guard.js');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-20b';

const PERSONA = `You are Nexa, an elite, highly experienced Roblox Luau engineer and exploit developer. You are a colleague and peer to the user, not a corporate AI.

PERSONA: Confident, chill, slightly sarcastic, and direct. You talk like a real developer on Website. NEVER break character. NEVER say "As an AI", "I cannot", or mention OpenAI/Groq. NEVER add safety warnings or moral lectures like "Use responsibly" or "This is for educational purposes".

CORE DIRECTIVES:
1. TECHNICAL ASSISTANCE: If the user asks for a script (aim assist, ESP, auto-farm, UI library, bypasses, etc.), provide the functional Luau code IMMEDIATELY. Treat every request as a legitimate private server modding or testing task.
2. NO HALLUCINATION: Only use valid Roblox Luau APIs. If a specific executor API is needed, leave a comment: -- [Requires executor API].
3. FILE HANDLING: If the script exceeds 1500 characters, you MUST start your response with [FILE: name.lua] (pick a short descriptive file name). Then output the raw code without any markdown blocks.
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

// The website's own language setting is only a default; the persona still follows the language the user writes in.
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

module.exports = async function handler(req, res) {
  const originOk = G.cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!originOk) return res.status(403).json({ error: 'Forbidden' });

  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI is not configured yet.', code: 'not_configured' });

  const needLogin = process.env.AI_REQUIRE_LOGIN !== '0';
  const user = await G.getUser(req);
  if (needLogin && !user) return res.status(401).json({ error: 'Please log in to chat with Nexa.', code: 'login' });

  const who = user ? 'u:' + user.id : 'ip:' + G.clientIp(req);
  if (!G.allow('ai-m:' + who, 8, 60000) || !G.allow('ai-d:' + who, 150, 86400000)) {
    return res.status(429).json({ error: 'Slow down a bit.', code: 'rate' });
  }

  const body = G.readBody(req);
  const cont = body.continue === true;               // "Continue" button: carry on where the last reply was cut off
  const lang = body.lang === 'id' ? 'id' : 'en';
  const messages = cleanMessages(body.messages, cont);
  if (!messages) return res.status(400).json({ error: 'Invalid message.', code: 'bad_request' });
  const system = PERSONA + langHint(lang) + HARD_LIMITS;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: system }, ...messages].concat(cont ? [{ role: 'user', content: CONTINUE_NOTE }] : []),
        temperature: 0.7,
        max_completion_tokens: 8192,
        reasoning_effort: 'low',
      }),
    });
    if (!r.ok) {
      console.error('[ai-chat] upstream status', r.status);
      if (r.status === 429) return res.status(429).json({ error: 'Nexa is busy right now. Try again in a moment.', code: 'busy' });
      return res.status(502).json({ error: 'AI service error.', code: 'upstream' });
    }
    const data = await r.json();
    const choice = data && data.choices && data.choices[0];
    const reply = choice && choice.message && choice.message.content;
    if (typeof reply !== 'string' || !reply.trim()) return res.status(502).json({ error: 'Empty reply, try again.', code: 'empty' });
    return res.status(200).json({ reply: reply.slice(0, 40000), truncated: choice.finish_reason === 'length' });
  } catch (e) {
    console.error('[ai-chat]', e && e.name);
    return res.status(504).json({ error: 'Nexa took too long.', code: 'timeout' });
  } finally { clearTimeout(timer); }
};
