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
import { buildAttackPacket, actionFromAttackPacket, requestDefensePacket, recordNegotiationPacket, summarizeArbitration } from "../negotiation/negotiationProtocol.js";

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

  // ---------- Phase 3.9: Combat Profile + synchronized World State ----------
  // All authority modes now receive the same world-state contract before AI
  // decisions. Engine mode keeps Phase 3.8 deterministic resolution; Hybrid
  // layers packet negotiation over engine validation; AI Authority validates
  // packets/resources without inventing missing AI choices.
  let combatProfile = null;
  let enemyCombatProfile = null;
  let worldState = null;
  let defenderWorldState = null;
  let engineVerdict = null;

  {
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
    enemyCombatProfile = enemyProfile;

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
      selfProfile, enemyProfile, arenaMemory, battleMemory: mem,
      positions: { self: self.position || null, enemy: enemy.position || null },
      distance: Number.isFinite(self.distance) ? self.distance : null,
    });
    defenderWorldState = buildWorldStateView({
      round, selfState: enemyResourceState, enemyState: selfResourceState,
      selfProfile: enemyProfile, enemyProfile: selfProfile, arenaMemory, battleMemory: opponentMem,
      positions: { self: enemy.position || null, enemy: self.position || null },
      distance: Number.isFinite(self.distance) ? self.distance : null,
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

  const attackPacket = buildAttackPacket(parsed, { fighterKey, opponentKey, round, authorityMode, worldState });
  recordNegotiationPacket(session, fighterKey, attackPacket);
  const action = actionFromAttackPacket(attackPacket, parsed);

  // Stage 2 — Defender Response. The opponent gets the complete Attack
  // Packet plus the same synchronized world from their perspective. Provider
  // retry/timeout behavior is delegated to callModel; if it ultimately fails
  // we propagate the error instead of fabricating a defense.
  const defenderMemory = getOrCreateMemory(session, opponentKey, { personality: enemy.personality, combatStyle: enemy.combatStyle, weapon: enemy.weapon, aura: enemy.aura });
  const defensePacket = await requestDefensePacket({
    session, sessionId, defenderKey: opponentKey, attackerKey: fighterKey,
    config: session.fighters?.[opponentKey], round, defender: enemy, attackPacket,
    worldState: defenderWorldState || worldState, memory: defenderMemory,
    authorityMode, combatProfile: enemyCombatProfile, referer,
  });
  if (defensePacket) recordNegotiationPacket(session, opponentKey, defensePacket);

  // Reality Authority Layer: queried before the (client-side) battle engine
  // resolves this action. In "engine" mode this now carries the full,
  // deterministic Combat Engine verdict instead of being a no-op.
  const reality = evaluateAction(session, action);

  if ((authorityMode === "engine" || authorityMode === "hybrid") && session._combatTurnCtx) {
    const interpreted = interpretReality(action);
    const { selfProfile, enemyProfile, selfResourceState, enemyResourceState } = session._combatTurnCtx;
    engineVerdict = simulateTurn({
      session, fighterKey, opponentKey, action, interpreted,
      selfProfile, enemyProfile, selfState: selfResourceState, enemyState: enemyResourceState,
      round, arenaMemory, attackPacket, defensePacket, authorityMode,
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
    action, reality, narration, verdict: engineVerdict ? { ...engineVerdict, negotiation: engineVerdict.negotiation || { attackPacket, defensePacket, arbitration: summarizeArbitration({ authorityMode, validation: { valid: engineVerdict.valid, code: engineVerdict.code }, attackPacket, defensePacket }) } } : { negotiation: { attackPacket, defensePacket, arbitration: summarizeArbitration({ authorityMode, validation: null, attackPacket, defensePacket }) } },
    memorySnapshot: { goal: mem.currentGoal, strategyHint: strategy.hint },
  };
}
