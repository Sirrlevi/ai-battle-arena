import { Router } from "express";
import { requireSession } from "./session.js";
import { runTurn } from "../lib/memory/decisionEngine.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const battleTurnRouter = Router();

battleTurnRouter.post("/battle-turn", requireSession, async (req, res, next) => {
  try {
    const { fighter, round, self, enemy, recentTurns, customPrompt } = req.body || {};
    if (fighter !== "A" && fighter !== "B") {
      throw new AppError('fighter must be "A" or "B".', { code: "VALIDATION_ERROR", status: 400 });
    }
    if (!self?.name || !enemy?.name) {
      throw new AppError("self and enemy (with at least a name) are required.", { code: "VALIDATION_ERROR", status: 400 });
    }

    const opponentKey = fighter === "A" ? "B" : "A";
    const config = req.session.fighters[fighter];
    if (!config) {
      throw new AppError(`No provider/model/apiKey on file for fighter ${fighter}. Call PUT /api/session/:id/keys first.`, {
        code: "NO_API_KEY",
        status: 400,
      });
    }

    // recentTurns is the structured Short-Term Memory window the frontend
    // battle log keeps (last ~10 entries). Backward compatible: an older
    // client sending nothing here just means the memory pipeline starts
    // "cold" rather than failing.
    const turns = Array.isArray(recentTurns) ? recentTurns : [];

    const { action, reality, narration, verdict, attackPacket, defensePacket } = await runTurn({
      session: req.session,
      sessionId: req.sessionId,
      fighterKey: fighter,
      opponentKey,
      config,
      round: round || 1,
      self,
      enemy,
      recentTurns: turns,
      customPrompt,
      referer: req.headers.origin,
    });

    logger.info("battle-turn:success", { sessionId: req.sessionId, fighter, provider: config.provider, ability: action.ability_name, verdictCode: verdict?.code, defenseChosen: defensePacket?.chosenResponse });
    res.json({ action, reality, narration, verdict, attackPacket, defensePacket });
  } catch (err) {
    next(err);
  }
});
