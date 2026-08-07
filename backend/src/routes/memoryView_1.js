import { Router } from "express";
import { getSession } from "../lib/sessionStore.js";
import { getOrCreateArenaMemory } from "../lib/memory/arenaTracker.js";
import { listPowers } from "../lib/memory/powerTracker.js";
import { AppError } from "../lib/errors.js";

export const memoryViewRouter = Router();

// GET /api/session/:id/memory -> full per-fighter memory + shared arena memory.
// Debug/developer use only — this is intentionally verbose.
memoryViewRouter.get("/session/:id/memory", (req, res, next) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      throw new AppError("Session not found or expired.", { code: "SESSION_NOT_FOUND", status: 404 });
    }

    const memory = session.memory || {};
    const shaped = {};
    for (const [key, mem] of Object.entries(memory)) {
      shaped[key] = {
        ...mem,
        power: { entries: listPowers(mem.power) },
      };
    }

    res.json({ memory: shaped, arena: getOrCreateArenaMemory(session) });
  } catch (err) {
    next(err);
  }
});
