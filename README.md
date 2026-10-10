# NexScript — Roblox Script Hub

A free, modern, ad-supported Roblox script discovery tool. Search, browse, and copy scripts for your favorite games.

**Live:** https://nexscript-official.vercel.app

---

## ✨ Features

- 🔍 **Search** — Find scripts by keyword (server-side, debounced)
- 🔥 **Trending** — Most popular scripts right now
- 🆕 **Newest** — Latest scripts from the community
- 👁️ **Most Viewed** — Top viewed scripts
- ⭐ **Top Rated** — Highest liked scripts
- ✅ **Verified** — Scripts verified by ScriptBlox
- 🔓 **Keyless** — Scripts without key system
- 🌐 **Universal** — Scripts that work in many games
- 🎯 **Script Hub** — Multi-game hub menus
- ❤️ **Favorites** — Bookmark scripts (synced to your account)
- 👍 **Like / Dislike** — Rate scripts
- ⭐ **Rating** — 1-5 star rating system
- 💬 **Global Chat** — Talk with other script hunters
- 📺 **Shorts** — YouTube video feed
- 🎮 **Games** — Browse by popular games
- 📤 **Upload** — Share your own scripts (reviewed before live)
- 🎁 **Donate** — Support development
- 🌙 **Dark theme** — Modern deep blue design

---

## 🚀 Tech Stack

- **Frontend:** React 18 (via CDN), Babel Standalone, Tailwind CSS
- **Auth & Database:** Supabase
- **Backend API:** Vercel Serverless Functions
- **Ad Network:** Adsterra
- **Hosting:** Vercel

---

## 🔗 API Endpoints

All endpoints are hosted on a custom Vercel proxy that wraps the ScriptBlox API.

**Base URL:** `https://scriptblox-proxy-pzq8.vercel.app`

### 1. Fetch (List, paginated)

```

GET /api/fetch?page=1&mode=free
GET /api/fetch?page=1&mode=paid
GET /api/fetch?page=1&mode=free&max=50
GET /api/fetch?page=1&mode=free&sortBy=views&order=desc
GET /api/fetch?page=1&mode=free&verified=1
GET /api/fetch?page=1&mode=free&keyless=1
GET /api/fetch?page=1&mode=free&universal=1

```

**Params:** `page`, `mode` (`free`/`paid`), `max` (1-50), `sortBy`, `order`, `verified`, `keyless`, `key`, `universal`, `patched`

**Infinite scroll:** ✅ Yes (via `nextPage`)

### 2. Search (paginated)

```

GET /api/search?q=blox+fruits&page=1
GET /api/search?q=admin&page=1

```

**Params:** `q` (keyword), `page`

**Infinite scroll:** ✅ Yes

### 3. Trending

```

GET /api/trending

```

**Returns:** ~20 trending scripts. **Infinite:** ❌ No

### 4. Newest

```

GET /api/newest?pages=3

```

**Params:** `pages` (1-5, default 3)

**Returns:** 60 scripts sorted by `createdAt desc`. **Infinite:** ❌ No

### 5. Most Viewed

```

GET /api/views?pages=3

```

**Returns:** 60 scripts sorted by `views desc`. **Infinite:** ❌ No

### 6. Top Rated

```

GET /api/rated?pages=3

```

**Returns:** 60 scripts sorted by `likeCount desc`. **Infinite:** ❌ No

### 7. Filter

```

GET /api/filter?filter=verified
GET /api/filter?filter=keyless
GET /api/filter?filter=universal
GET /api/filter?filter=nokey
GET /api/filter?filter=hub
GET /api/filter?filter=patched
GET /api/filter?filter=unpatched
GET /api/filter?filter=verified&sort=views&pages=3

```

**Params:** `filter`, `sort`, `pages`

**Filter values:** `all`, `verified`, `keyless`, `universal`, `nokey`, `key`, `free`, `paid`, `hub`, `patched`, `unpatched`

**Sort values:** `trending`, `newest`, `views`, `rated`, `executes`, `updated`

**Infinite:** ❌ No (60 script max)

### 8. Detail by Slug

```

GET /api/fetch?slug=SCRIPT-SLUG
GET /api/script?slug=SCRIPT-SLUG

```

**Returns:** Single script detail.

---

## 📦 Response Shape

All endpoints return the same structure:

