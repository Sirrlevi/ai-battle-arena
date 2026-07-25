// The frontend never calls OpenAI/Anthropic/Gemini/OpenRouter/etc directly.
// Every LLM request goes through our own Express backend, which holds the
// API keys server-side and does the actual provider call.
//
// Backend URL comes from VITE_API_URL. In dev, if it's unset, we fall back
// to localhost:4000 for convenience — but that fallback is disabled in a
// production build, so a missing env var fails loudly instead of silently
// pointing at localhost.

const configuredApiUrl = import.meta.env.VITE_API_URL;
export const API_BASE = configuredApiUrl || (import.meta.env.DEV ? "http://localhost:4000" : "");

const DEFAULT_TIMEOUT_MS = 45000; // generous: Render free-tier cold starts can take 30-50s
const HEALTH_TIMEOUT_MS = 8000; // per-attempt timeout while polling health during wake-up

export class ApiError extends Error {
  constructor(message, { kind = "http", envelope = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind; // "config" | "network" | "timeout" | "http" | "parse"
    this.envelope = envelope; // full { error: {...} } body from the backend, if any
  }
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function request(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!API_BASE) {
    throw new ApiError(
      "VITE_API_URL is not configured. Set it to your backend's URL (Vercel project settings → Environment Variables).",
      { kind: "config" }
    );
  }

  const { signal, clear } = withTimeout(timeoutMs);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "content-type": "application/json" },
      signal,
      ...options,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError(
        `Backend at ${API_BASE} didn't respond within ${Math.round(timeoutMs / 1000)}s. If this is a Render free-tier service waking from sleep, try again in a moment.`,
        { kind: "timeout" }
      );
    }
    throw new ApiError(`Could not reach the backend at ${API_BASE} — is it running and is CORS configured? (${err.message})`, {
      kind: "network",
    });
  } finally {
    clear();
  }

  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {
    throw new ApiError(`Backend returned a non-JSON response (status ${res.status}).`, { kind: "parse" });
  }

  if (!res.ok) {
    const code = body?.error?.code;
    const providerTag = body?.error?.provider ? `[${body.error.provider}] ` : "";
    const msg = body?.error?.message || `Backend responded ${res.status}`;
    throw new ApiError(`${providerTag}${msg}`, { kind: code === "CORS_BLOCKED" ? "network" : "http", envelope: body });
  }

  return body;
}

/**
 * Polls /api/health, tolerating Render cold starts. Calls onAttempt(n) before
 * each try so the UI can show progress ("waking up backend…").
 */
export async function waitForBackend({ maxWaitMs = 60000, intervalMs = 3000, onAttempt } = {}) {
  const start = Date.now();
  let attempt = 0;
  // First attempt fires immediately; subsequent ones wait `intervalMs`.
  while (Date.now() - start < maxWaitMs) {
    attempt += 1;
    onAttempt?.(attempt);
    try {
      await request("/api/health", { method: "GET" }, HEALTH_TIMEOUT_MS);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

export async function createSession() {
  const { sessionId } = await request("/api/session", { method: "POST" });
  return sessionId;
}

export async function setSessionKeys(sessionId, fighterA, fighterB) {
  return request(`/api/session/${sessionId}/keys`, {
    method: "PUT",
    body: JSON.stringify({
      fighterA: { provider: fighterA.provider, model: fighterA.model, apiKey: fighterA.apiKey },
      fighterB: { provider: fighterB.provider, model: fighterB.model, apiKey: fighterB.apiKey },
    }),
  });
}

export async function generateCharacter(sessionId, fighter, customPrompt) {
  const { character } = await request("/api/generate-character", {
    method: "POST",
    body: JSON.stringify({ sessionId, fighter, customPrompt }),
  });
  return character;
}

export async function battleTurn(sessionId, fighter, round, self, enemy, recentHistory, customPrompt) {
  const { action } = await request("/api/battle-turn", {
    method: "POST",
    body: JSON.stringify({ sessionId, fighter, round, self, enemy, recentHistory, customPrompt }),
  });
  return action;
}
