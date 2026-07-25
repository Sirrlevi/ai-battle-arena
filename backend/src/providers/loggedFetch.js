import { logger } from "../lib/logger.js";
import { ProviderError } from "../lib/errors.js";
import { PROVIDER_TIMEOUT_MS } from "../config.js";

/**
 * Fetch wrapper used by every provider adapter. Logs the request, the full
 * response body (even for non-200s), and the exact error if the network
 * call itself failed. Always throws a ProviderError with a real, upstream
 * message rather than a generic "fetch failed". Every call is bounded by
 * PROVIDER_TIMEOUT_MS so a hung provider can never hang this server.
 */
export async function loggedFetch({ tag, provider, model, url, headers, bodyObj, timeoutMs = PROVIDER_TIMEOUT_MS }) {
  logger.info(`provider:${tag}:request`, { provider, model, url, timeoutMs });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
    });
  } catch (networkErr) {
    const wasTimeout = networkErr.name === "AbortError";
    logger.error(`provider:${tag}:${wasTimeout ? "timeout" : "network-error"}`, {
      provider,
      model,
      url,
      message: networkErr.message,
      stack: networkErr.stack,
    });
    if (wasTimeout) {
      throw new ProviderError(`${provider}: did not respond within ${timeoutMs}ms (timed out).`, {
        code: "TIMEOUT",
        status: 504,
        provider,
        model,
        upstreamStatus: null,
        upstreamBody: null,
      });
    }
    throw new ProviderError(
      `${provider}: network error before a response was received — "${networkErr.message}".`,
      { code: "NETWORK_ERROR", status: 502, provider, model, upstreamStatus: null, upstreamBody: null }
    );
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text();
  let parsedBody = rawText;
  try {
    parsedBody = JSON.parse(rawText);
  } catch {
    /* provider returned non-JSON, leave as raw text */
  }

  logger.info(`provider:${tag}:response`, { provider, model, status: res.status, body: parsedBody });

  if (!res.ok) {
    const providerMsg =
      (parsedBody && (parsedBody.error?.message || parsedBody.message)) ||
      (typeof parsedBody === "string" ? parsedBody.slice(0, 300) : JSON.stringify(parsedBody).slice(0, 300));

    let code = "PROVIDER_HTTP_ERROR";
    if (res.status === 401 || res.status === 403) code = "INVALID_API_KEY";
    else if (res.status === 404) code = "INVALID_MODEL";
    else if (res.status === 429) code = "RATE_LIMITED";
    else if (res.status >= 500) code = "PROVIDER_UNAVAILABLE";

    logger.error(`provider:${tag}:http-error`, { provider, model, status: res.status, code, body: parsedBody });
    throw new ProviderError(`${provider} responded ${res.status}: ${providerMsg || "no error detail returned"}`, {
      code,
      status: res.status >= 500 ? 502 : 422,
      provider,
      model,
      upstreamStatus: res.status,
      upstreamBody: parsedBody,
    });
  }

  return parsedBody;
}

// Network errors, timeouts, rate limits, and provider-side 5xx are worth
// retrying; a bad API key or unknown model will just fail the same way
// again, so don't waste time (or the user's rate-limit budget) on those.
export function isRetryableProviderError(err) {
  if (err?.code === "NETWORK_ERROR" || err?.code === "TIMEOUT") return true;
  if (err?.code === "RATE_LIMITED" || err?.code === "PROVIDER_UNAVAILABLE") return true;
  if (err?.code === "PROVIDER_HTTP_ERROR") {
    const s = err.detail?.upstreamStatus;
    return s === 429 || (s >= 500 && s < 600);
  }
  return false;
}
