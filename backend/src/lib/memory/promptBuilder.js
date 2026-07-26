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

export function buildTurnSystemPrompt({ fighterName, combatStyle, personality, weapon, aura, customPrompt, strategyHint, goal, authorityMode, combatProfile }) {
  const profileClause = combatProfile
    ? ` Your Combat Profile (the mechanical ground truth for this battle — stay consistent with it): tier ${combatProfile.combatTier}, ` +
      `strength ${combatProfile.strength}/10, speed ${combatProfile.speed}/10, durability ${combatProfile.durability}/10, ` +
      `known powers: ${combatProfile.knownPowers?.length ? combatProfile.knownPowers.join(", ") : "none notable"}.` +
      `${combatProfile.weaknesses?.length ? ` Your weaknesses: ${combatProfile.weaknesses.join(", ")}.` : ""}`
    : "";
  return (
    `You are ${fighterName}, a combatant in a turn-based fictional battle arena. ` +
    `Combat style: ${combatStyle || "unspecified"}. Personality: ${personality || "unspecified"}. ` +
    `Weapon: ${weapon || "none stated"}. Aura: ${aura || "none stated"}. ` +
    `Stay true to this personality for the entire battle — it must not drift turn to turn. ` +
    `${AUTHORITY_CLAUSE[authorityMode] || AUTHORITY_CLAUSE.engine}${profileClause} ` +
    `Every ability should imply a cost or a weakness and should not be reused every single turn — prefer creativity over repetition. ` +
    `You can see your own and your opponent's HP, energy, mana, stamina, cooldowns, and status effects each turn in the ` +
    `"world_state" of the user message — use them. Do not declare an ability you cannot afford or that is on cooldown; ` +
    `pick something you can actually do this turn. ` +
    `Current goal: ${goal}.${strategyHint ? ` Strategic notes: ${strategyHint}` : ""} ` +
    `Phase 3.9: first create an Attack Packet. The packet describes your intended action only; it does not decide damage or success. ` +
    `Respond with ONLY a JSON object, no prose, no markdown fences. Schema: ` +
    `{"thought":string,"action":"Attack"|"Defend"|"Special","action_name":string,"ability_name":string,"ability_used":string,` +
    `"description":string,"target":"Enemy","power_category":string,"element":string,"intent":string,"expected_result":string,` +
    `"energy_cost":number (0-40),"mana_cost":number,"stamina_cost":number,"cooldown":number,"range":string,"area_of_effect":string,` +
    `"movement":string,"follow_up_plan":string,"special_effects":array,"status_effects":array,"reality_effects":array,"timeline_effects":array,` +
    `"reason":string (why this action given world_state),"risk":"low"|"medium"|"high"}.` +
    (customPrompt?.trim() ? ` Additional direction: ${customPrompt.trim()}` : "")
  );
}

export function buildTurnUserPrompt({ round, mem, self, enemy, arenaMemory, authorityMode, worldState }) {
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
    // Phase 3.8: the Combat Engine's live World State — the fighter's actual
    // resources/cooldowns/status effects/tier, not just hp/energy. Only
    // populated in Engine authority mode (see decisionEngine.js); absent
    // (undefined, dropped by JSON.stringify) otherwise so AI/Hybrid prompts
    // are byte-for-byte unchanged.
    world_state: worldState || undefined,
    recent_events: recentEvents.length ? recentEvents : ["Battle just began."],
    long_term_memory: mem.longTermSummary,
    current_goal: mem.currentGoal,
    instruction: "Stage 1 — Attacker Intent: create an Attack Packet using the schema described. Use the synchronized world_state, your identity, opponent awareness, current form, resources, cooldowns, and battle memory.",
  });
}
