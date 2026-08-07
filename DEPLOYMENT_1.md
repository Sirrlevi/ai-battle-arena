# Deploying AI Battle Arena — Vercel (frontend) + Render (backend)

This is a monorepo: `backend/` and `frontend/` deploy as two separate
services. Deploy the backend first — the frontend needs its URL.

## 1. Backend → Render

**Option A — Blueprint (recommended):** push this repo to GitHub, then in
Render: New → Blueprint → point at the repo. `render.yaml` at the repo root
configures everything except `CORS_ORIGIN` (see below).

**Option B — Manual web service:**
1. New → Web Service → connect the repo.
2. Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment: Node
6. Add environment variables (Render sets `PORT` itself — don't add it):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | *(leave blank until step 3 below)* |
   | `SESSION_TTL_MS` | `7200000` |
   | `PROVIDER_MAX_RETRIES` | `2` |
   | `PROVIDER_RETRY_BASE_MS` | `400` |
   | `PROVIDER_TIMEOUT_MS` | `20000` |
   | `REQUEST_TIMEOUT_MS` | `55000` |

7. Deploy. Note the resulting URL, e.g. `https://ai-battle-arena-backend.onrender.com`.
8. Confirm it's alive: `curl https://<your-backend>.onrender.com/api/health`

## 2. Frontend → Vercel

1. New Project → import the same repo.
2. Root Directory: `frontend` (Vercel will pick up `vercel.json` inside it).
3. Framework Preset: Vite (auto-detected).
4. Environment Variables:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-backend>.onrender.com` (the URL from step 1.7) |

5. Deploy. Note the resulting URL, e.g. `https://ai-battle-arena.vercel.app`.

## 3. Close the loop: point the backend at the frontend

Go back to Render → your backend service → Environment → set:

```
CORS_ORIGIN=https://ai-battle-arena.vercel.app
```

Add every domain Vercel gives you if you want preview deployments to work
too (comma-separated), e.g.:

```
CORS_ORIGIN=https://ai-battle-arena.vercel.app,https://ai-battle-arena-git-main-you.vercel.app
```

Save — Render will redeploy automatically. Reload the Vercel site and start
a battle.

## Render free-tier cold starts

Free Render services spin down after ~15 minutes idle and take 30–50s to
wake on the next request. The frontend already handles this: on load it
polls `/api/health` for up to 60s with a "waking up backend…" indicator
before creating a session, and every backend call uses a 45s timeout so a
slow-but-alive backend doesn't get mistaken for a dead one. First load after
idle will just look slow, not broken.

## Verifying everything end to end

- [ ] `curl https://<backend>.onrender.com/api/health` → `{"status":"ok",...}`
- [ ] Open the Vercel URL → header shows "Connected · https://<backend>..."
- [ ] Fill in both fighters' provider/model/API key → **Start Battle**
- [ ] Character generation succeeds for both fighters (or shows a specific
      per-fighter provider error, not a generic failure)
- [ ] Battle runs turn-by-turn, engine verdicts appear in the log
- [ ] Open browser devtools → Network tab → confirm every request goes to
      your Render URL, never to `api.openai.com` / `api.anthropic.com` / etc.
      directly

## Known limitations

- Sessions (and the API keys held for them) are in-memory on the backend —
  a Render restart or redeploy clears them, and a battle mid-flight will
  need to be restarted. Fine for this prototype; swap in Redis if you need
  durability or multiple backend instances.
- Render free tier's cold-start tolerance is best-effort — a very slow wake
  (>60s) will surface as "could not reach backend" rather than retrying
  indefinitely.
