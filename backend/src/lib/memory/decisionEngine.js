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
import { interpretReality } from "../authority/realityInterpreter.js";
import { generateNarration } from "../referee/refereeNarrator.js";
import { callModel } from "../../providers/index.js";
import { extractJSON } from "../extractJson.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";
import { getOrExtractCombatProfile } from "../combat/combatProfile.js";
import { getOrCreateResourceState, syncExternalVitals, regenTick } from "../combat/resources.js";
import { buildWorldStateView } from "../combat/worldState.js";
import { simulateTurn, tickRoundStart } from "../combat/combatEngine.js";

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

  // ---------- Phase 3.8: Combat Profile + World State ----------
  // Only in Engine authority mode — this is the "combat engine rewrite"
  // target. AI/Hybrid authority keep their exact pre-3.8 prompt/behavior
  // (spec: "DO NOT redesign", "only improve the internal combat engine").
  let combatProfile = null;
  let worldState = null;
  let engineVerdict = null;

  if (authorityMode === "engine") {
    const opponentMem = session.memory?.[opponentKey];
    const [selfProfile, enemyProfile] = await Promise.all([
      getOrExtractCombatProfile(session, fighterKey, {
        config, referer, sessionId,
        character: { name: self.name, personality: mem.personality, combatStyle: mem.combatStyle, weapon: mem.weapon, aura: mem.aura },
        customPrompt,
      }),
      getOrExtractCombatProfile(session, opponentKey, {
        config: session.fighters?.[opponentKey] || config, referer, sessionId,
        character: {
          name: enemy.name,
          personality: opponentMem?.personality, combatStyle: opponentMem?.combatStyle,
          weapon: opponentMem?.weapon, aura: opponentMem?.aura,
        },
      }),
    ]);
    combatProfile = selfProfile;

    const selfResourceState = getOrCreateResourceState(session, fighterKey, selfProfile);
    const enemyResourceState = getOrCreateResourceState(session, opponentKey, enemyProfile);
    syncExternalVitals(selfResourceState, self);
    syncExternalVitals(enemyResourceState, enemy);

    // Round-start DoT ticks (burn/poison/bleed/etc.) happen once, keyed off
    // this fighter's own upkeep step, before they act.
    tickRoundStart(selfResourceState);
    regenTick(selfResourceState);

    worldState = buildWorldStateView({
      round, selfState: selfResourceState, enemyState: enemyResourceState,
      selfProfile, enemyProfile, arenaMemory,
    });

    // Stash on session so battleTurn.js / combat debug endpoint can read it
    // without recomputing, and so simulateTurn below can mutate the same
    // object it just built the prompt view from.
    session._combatTurnCtx = { selfProfile, enemyProfile, selfResourceState, enemyResourceState };
  }

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
    combatProfile,
  });
  const user = buildTurnUserPrompt({ round, mem, self, enemy, arenaMemory, authorityMode, worldState });

  logger.info("decisionEngine:turn", { sessionId, fighterKey, authorityMode, goal: mem.currentGoal, strategyHint: strategy.hint });

  const raw = await callModel({ provider: config.provider, apiKey: config.apiKey, model: config.model, systemPrompt: system, userPrompt: user, referer });

  const parsed = extractJSON(raw);
  if (!parsed) {
    // Spec section 13: if the AI response fails, the engine must NOT invent
    // an attack on its own — pause/retry/fallback already happened inside
    // callModel (see providers/index.js + lib/retry.js); this is the final
    // failure after those are exhausted, so we surface it as an error
    // rather than fabricating an action here.
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
    // Phase 3.8 Action Intent fields (spec section 5) — additive, always
    // present (empty string/default when the model omits them) so callers
    // never have to guard against missing keys.
    reason: parsed.reason || "",
    risk: ["low", "medium", "high"].includes(parsed.risk) ? parsed.risk : "medium",
    movement: parsed.movement || "",
    follow_up_plan: parsed.follow_up_plan || "",
  };

  // Reality Authority Layer: queried before the (client-side) battle engine
  // resolves this action. In "engine" mode this now carries the full,
  // deterministic Combat Engine verdict instead of being a no-op.
  const reality = evaluateAction(session, action);

  if (authorityMode === "engine" && session._combatTurnCtx) {
    const interpreted = interpretReality(action);
    const { selfProfile, enemyProfile, selfResourceState, enemyResourceState } = session._combatTurnCtx;
    engineVerdict = simulateTurn({
      session, fighterKey, opponentKey, action, interpreted,
      selfProfile, enemyProfile, selfState: selfResourceState, enemyState: enemyResourceState,
      round, arenaMemory,
    });
  }

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

  return {
    action, reality, narration, verdict: engineVerdict,
    memorySnapshot: { goal: mem.currentGoal, strategyHint: strategy.hint },
  };
}
