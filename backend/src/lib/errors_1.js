// A single, consistent error shape for anything that can go wrong while
// talking to an LLM provider or handling a request. Every route funnels
// its failures through this so the client always gets the same envelope:
//
// { "error": { "code", "message", "provider", "model", "status", "detail" } }

export class AppError extends Error {
  constructor(message, { code = "INTERNAL_ERROR", status = 500, provider = null, model = null, detail = null } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = status; // status code THIS server returns to the client
    this.provider = provider;
    this.model = model;
    this.detail = detail; // upstream provider status/body, if any
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        provider: this.provider,
        model: this.model,
        detail: this.detail,
      },
    };
  }
}

export class ProviderError extends AppError {
  constructor(message, { code = "PROVIDER_ERROR", status = 502, provider, model, upstreamStatus = null, upstreamBody = null } = {}) {
    super(message, {
      code,
      status,
      provider,
      model,
      detail: { upstreamStatus, upstreamBody },
    });
    this.name = "ProviderError";
    this.upstreamStatus = upstreamStatus;
  }
}