```json
{
  "result": {
    "totalPages": 3688,
    "nextPage": 2,
    "max": 20,
    "scripts": [
      {
        "_id": "...",
        "title": "...",
        "game": { "name": "...", "imageUrl": "..." },
        "slug": "...",
        "verified": true,
        "key": false,
        "keyless": false,
        "views": 168448,
        "executes": 126588,
        "isUniversal": false,
        "isHub": false,
        "isPatched": false,
        "image": "...",
        "likeCount": 5,
        "dislikeCount": 2,
        "createdAt": "2026-09-18T...",
        "script": "loadstring(...)"
      }
    ]
  }
}
```

Notes:

· image and game.imageUrl may be relative paths (start with /) → prepend base URL.
· nextPage can be null (no more pages).
· Rate limit: 1 request/second. Add 1.2s delay between requests.

---

🛠️ Setup

1. Clone the repo

```bash
git clone https://github.com/SCRIPTERcrazy-web/nexscript.git
cd nexscript
```

2. Configure environment

Create a .env file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your_publishable_key
VITE_ADMIN_API=https://your-app.vercel.app
VITE_DISCORD_URL=https://discord.gg/your-invite
```

3. Run locally

Open index.html in your browser, or use a local server:

```bash
npx serve .
```

4. Deploy

Vercel:

```bash
vercel --prod
```

Netlify:
Drag & drop the index.html file to netlify.com/drop.

---

📁 Project Structure

```
nexscript/
├── index.html              # Single-file app
├── api/                    # Vercel serverless functions
│   ├── admin-stats.js
│   ├── submit-script.js
│   ├── youtube-feed.js
│   └── ...
├── README.md
└── vercel.json
```

---

🔐 Environment Variables

Variable Description
VITE_SUPABASE_URL Supabase project URL
VITE_SUPABASE_KEY Supabase publishable (anon) key
VITE_ADMIN_API Backend API base URL
VITE_DISCORD_URL Discord invite link

---

🗄️ Database Schema (Supabase)

profiles

· user_id (uuid, PK)
· username (text, unique)
· role (text: user, moderator, developer, owner)
· avatar_url (text, nullable)
· created_at (timestamp)

favorites

· id (int, PK)
· user_id (uuid)
· slug (text)
· script (jsonb)
· created_at (timestamp)

votes

· id (int, PK)
· user_id (uuid)
· slug (text)
· vote (int: 1 or -1)

ratings

· id (int, PK)
· user_id (uuid)
· slug (text)
· rating (int: 1-5)

chat_messages

· id (int, PK)
· user_id (uuid)
· author (text)
· role (text)
· kind (text: text, image, voice)
· media_path (text, nullable)
· body (text)
· created_at (timestamp)
· edited_at (timestamp, nullable)

user_scripts

· id (int, PK)
· user_id (uuid)
· name (text)
· info (text)
· description (text)
· script (text)
· author (text)
· status (text: pending, approved, rejected)
· created_at (timestamp)

---

💰 Monetization

Adsterra — banner ads via iframe injection.

· Publisher ID: 3499709
· Ad slots: 320x50, 160x600, 300x250, 728x90
· No popunder, no adult ads.

Donate: Buy Me a Coffee

---

🎨 Design

Theme: Midnight Cyber (deep blue)

· Background: #0a0f2c → #0d1a4d
· Accent: #3b82f6, #60a5fa, #22d3ee
· Text: #e2e8f0, #94a3b8
· Fonts: Inter, Space Grotesk, JetBrains Mono

Effects:

· Animated background orbs
· Grid overlay
· Glassmorphism surfaces
· Smooth transitions (200ms)

---

👤 Author

ThisIsBacon

· GitHub: @SCRIPTERcrazy-web
· YouTube: @This-IsBacon
· Discord: Join
· Saweria: Donate

---

📄 License

MIT License. Free to use, modify, and distribute.

Not affiliated with Roblox or ScriptBlox.

---

🙏 Credits

· ScriptBlox — Script data source
· YellowGregs — ScriptBlox proxy base
· Supabase — Auth & database
· Vercel — Hosting
· Adsterra — Ad network

---

📌 Disclaimer

NexScript is a free directory. Script data comes from ScriptBlox and user uploads.

· You use scripts at your own risk.
· We are not responsible for bans, losses, or damage.
· Do not upload malware or stolen content.
· We may remove content or accounts without notice.
· We are not affiliated with Roblox or ScriptBlox.

Using scripts can break Roblox's Terms of Service and may get an account banned. Use at your own risk, ideally on an alternate account.

Never run a script that asks for your password, your .ROBLOSECURITY cookie, or your Robux.

```
