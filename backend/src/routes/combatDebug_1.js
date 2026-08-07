import { Router } from "express";
import { getSession } from "../lib/sessionStore.js";
import { AppError } from "../lib/errors.js";

export const combatDebugRouter = Router();

// GET /api/session/:id/combat -> Combat Profiles, live resources, ability
// registry, and the tier scale, per fighter. Developer-mode only (spec
// section 15) — same "intentionally verbose" spirit as memoryView.js.
combatDebugRouter.get("/session/:id/combat", (req, res, next) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      throw new AppError("Session not found or expired.", { code: "SESSION_NOT_FOUND", status: 404 });
    }

    res.json({
      combatProfiles: session.combatProfiles || {},
      resources: session.resources || {},
      abilityRegistry: session.abilityRegistry || {},
      negotiationMemory: session.negotiationMemory || {},
    });
  } catch (err) {
    next(err);
  }
});
