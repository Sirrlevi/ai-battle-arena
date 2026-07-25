import { Router } from "express";
import { requireSession } from "./session.js";
import { callModel } from "../providers/index.js";
import { turnSystemPrompt, turnUserPrompt } from "../lib/promptManager.js";
import { extractJSON } from "../lib/extractJson.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const battleTurnRouter = Router();

battleTurnRouter.post("/battle-turn", requireSession, async (req, res, next) => {
  try {
    const { fighter, round, self, enemy, recentHistory, customPrompt, promptContext } = req.body || {};
    if (fighter !== "A" && fighter !== "B") {
      throw new AppError('fighter must be "A" or "B".', { code: "VALIDATION_ERROR", status: 400 });
    }
    if (!self?.name || !enemy?.name) {
      throw new AppError("self and enemy (with at least a name) are required.", { code: "VALIDATION_ERROR", status: 400 });
    }

    const config = req.session.fighters[fighter];
    if (!config) {
      throw new AppError(`No provider/model/apiKey on file for fighter ${fighter}. Call PUT /api/session/:id/keys first.`, {
        code: "NO_API_KEY",
        status: 400,
      });
    }

    const authorityMode = promptContext?.authorityMode || "engine";
    const system = turnSystemPrompt(self.name, self.combatStyle || self.combat_style || "unspecified", self.personality || "unspecified", customPrompt, authorityMode);
    const user = turnUserPrompt(round || 1, self, enemy, recentHistory, promptContext);

    const raw = await callModel({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: system,
      userPrompt: user,
      referer: req.headers.origin,
    });

    const parsed = extractJSON(raw);
    if (!parsed) {
      logger.error("battle-turn:parse-failed", { sessionId: req.sessionId, fighter, provider: config.provider, raw });
      throw new AppError(`${config.provider} returned a response that wasn't valid JSON.`, {
        code: "INVALID_JSON_RESPONSE",
        status: 422,
        provider: config.provider,
        model: config.model,
        detail: { rawResponse: String(raw).slice(0, 500) },
      });
    }

    const action = {
      thought: parsed.thought || "",
      action: parsed.action || "Attack",
      ability_name: parsed.ability_name || "Basic Strike",
      description: parsed.description || "",
      target: parsed.target || "Enemy",
      energy_cost: Number.isFinite(parsed.energy_cost) ? parsed.energy_cost : 12,
      expected_result: parsed.expected_result || "",
    };

    logger.info("battle-turn:success", { sessionId: req.sessionId, fighter, provider: config.provider, ability: action.ability_name });
    res.json({ action });
  } catch (err) {
    next(err);
  }
});
