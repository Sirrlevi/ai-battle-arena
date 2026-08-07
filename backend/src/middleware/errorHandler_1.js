import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    logger.error("request:handled-error", {
      path: req.path,
      code: err.code,
      status: err.httpStatus,
      provider: err.provider,
      message: err.message,
    });
    return res.status(err.httpStatus || 500).json(err.toJSON());
  }

  // express.json() throws a raw SyntaxError for malformed request bodies.
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    logger.warn("request:malformed-json", { path: req.path, message: err.message });
    return res.status(400).json({
      error: { code: "MALFORMED_JSON", message: "Request body is not valid JSON.", provider: null, model: null, detail: null },
    });
  }

  // The cors package calls next(err) with a plain Error when origin isn't allowed.
  if (typeof err.message === "string" && err.message.startsWith("CORS blocked")) {
    logger.warn("request:cors-blocked", { path: req.path, message: err.message });
    return res.status(403).json({
      error: { code: "CORS_BLOCKED", message: err.message, provider: null, model: null, detail: null },
    });
  }

  // Anything unexpected: log the full stack server-side, but never leak it to the client.
  logger.error("request:unhandled-error", { path: req.path, message: err.message, stack: err.stack });
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on the server.",
      provider: null,
      model: null,
      detail: null,
    },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}`, provider: null, model: null, detail: null },
  });
}
