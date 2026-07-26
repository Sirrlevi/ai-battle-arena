import { callOpenAICompatible } from "./openaiCompatible.js";
import { callAnthropic } from "./anthropic.js";
import { callGemini } from "./gemini.js";
import { isRetryableProviderError } from "./loggedFetch.js";
import { withRetry } from "../lib/retry.js";
import { AppError } from "../lib/errors.js";
import { PROVIDER_MAX_RETRIES, PROVIDER_RETRY_BASE_MS } from "../config.js";

export const SUPPORTED_PROVIDERS = ["openai", "anthropic", "gemini", "grok", "groq", "deepseek", "openrouter"];

const OPENAI_COMPATIBLE = new Set(["openai", "grok", "groq", "deepseek", "openrouter"]);

/**
 * Single entry point used by both routes. Picks the right adapter, retries
 * transient failures with backoff, and always throws a ProviderError with a
 * real upstream message on final failure.
 */
export async function callModel({ provider, apiKey, model, systemPrompt, userPrompt, referer }) {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new AppError(`Unsupported provider "${provider}". Supported: ${SUPPORTED_PROVIDERS.join(", ")}.`, {
      code: "UNSUPPORTED_PROVIDER",
      status: 400,
      provider,
      model,
    });
  }
  if (!apiKey) {
    throw new AppError(`No API key on file for provider "${provider}". Set fighter keys via PUT /api/session/:id/keys first.`, {
      code: "NO_API_KEY",
      status: 400,
      provider,
      model,
    });
  }

  const run = (attempt) => {
    if (provider === "anthropic") return callAnthropic({ apiKey, model, systemPrompt, userPrompt });
    if (provider === "gemini") return callGemini({ apiKey, model, systemPrompt, userPrompt });
    if (OPENAI_COMPATIBLE.has(provider)) return callOpenAICompatible({ provider, apiKey, model, systemPrompt, userPrompt, referer });
    throw new AppError(`No adapter wired for provider "${provider}".`, { code: "UNSUPPORTED_PROVIDER", status: 500, provider, model });
  };

  return withRetry(run, {
    retries: PROVIDER_MAX_RETRIES,
    baseDelayMs: PROVIDER_RETRY_BASE_MS,
    isRetryable: isRetryableProviderError,
    tag: provider,
  });
}
