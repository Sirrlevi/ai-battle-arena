// ---------- MEMORY MANAGER MODULE ----------
// Owns the shape and lifecycle of one fighter's isolated memory. Never
// shared between fighters — each fighter's memory lives at
// session.memory[fighterKey], created lazily and independently.

import { createPowerMemory, recordPowerUse } from "./powerTracker.js";
import { createTransformationMemory, recordTransformation } from "./transformationTracker.js";

const SHORT_TERM_LIMIT = 10;

export function createFighterMemory(fighterKey, character = {}) {
  return {
    fighterKey,
    personality: character.personality || "",
    weapon: character.weapon || "",
    aura: character.aura || "",
    combatStyle: character.combatStyle || "",
    currentGoal: "Assess the opponent and find an opening.",
    self: {
      hp: 100,
      energy: 100,
      status: [],
      position: null,
      movementState: "idle",
      currentForm: "base",
      knownAbilities: [],
      recentPowers: [],
      successfulAttacks: 0,
      failedAttacks: 0,
    },
    opponent: {
      powerTally: {},
      successTally: {}, // ability_name -> successful-hit count, for "most successful powers"
      mostUsedPowers: [],
      mostSuccessfulPowers: [],
      preferredRange: "unknown",
      aggressionLevel: "unknown",
      defensePattern: "unknown",
      movementHabits: "unknown",
      reactionPattern: "unknown",
      frequentCombos: [],
      comboTally: {},
      lastAbility: null,
      weaknesses: [],
      strengths: [],
      adaptations: [],
      healingBehavior: "none observed",
      healCount: 0,
      ultimateUsageCount: 0,
      blockCount: 0,
      missCount: 0,
      hitCount: 0,
    },
    power: createPowerMemory(),
    transformation: createTransformationMemory(),
    shortTerm: [], // rolling window, see ingestRecentTurns
    longTermSummary: [],
    strategy: { hint: "", lastComputedRound: 0 },
    turnsObserved: 0,
  };
}

export function getOrCreateMemory(session, fighterKey, character) {
  if (!session.memory) session.memory = {};
  if (!session.memory[fighterKey]) {
    session.memory[fighterKey] = createFighterMemory(fighterKey, character);
  }
  return session.memory[fighterKey];
}

export function resetSessionMemory(session) {
  session.memory = {};
}

export function seedIdentity(session, fighterKey, character) {
  const mem = getOrCreateMemory(session, fighterKey, character);
  mem.personality = character.personality || mem.personality;
  mem.weapon = character.weapon || mem.weapon;
  mem.aura = character.aura || mem.aura;
  mem.combatStyle = character.combatStyle || mem.combatStyle;
  return mem;
}

export function updateSelfState(mem, self) {
  mem.self.hp = self.hp;
  mem.self.energy = self.energy;
  mem.self.status = self.status || [];
  if (self.position) mem.self.position = self.position;
  if (self.movementState) mem.self.movementState = self.movementState;
  if (self.currentForm) mem.self.currentForm = self.currentForm;
}

/**
 * Folds a batch of recent turn records into this fighter's memory:
 * self-performance tallies for the fighter's own turns, opponent tallies +
 * power/transformation tracking for the opponent's turns. Turns are deduped
 * by round+actor so calling this repeatedly with an overlapping window is
 * safe (the frontend always sends "last ~10 turns", which overlaps call to
 * call).
 */
export function ingestRecentTurns(mem, recentTurns, fighterKey, opponentKey) {
  if (!Array.isArray(recentTurns) || recentTurns.length === 0) return;

  const seen = new Set(mem.shortTerm.map((t) => `${t.round}:${t.actorKey}`));
  for (const turn of recentTurns) {
    const id = `${turn.round}:${turn.actorKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    mem.turnsObserved += 1;

    const isSelf = turn.actorKey === fighterKey;
    const isOpponent = turn.actorKey === opponentKey;
    if (!isSelf && !isOpponent) continue;

    const eventType = turn.eventType || "attack";
    const isHeal = eventType === "healing";
    const isTransform = eventType === "transformation";
    const isUltimate = turn.isUltimate === true;

    if (isSelf) {
      mem.self.recentPowers = [turn.ability_name, ...mem.self.recentPowers].slice(0, 5);
      if (turn.ability_name && !mem.self.knownAbilities.includes(turn.ability_name)) mem.self.knownAbilities.push(turn.ability_name);
      if (turn.result === "hit" || turn.result === "lethal") mem.self.successfulAttacks += 1;
      else if (turn.result === "miss" || turn.result === "on_cooldown") mem.self.failedAttacks += 1;
      recordPowerUse(mem.power, { name: turn.ability_name, round: turn.round, category: eventType, result: turn.result });
      if (isTransform) recordTransformation(mem.transformation, { round: turn.round, form: turn.transformTo, trigger: turn.ability_name });
    } else {
      const opp = mem.opponent;
      opp.powerTally[turn.ability_name] = (opp.powerTally[turn.ability_name] || 0) + 1;
      if (turn.result === "hit" || turn.result === "lethal") {
        opp.successTally[turn.ability_name] = (opp.successTally[turn.ability_name] || 0) + 1;
      }
      if (opp.lastAbility) {
        const comboKey = `${opp.lastAbility}→${turn.ability_name}`;
        opp.comboTally[comboKey] = (opp.comboTally[comboKey] || 0) + 1;
      }
      opp.lastAbility = turn.ability_name;

      if (turn.result === "defend") opp.blockCount += 1;
      else if (turn.result === "miss") opp.missCount += 1;
      else if (turn.result === "hit" || turn.result === "lethal") opp.hitCount += 1;
      if (isHeal) opp.healCount += 1;
      if (isUltimate) opp.ultimateUsageCount += 1;

      recordPowerUse(mem.power, { name: turn.ability_name, round: turn.round, category: eventType, result: turn.result });
      if (isTransform) {
        recordTransformation(mem.transformation, { round: turn.round, form: turn.transformTo, trigger: turn.ability_name });
        opp.adaptations.push(`Transformed into "${turn.transformTo || "a new form"}" at round ${turn.round}.`);
        opp.adaptations = opp.adaptations.slice(-5);
      }
    }
  }

  const merged = [...mem.shortTerm, ...recentTurns.filter((t) => !mem.shortTerm.some((s) => s.round === t.round && s.actorKey === t.actorKey))];
  merged.sort((a, b) => a.round - b.round);
  mem.shortTerm = merged.slice(-SHORT_TERM_LIMIT);
}
