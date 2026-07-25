export function characterPrompt(customPrompt) {
  return {
    system:
      `You are inventing a fictional combatant for a visual battle arena where each fighter is drawn as a ` +
      `colored stickman with a glowing aura. Respond with ONLY a JSON object, no prose, no markdown fences. Schema: ` +
      `{"name":string,"color":string (hex color for the stickman, e.g. "#7a00ff"),"aura":string (short description of the aura's color/feel, e.g. "Purple Void"),` +
      `"personality":string,"combatStyle":string,"weapon":string,"intro":string}. ` +
      `The intro is a short first-person line of dialogue (max 20 words).`,
    user: customPrompt?.trim()
      ? `Custom direction from the creator: ${customPrompt}`
      : `Invent an original fighter with a distinctive power set.`,
  };
}
function authorityGuidance(mode) {
  if (mode === "ai") {
    return `Authority Mode: AI AUTHORITY / Free Reality. You may author damage, healing, immortality, adaptation, transformations, new concepts, resurrection, and reality warping. The engine will display rather than reject claims. Anti-boring rule: do not instantly end the battle; escalate creatively and leave room for counterplay.`;
  }
  if (mode === "hybrid") {
    return `Authority Mode: HYBRID. You have narrative authority; the engine has gameplay authority. Make imaginative claims freely; they will be interpreted into structured combat events, damage, status, and renderer hints.`;
  }
  return `Authority Mode: ENGINE AUTHORITY. You choose intent only. The battle engine controls HP, damage, healing, energy, cooldowns, status effects, movement validation, death, victory, power scaling, and game rules.`;
}

export function turnSystemPrompt(fighterName, combatStyle, personality, customPrompt, authorityMode = "engine") {
  return (
    `You are ${fighterName}, a combatant in a turn-based fictional battle arena. ` +
    `Combat style: ${combatStyle}. Personality: ${personality}. Stay in character and adapt to memory. ` +
    `${authorityGuidance(authorityMode)} ` +
    `Before acting, observe memory, analyze opponent patterns, predict the opponent, select a strategy, then generate one action. ` +
    `Never be random. Avoid repeating failed strategies or spamming the same power. ` +
    `Respond with ONLY a JSON object, no prose, no markdown fences. Schema: ` +
    `{"thought":string,"action":"Attack"|"Defend"|"Special","ability_name":string,"description":string,"target":"Enemy",` +
    `"energy_cost":number (0-40),"expected_result":string}.` +
    (customPrompt?.trim() ? ` Additional direction: ${customPrompt.trim()}` : "")
  );
}

export function turnUserPrompt(round, self, enemy, recentHistory, promptContext = {}) {
  return JSON.stringify({
    round,
    you: { name: self.name, hp: self.hp, energy: self.energy, status: self.status || [], current_form: promptContext?.transformationMemory?.currentForm },
    enemy: { name: enemy.name, hp: enemy.hp, energy: enemy.energy, status: enemy.status || [] },
    memory_payload: {
      self_state: promptContext?.selfMemory || null,
      opponent_profile: promptContext?.opponentMemory || null,
      arena_state: promptContext?.arenaMemory || null,
      current_goal: promptContext?.strategyMemory?.objective || null,
      personality: promptContext?.personalityMemory || self.personality || null,
      recent_turns: promptContext?.recentTurns || recentHistory || "Battle just began.",
      long_term_summary: promptContext?.longTermSummary || "No compressed memory yet.",
      authority_mode: promptContext?.authorityMode || "engine",
      current_strategy: promptContext?.strategyMemory || null,
      known_powers: promptContext?.powerMemory || {},
      transformations: promptContext?.transformationMemory || {},
    },
    instruction: "Use only this compressed context. Pick an adaptive, in-character action as JSON.",
  });
}
