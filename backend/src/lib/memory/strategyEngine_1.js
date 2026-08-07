// ---------- STRATEGY ENGINE MODULE ----------
// Deterministic tactical advisor — runs every turn before the LLM is
// called, so the AI's action feels like a response to the battle so far
// rather than an isolated random choice. Produces a short natural-language
// hint injected into the prompt; the LLM still writes the actual action.

export function chooseStrategy(mem, self, enemy) {
  const hints = [];
  let goal = mem.currentGoal;

  if (self.hp <= 30) {
    hints.push("Own HP is low — prioritize survival: consider defending, disengaging, or a high-value move only if it can end the fight.");
    goal = "Survive and look for a decisive opening.";
  } else if (enemy.hp <= 30) {
    hints.push("Opponent HP is low — press the advantage and avoid low-value setup moves.");
    goal = "Finish the fight.";
  } else {
    goal = "Wear down the opponent while probing their defenses.";
  }

  if (mem.opponent.preferredRange === "ranged") {
    hints.push("Opponent favors ranged attacks — closing distance may reduce their options.");
  } else if (mem.opponent.preferredRange === "melee") {
    hints.push("Opponent favors melee — keeping distance may create openings.");
  }
  if (mem.opponent.defensePattern === "guards frequently") {
    hints.push("Opponent guards often — attacks that bypass or punish guarding may work better than repeated raw damage.");
  }
  if (mem.opponent.mostUsedPowers[0]?.count >= 3) {
    hints.push(`Opponent leans heavily on "${mem.opponent.mostUsedPowers[0].name}" — anticipate it.`);
  }
  if (mem.opponent.healingBehavior !== "none observed") {
    hints.push("Opponent has shown healing — sustained pressure may outpace their recovery.");
  }
  if (self.energy < 20) {
    hints.push("Own energy is low — favor cheaper techniques this turn.");
  }
  if (mem.self.failedAttacks >= 3 && mem.self.failedAttacks > mem.self.successfulAttacks) {
    hints.push("Recent attacks have underperformed — try a different technique than the last few turns.");
  }

  mem.currentGoal = goal;
  mem.strategy = { hint: hints.join(" "), lastComputedRound: mem.turnsObserved };
  return mem.strategy;
}
