import { Router } from "express";
import { getSession } from "../lib/sessionStore.js";
import { AUTHORITY_MODES, getAuthorityMode, setAuthorityMode, getRefereeEnabled, setRefereeEnabled } from "../lib/authority/authorityManager.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const authorityRouter = Router();

// GET /api/session/:id/authority -> current mode/referee + the last Reality
// Authority Layer decision, for the Reality Authority debug viewer.
authorityRouter.get("/session/:id/authority", (req, res, next) => {
  try {
    const session = getSession(req.params.id);
    if (!session) throw new AppError("Session not found or expired.", { code: "SESSION_NOT_FOUND", status: 404 });
    res.json({
      mode: getAuthorityMode(session),
      refereeEnabled: getRefereeEnabled(session),
      lastRealityEvent: session.lastRealityEvent || null,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/session/:id/authority  body: { mode?, refereeEnabled? }
authorityRouter.put("/session/:id/authority", (req, res, next) => {
  try {
    const session = getSession(req.params.id);
    if (!session) throw new AppError("Session not found or expired.", { code: "SESSION_NOT_FOUND", status: 404 });

    const { mode, refereeEnabled } = req.body || {};
    if (mode !== undefined) {
      if (!AUTHORITY_MODES.includes(mode)) {
        throw new AppError(`mode must be one of ${AUTHORITY_MODES.join(", ")}.`, { code: "VALIDATION_ERROR", status: 400 });
      }
      setAuthorityMode(session, mode);
    }
    if (refereeEnabled !== undefined) {
      setRefereeEnabled(session, !!refereeEnabled);
    }

    logger.info("authority:updated", { sessionId: req.params.id, mode: getAuthorityMode(session), refereeEnabled: getRefereeEnabled(session) });
    res.json({ mode: getAuthorityMode(session), refereeEnabled: getRefereeEnabled(session) });
  } catch (err) {
    next(err);
  }
});
