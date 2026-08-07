import { logger } from "./logger.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn(attemptNumber)` and retries on retryable failures with exponential
 * backoff + jitter. `isRetryable(err)` decides whether a given error is worth
 * retrying — network errors and 429/5xx should be, 4xx auth/validation errors
 * should not be (retrying a bad API key just burns time).
 */
export async function withRetry(fn, { retries, baseDelayMs, isRetryable = () => true, tag = "op" } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const retryable = isRetryable(err);
      if (attempt >= retries || !retryable) {
        if (attempt > 0) logger.warn(`retry:${tag}:exhausted`, { attempts: attempt + 1, message: err.message });
        throw err;
      }
      const delay = Math.round(baseDelayMs * 2 ** attempt + Math.random() * 100);
      logger.warn(`retry:${tag}:will-retry`, { attempt: attempt + 1, retries, delayMs: delay, message: err.message });
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastErr;
}
