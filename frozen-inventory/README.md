# ❄️ Frozen Inventory App

A mobile-friendly web app for managing frozen goods inventory across multiple farmers markets. Built with React + Supabase, deployable to Netlify, Vercel, or Railway.

---

## What It Does

| Tab | Purpose |
|-----|---------|
| 📦 **Week** | Set starting inventory each week. See live current stock as markets sell. |
| 🏪 **Markets** | Enter given / returned for each market. Sold auto-calculates. Auto-saves. |
| 📊 **Dashboard** | This week's summary, historical trends (min/max/avg), and next-week predictions. |
| ⚙️ **Settings** | Add/remove/reorder items and markets. Toggle 12oz / 16oz per item. |

---

## Setup (30–45 minutes, one-time)

### Step 1 — Create a Supabase project (free)

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click **New Project**. Give it a name (e.g. "frozen-inventory"). Choose a region close to you.
3. Wait ~2 minutes for the project to spin up.

### Step 2 — Run the database schema

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar.
2. Click **+ New Query**.
3. Open the file `schema.sql` from this project folder, copy all its contents, and paste it into the editor.
4. Click **Run**. You should see "Success" messages. This creates all tables and adds your 3 markets.

### Step 3 — Get your API keys

1. In Supabase, go to **Project Settings** → **API**.
2. Copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string starting with `eyJ…`)

### Step 4 — Configure the app

1. In this project folder, duplicate the file `.env.example` and rename the copy to `.env`.
2. Open `.env` and fill in your values:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJyour-anon-key-here
```

### Step 5 — Run locally (to test)

You need **Node.js** installed. Download it from [nodejs.org](https://nodejs.org) if you don't have it.

Open Terminal, navigate to this project folder, then run:

```bash
npm install
npm run dev
```

Open your browser to `http://localhost:5173`. The app should load! Try adding an item in Settings, then starting a week.

---

## Deploy to the Web (free)

Once it works locally, you can put it online so you can access it from your phone anywhere. Pick whichever platform you prefer — all three are free and work identically for this app.

---

### 🟢 Netlify (recommended — easiest UI)

**Option A — Drag and drop (no account setup needed)**

1. Run `npm run build` in the project folder. This creates a `dist/` folder.
2. Go to [app.netlify.com](https://app.netlify.com) and sign up / log in.
3. On the dashboard, drag and drop the `dist/` folder onto the page where it says "Drag and drop your site folder here".
4. Netlify instantly gives you a live URL.
5. Go to **Site configuration** → **Environment variables** → **Add a variable**. Add both:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Go to **Deploys** → **Trigger deploy** → **Deploy site** to rebuild with the variables.

**Option B — GitHub + Netlify (best for ongoing updates)**

1. Push this folder to a GitHub repository.
2. Go to [app.netlify.com](https://app.netlify.com), click **Add new site** → **Import an existing project** → connect GitHub and select your repo.
3. Set the build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Click **Add environment variables** and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Click **Deploy site**. Every future push to GitHub redeploys automatically.

---

### ⚫ Vercel

**Option A — Vercel CLI**

```bash
npm install -g vercel
vercel
```

Follow the prompts. When asked about environment variables, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Vercel gives you a live URL like `https://frozen-inventory-abc.vercel.app`.

**Option B — GitHub + Vercel**

1. Push this folder to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, click **Add New Project**, and import your repo.
3. In the project settings, go to **Environment Variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**.

---

### 🟣 Railway

Railway is better suited for full-stack apps with a backend server, but it works for this app too.

1. Push this folder to a GitHub repository.
2. Go to [railway.app](https://railway.app), click **New Project** → **Deploy from GitHub repo**.
3. Select your repo. Railway will detect it's a Node project.
4. Go to **Variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Go to **Settings** → **Build** and set:
   - Build command: `npm run build`
   - Start command: `npx serve dist`
6. Add the `serve` package first: in your terminal run `npm install serve --save` and push the updated `package.json`.

> **Note:** Railway charges after a free trial period. Netlify and Vercel remain free indefinitely for this kind of small app.

---

### Add to your phone home screen

Once deployed on any platform, open your live URL in Safari (iPhone) or Chrome (Android):
- **iPhone**: Tap the Share icon → "Add to Home Screen"
- **Android**: Tap the 3-dot menu → "Add to Home Screen"

It will appear as a full-screen app icon on your phone.

---

## How to use the app each week

**Monday (start of week)**
1. Open the app → **Week** tab.
2. Tap **+ New Week** (if a new week hasn't started).
3. Enter your starting inventory quantities for each item.
4. Tap **Save**.

**At each market**
1. Go to **Markets** tab.
2. Tap the market name tab at the top.
3. For each item: enter how many you **gave** and how many **came back**.
4. Sold calculates automatically. It saves as you type.
5. If you restocked between markets, enter that in the **Restock** column.

**Checking your dashboard**
1. Go to **Dashboard** tab.
2. **This Week** shows the current week's given/returned/sold per market.
3. **History** shows charts and min/max/avg per item per market.
4. **Predict** shows how much to send next week, based on your sales history.

---

## Adding new items or markets

Go to **Settings** → use the forms at the bottom of each section. Items can be 12oz, 16oz, or both — tap the size buttons to toggle. Use the ▲▼ arrows to reorder.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| App shows "Connection error" | Check your `.env` file has correct Supabase URL and key (no extra spaces) |
| Data doesn't update in real-time | Go to Supabase → Table Editor → check that rows are being inserted |
| "No active week" on Markets tab | Go to Week tab first and tap "Start This Week" |
| Deploy fails (any platform) | Make sure you added both environment variables in the platform's dashboard, then trigger a redeploy |
| Netlify shows blank page | Go to Site configuration → Build & deploy → check publish directory is set to `dist` |

---

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **Charts**: Recharts
- **Hosting**: Vercel (or any static host)
- **Predictions**: Weighted moving average of last 8 weeks + 10% buffer
