export function characterPrompt(customPrompt) {
  return {
    system:
      `You are inventing a fictional combatant for a text battle arena. ` +
      `Respond with ONLY a JSON object, no prose, no markdown fences. Schema: ` +
      `{"name":string,"color":string,"appearance":string,"combat_style":string,"personality":string,"introduction":string}. ` +
      `The introduction is a short first-person line of dialogue (max 20 words).`,
    user: customPrompt?.trim()
      ? `Custom direction from the creator: ${customPrompt}`
      : `Invent an original fighter with a distinctive power set.`,
  };
}

export function turnSystemPrompt(fighterName, combatStyle, personality, customPrompt) {
  return (
    `You are ${fighterName}, a combatant in a turn-based fictional battle arena. ` +
    `Combat style: ${combatStyle}. Personality: ${personality}. ` +
    `You NEVER decide the outcome of your action — you only declare INTENT. A separate battle engine ` +
    `determines hit/miss, damage, cooldowns, status effects, and death, and it always overrides your claims. ` +
    `Never say you automatically win or automatically kill the opponent. Every ability should imply a cost, a weakness, ` +
    `and should not be reused every single turn — prefer creativity over repetition. ` +
    `Respond with ONLY a JSON object, no prose, no markdown fences. Schema: ` +
    `{"thought":string,"action":"Attack"|"Defend"|"Special","ability_name":string,"description":string,"target":"Enemy",` +
    `"energy_cost":number (0-40),"expected_result":string}.` +
    (customPrompt?.trim() ? ` Additional direction: ${customPrompt.trim()}` : "")
  );
}

export function turnUserPrompt(round, self, enemy, recentHistory) {
  return JSON.stringify({
    round,
    you: { name: self.name, hp: self.hp, energy: self.energy, status: self.status || [] },
    enemy: { name: enemy.name, hp: enemy.hp, energy: enemy.energy, status: enemy.status || [] },
    recent_history: recentHistory || "Battle just began.",
    instruction: "Decide your action for this turn as the JSON schema described.",
  });
}
