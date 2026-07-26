import "dotenv/config";

export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

// Render injects PORT itself — never hardcode a port.
export const PORT = Number(process.env.PORT || 4000);

// Comma-separated list of allowed frontend origins in production, e.g.
// CORS_ORIGIN=https://ai-battle-arena.vercel.app,https://ai-battle-arena-git-main-you.vercel.app
// FRONTEND_ORIGIN is kept as a deprecated alias for backward compatibility.
export const CORS_ORIGINS = (process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Always allowed in non-production so local dev never has to fight CORS.
export const DEV_DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 2);

export const PROVIDER_MAX_RETRIES = Number(process.env.PROVIDER_MAX_RETRIES ?? 2);
export const PROVIDER_RETRY_BASE_MS = Number(process.env.PROVIDER_RETRY_BASE_MS ?? 400);

// Hard ceiling on a single upstream provider call. Prevents a hung provider
// request from blocking a request indefinitely — especially important on
// Render, which will otherwise eventually 502 with no useful diagnostics.
export const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 20000);

// Hard ceiling on the whole incoming request (all retries included). Kept
// comfortably under typical platform gateway timeouts so we can return our
// own structured 504 instead of the platform's generic one.
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 55000);

