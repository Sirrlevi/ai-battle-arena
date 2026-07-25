import { Router } from "express";
import { createSession, getSession, setFighterConfig } from "../lib/sessionStore.js";
import { SUPPORTED_PROVIDERS } from "../providers/index.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const sessionRouter = Router();

// POST /api/session -> { sessionId }
sessionRouter.post("/session", (req, res) => {
  const sessionId = createSession();
  res.status(201).json({ sessionId });
});

function validateFighterConfig(fighter, label) {
  if (!fighter || typeof fighter !== "object") {
    throw new AppError(`Missing config for ${label}.`, { code: "VALIDATION_ERROR", status: 400 });
  }
  const { provider, model, apiKey } = fighter;
  if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
    throw new AppError(`${label}: provider must be one of ${SUPPORTED_PROVIDERS.join(", ")}.`, {
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  if (!apiKey || typeof apiKey !== "string") {
    throw new AppError(`${label}: apiKey is required.`, { code: "VALIDATION_ERROR", status: 400 });
  }
  if (!model || typeof model !== "string") {
    throw new AppError(`${label}: model is required.`, { code: "VALIDATION_ERROR", status: 400 });
  }
  return { provider, model, apiKey };
}

// PUT /api/session/:id/keys  body: { fighterA: {provider, model, apiKey}, fighterB: {...} }
// Keys are held only in server memory for this session and are never echoed back.
sessionRouter.put("/session/:id/keys", (req, res, next) => {
  try {
    const { id } = req.params;
    const session = getSession(id);
    if (!session) {
      throw new AppError("Session not found or expired. Create a new one via POST /api/session.", {
        code: "SESSION_NOT_FOUND",
        status: 404,
      });
    }

    const fighterA = validateFighterConfig(req.body?.fighterA, "fighterA");
    const fighterB = validateFighterConfig(req.body?.fighterB, "fighterB");

    setFighterConfig(id, "A", fighterA);
    setFighterConfig(id, "B", fighterB);

    logger.info("session:keys-set", { sessionId: id, providerA: fighterA.provider, providerB: fighterB.provider });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export function requireSession(req, res, next) {
  const sessionId = req.body?.sessionId || req.query?.sessionId;
  if (!sessionId) {
    return next(new AppError("sessionId is required.", { code: "VALIDATION_ERROR", status: 400 }));
  }
  const session = getSession(sessionId);
  if (!session) {
    return next(new AppError("Session not found or expired. Create a new one via POST /api/session.", {
      code: "SESSION_NOT_FOUND",
      status: 404,
    }));
  }
  req.session = session;
  req.sessionId = sessionId;
  next();
}
