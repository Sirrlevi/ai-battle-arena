// ---------- DECISION ENGINE MODULE ----------
// Orchestrates one fighter's turn end to end:
//
//   Observe -> Update Memory -> Analyze -> Predict Opponent -> Select
//   Strategy -> Generate Action (LLM) -> Execute -> [next call] Store Result
//
// "Store Result" happens implicitly on the *next* call to this function:
// the actual hit/miss/damage for this turn is only known once the
// client-side battle engine resolves it, and that result comes back as
// part of `recentTurns` on the following request — ingestRecentTurns()
// folds it in then. This module is the only thing battleTurn.js talks to;
// every memory/strategy/authority module above is invisible to the route.

import { getOrCreateMemory, updateSelfState, ingestRecentTurns } from "./memoryManager.js";
import { analyzeOpponent } from "./opponentAnalyzer.js";
import { maybeCompress } from "./memoryCompressor.js";
import { chooseStrategy } from "./strategyEngine.js";
import { getOrCreateArenaMemory, updateArenaMemory } from "./arenaTracker.js";
import { buildTurnSystemPrompt, buildTurnUserPrompt } from "./promptBuilder.js";
import { getAuthorityMode, getRefereeEnabled } from "../authority/authorityManager.js";
import { evaluateAction } from "../authority/realityAuthorityLayer.js";
import { generateNarration } from "../referee/refereeNarrator.js";
import { callModel } from "../../providers/index.js";
import { extractJSON } from "../extractJson.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";

export async function runTurn({ session, sessionId, fighterKey, opponentKey, config, round, self, enemy, recentTurns, customPrompt, referer }) {
  // 1. Observe + 2. Update Memory
  const mem = getOrCreateMemory(session, fighterKey, { personality: self.personality, combatStyle: self.combatStyle, weapon: self.weapon, aura: self.aura });
  updateSelfState(mem, self);
  ingestRecentTurns(mem, recentTurns || [], fighterKey, opponentKey);
  const arenaMemory = updateArenaMemory(session, round);

  // 3. Analyze + 4. Predict Opponent
  const opponentAnalysis = analyzeOpponent(mem);
  maybeCompress(mem, opponentAnalysis);

  // 5. Select Strategy
  const strategy = chooseStrategy(mem, self, enemy);
  const authorityMode = getAuthorityMode(session);

  // 6. Generate Action
  const system = buildTurnSystemPrompt({
    fighterName: self.name,
    combatStyle: self.combatStyle || mem.combatStyle,
    personality: self.personality || mem.personality,
    weapon: mem.weapon,
    aura: mem.aura,
    customPrompt,
    strategyHint: strategy.hint,
    goal: mem.currentGoal,
    authorityMode,
  });
  const user = buildTurnUserPrompt({ round, mem, self, enemy, arenaMemory, authorityMode });

  logger.info("decisionEngine:turn", { sessionId, fighterKey, authorityMode, goal: mem.currentGoal, strategyHint: strategy.hint });

  const raw = await callModel({ provider: config.provider, apiKey: config.apiKey, model: config.model, systemPrompt: system, userPrompt: user, referer });

  const parsed = extractJSON(raw);
  if (!parsed) {
    logger.error("decisionEngine:parse-failed", { sessionId, fighterKey, provider: config.provider, raw });
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

  // Reality Authority Layer: queried before the (client-side) battle engine
  // resolves this action. In "engine" mode this is a no-op.
  const reality = evaluateAction(session, action);

  // Optional narrator (off by default, zero LLM cost — see refereeNarrator.js)
  let narration = null;
  if (getRefereeEnabled(session)) {
    narration = generateNarration({
      entry: { ability_name: action.ability_name, result: "pending", damage: null },
      realityEvent: reality,
      attackerName: self.name,
      defenderName: enemy.name,
    });
  }

  return { action, reality, narration, memorySnapshot: { goal: mem.currentGoal, strategyHint: strategy.hint } };
}
