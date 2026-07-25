import { Router } from "express";
import { requireSession } from "./session.js";
import { callModel } from "../providers/index.js";
import { characterPrompt } from "../lib/promptManager.js";
import { extractJSON } from "../lib/extractJson.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const generateCharacterRouter = Router();

generateCharacterRouter.post("/generate-character", requireSession, async (req, res, next) => {
  try {
    const { fighter, customPrompt } = req.body || {};
    if (fighter !== "A" && fighter !== "B") {
      throw new AppError('fighter must be "A" or "B".', { code: "VALIDATION_ERROR", status: 400 });
    }

    const config = req.session.fighters[fighter];
    if (!config) {
      throw new AppError(`No provider/model/apiKey on file for fighter ${fighter}. Call PUT /api/session/:id/keys first.`, {
        code: "NO_API_KEY",
        status: 400,
        provider: null,
        model: null,
      });
    }

    const prompt = characterPrompt(customPrompt);
    const raw = await callModel({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      referer: req.headers.origin,
    });

    const parsed = extractJSON(raw);
    if (!parsed) {
      logger.error("generate-character:parse-failed", { sessionId: req.sessionId, fighter, provider: config.provider, raw });
      throw new AppError(`${config.provider} returned a response that wasn't valid JSON.`, {
        code: "INVALID_JSON_RESPONSE",
        status: 422,
        provider: config.provider,
        model: config.model,
        detail: { rawResponse: String(raw).slice(0, 500) },
      });
    }

    const character = {
      name: parsed.name || `Fighter ${fighter}`,
      color: parsed.color || "",
      appearance: parsed.appearance || "",
      combat_style: parsed.combat_style || "",
      personality: parsed.personality || "",
      introduction: parsed.introduction || "",
    };

    logger.info("generate-character:success", { sessionId: req.sessionId, fighter, provider: config.provider, name: character.name });
    res.json({ character });
  } catch (err) {
    next(err);
  }
});
