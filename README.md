# AI Battle Arena — Full-Stack (Phase 1)

> Deploying this to production? See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the Vercel + Render walkthrough.

Two-service app: an Express backend that owns every LLM provider call, and a
Vite/React frontend that only ever talks to that backend.

```
ai-battle-arena/
  backend/    Express API — sessions, provider proxying, retries, logging
  frontend/   Vite + React UI — battle engine, turn manager, log display
```

## Why a backend now

The frontend used to call OpenAI/Anthropic/Gemini/etc. directly from the
browser, which meant your API keys sat in browser memory and requests were
at the mercy of each provider's CORS policy (this is exactly what caused the
earlier "Failed to fetch" errors on OpenAI). Now:

- API keys are sent once to the backend and held **only in server memory**
  for the life of a session (default 2h TTL, swept automatically).
- The frontend never sees or stores a raw provider response — it just gets
  back a clean `{ character }` or `{ action }` object, or a structured error.
- Retries, logging, and CORS all live in one place.

## 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env      # adjust PORT / CORS_ORIGIN if needed
npm run dev                # or: npm start
```

Runs on `http://localhost:4000` by default. Health check:
`curl http://localhost:4000/api/health`

## 2. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_URL should point at the backend
npm run dev
```

Runs on `http://localhost:5173`. Open it, fill in each fighter's provider,
model, and API key (they're sent to your own backend, not stored in the
browser beyond the current tab), and hit **Start Battle**.

## API surface (backend)

| Method | Path                          | Purpose                                                        |
|--------|--------------------------------|------------------------------------------------------------------|
| GET    | `/api/health`                 | Liveness + active session count                                  |
| POST   | `/api/session`                 | Create a session, returns `{ sessionId }`                        |
| PUT    | `/api/session/:id/keys`        | Store `{ fighterA, fighterB }` provider/model/apiKey server-side |
| POST   | `/api/generate-character`      | `{ sessionId, fighter, customPrompt }` → `{ character }`         |
| POST   | `/api/battle-turn`             | `{ sessionId, fighter, round, self, enemy, recentHistory, customPrompt }` → `{ action }` |

Every error response has the same shape:

```json
{
  "error": {
    "code": "PROVIDER_HTTP_ERROR",
    "message": "openai responded 401: Incorrect API key provided.",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "detail": { "upstreamStatus": 401, "upstreamBody": { "...": "..." } }
  }
}
```

Error codes: `VALIDATION_ERROR`, `SESSION_NOT_FOUND`, `NO_API_KEY`,
`UNSUPPORTED_PROVIDER`, `NETWORK_ERROR`, `TIMEOUT`, `INVALID_API_KEY`,
`INVALID_MODEL`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_HTTP_ERROR`,
`INVALID_JSON_RESPONSE`, `MALFORMED_JSON`, `CORS_BLOCKED`, `REQUEST_TIMEOUT`,
`INTERNAL_ERROR`.

## Retries, timeouts & logging

Every provider call has a hard timeout (`PROVIDER_TIMEOUT_MS`, default 20s).
Network errors, timeouts, 429s, and 5xx responses are retried up to
`PROVIDER_MAX_RETRIES` times (default 2) with exponential backoff + jitter.
A bad API key or unknown model is not retried — it would just fail the same
way again. The whole incoming request is separately bounded by
`REQUEST_TIMEOUT_MS` (default 55s) so a stuck call returns a structured 504
instead of hanging. Every provider call logs a request line, a response line
(including non-200 bodies), and — on final failure — an error line, all to
the backend terminal. API keys are redacted in every log line.

## Supported providers

OpenAI, Anthropic (Claude), Gemini, Grok (x.ai), Groq, DeepSeek, OpenRouter.
Add a new one by dropping an adapter in `backend/src/providers/` and
registering it in `backend/src/providers/index.js`.

## Notes / next steps

- Sessions are in-memory only — restarting the backend clears all stored
  keys and any in-progress battle context. Fine for local dev; swap in Redis
  if you need this to survive restarts or run multi-instance.
- The battle engine (damage, dodge, cooldowns, status effects) still runs
  client-side — it's deterministic game logic, not an LLM call, so it wasn't
  in scope for this migration.
- Frontend uses the Tailwind CDN build for zero-config styling; swap to a
  proper Tailwind build step before shipping to production.
