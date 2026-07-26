// ---------- PROMPT BUILDER MODULE ----------
// Assembles the actual system/user prompt sent to the LLM each turn, from
// everything the pipeline has computed: self state, opponent profile,
// arena state, current goal, personality, recent turns, long-term summary,
// authority mode, and current strategy. Never sends unbounded history —
// only mem.shortTerm (capped at 10) and mem.longTermSummary (capped at 6
// short lines) ever go in.

import { ANTI_BORING_PROMPT_CLAUSE } from "../authority/antiBoringRule.js";

const AUTHORITY_CLAUSE = {
  engine:
    "A separate battle engine determines hit/miss, damage, cooldowns, status effects, and death, and it always " +
    "overrides your claims. Never say you automatically win or automatically kill the opponent.",
  ai:
    "You have full Reality Authority this battle: your declared outcomes (damage, healing, transformation, " +
    "adaptation, reality effects) are trusted and applied directly — the engine only records and displays them. " +
    ANTI_BORING_PROMPT_CLAUSE,
  hybrid:
    "You have narrative authority; the engine has gameplay authority. Describe your action as imaginatively as " +
    "you like — the engine will interpret it into a structured, balanced outcome (it will not reject creative " +
    "claims, but it will scale them into fair gameplay numbers). " +
    ANTI_BORING_PROMPT_CLAUSE,
};

export function buildTurnSystemPrompt({ fighterName, combatStyle, personality, weapon, aura, customPrompt, strategyHint, goal, authorityMode }) {
  return (
    `You are ${fighterName}, a combatant in a turn-based fictional battle arena. ` +
    `Combat style: ${combatStyle || "unspecified"}. Personality: ${personality || "unspecified"}. ` +
    `Weapon: ${weapon || "none stated"}. Aura: ${aura || "none stated"}. ` +
    `Stay true to this personality for the entire battle — it must not drift turn to turn. ` +
    `${AUTHORITY_CLAUSE[authorityMode] || AUTHORITY_CLAUSE.engine} ` +
    `Every ability should imply a cost or a weakness and should not be reused every single turn — prefer creativity over repetition. ` +
    `Current goal: ${goal}.${strategyHint ? ` Strategic notes: ${strategyHint}` : ""} ` +
    `Respond with ONLY a JSON object, no prose, no markdown fences. Schema: ` +
    `{"thought":string,"action":"Attack"|"Defend"|"Special","ability_name":string,"description":string,"target":"Enemy",` +
    `"energy_cost":number (0-40),"expected_result":string}.` +
    (customPrompt?.trim() ? ` Additional direction: ${customPrompt.trim()}` : "")
  );
}

export function buildTurnUserPrompt({ round, mem, self, enemy, arenaMemory, authorityMode }) {
  const recentEvents = mem.shortTerm.slice(-6).map((t) => {
    const who = t.actorKey === mem.fighterKey ? "You" : "Opponent";
    const reasoning = t.thought ? ` (reasoning: "${t.thought}")` : "";
    return `R${t.round} ${who} used "${t.ability_name}" (${t.action}) → ${t.result}${t.damage ? `, ${t.damage} dmg` : ""}${reasoning}`;
  });

  return JSON.stringify({
    round,
    authority_mode: authorityMode,
    you: {
      name: self.name,
      hp: self.hp,
      energy: self.energy,
      status: self.status || [],
      current_form: mem.self.currentForm,
      recent_powers: mem.self.recentPowers,
    },
    opponent: {
      name: enemy.name,
      hp: enemy.hp,
      energy: enemy.energy,
      status: enemy.status || [],
      profile: {
        most_used_powers: mem.opponent.mostUsedPowers.map((p) => p.name),
        most_successful_powers: mem.opponent.mostSuccessfulPowers.map((p) => p.name),
        preferred_range: mem.opponent.preferredRange,
        defense_pattern: mem.opponent.defensePattern,
        healing_behavior: mem.opponent.healingBehavior,
        observed_patterns: mem.opponent.observedPatterns,
      },
    },
    arena: {
      round: arenaMemory.round,
      active_events: arenaMemory.events.map((e) => e.label),
      weather: arenaMemory.weather,
      gravity: arenaMemory.gravity,
    },
    recent_events: recentEvents.length ? recentEvents : ["Battle just began."],
    long_term_memory: mem.longTermSummary,
    current_goal: mem.currentGoal,
    instruction: "Decide your action for this turn as the JSON schema described, staying consistent with your personality and the strategic notes.",
  });
}
