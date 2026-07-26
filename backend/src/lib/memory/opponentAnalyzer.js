// ---------- OPPONENT ANALYZER MODULE ----------
// Turns raw tallies accumulated by Memory Manager into a readable profile.
// Pure/deterministic — no LLM call, so this can run every single turn of a
// 100+ turn battle for free.

import { listPowers } from "./powerTracker.js";

const RANGE_KEYWORDS = {
  ranged: ["laser", "beam", "fire", "blast", "bolt", "arrow", "orb", "ray", "projectile"],
  melee: ["punch", "kick", "slash", "strike", "claw", "fist", "blade"],
};

function classifyRange(name) {
  const t = (name || "").toLowerCase();
  if (RANGE_KEYWORDS.ranged.some((w) => t.includes(w))) return "ranged";
  if (RANGE_KEYWORDS.melee.some((w) => t.includes(w))) return "melee";
  return null;
}

export function analyzeOpponent(mem) {
  const opp = mem.opponent;

  const usedEntries = Object.entries(opp.powerTally).sort((a, b) => b[1] - a[1]);
  opp.mostUsedPowers = usedEntries.slice(0, 3).map(([name, count]) => ({ name, count }));

  const successEntries = Object.entries(opp.successTally).sort((a, b) => b[1] - a[1]);
  opp.mostSuccessfulPowers = successEntries.slice(0, 3).map(([name, count]) => ({ name, count }));

  let ranged = 0, melee = 0;
  for (const [name, count] of usedEntries) {
    const r = classifyRange(name);
    if (r === "ranged") ranged += count;
    else if (r === "melee") melee += count;
  }
  opp.preferredRange = ranged === 0 && melee === 0 ? "unknown" : ranged > melee * 1.3 ? "ranged" : melee > ranged * 1.3 ? "melee" : "mixed";

  const totalActions = opp.hitCount + opp.missCount + opp.blockCount;
  const blockRatio = totalActions ? opp.blockCount / totalActions : 0;
  opp.aggressionLevel = totalActions === 0 ? "unknown" : blockRatio > 0.35 ? "low" : blockRatio > 0.15 ? "medium" : "high";
  opp.defensePattern = opp.blockCount === 0 ? "rarely guards" : blockRatio > 0.3 ? "guards frequently" : "guards occasionally";
  opp.movementHabits = mem.opponent.preferredRange === "ranged" ? "tends to keep distance" : mem.opponent.preferredRange === "melee" ? "closes distance aggressively" : "mixes distance";
  opp.reactionPattern = opp.missCount > opp.hitCount && totalActions >= 4 ? "overextends, frequently whiffs" : opp.blockCount >= 3 ? "reacts defensively to pressure" : "engages steadily";
  opp.healingBehavior = opp.healCount === 0 ? "none observed" : opp.healCount >= 3 ? "heals frequently — sustain-focused" : "heals occasionally";

  opp.frequentCombos = Object.entries(opp.comboTally)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([combo, count]) => ({ combo, count }));

  const patterns = [];
  if (opp.mostUsedPowers[0]) patterns.push(`Frequently uses "${opp.mostUsedPowers[0].name}" (${opp.mostUsedPowers[0].count}x).`);
  if (opp.mostSuccessfulPowers[0] && opp.mostSuccessfulPowers[0].name !== opp.mostUsedPowers[0]?.name) {
    patterns.push(`"${opp.mostSuccessfulPowers[0].name}" has landed most successfully.`);
  }
  if (opp.preferredRange !== "unknown") patterns.push(`Favors ${opp.preferredRange} range.`);
  patterns.push(`${opp.defensePattern[0].toUpperCase()}${opp.defensePattern.slice(1)}.`);
  if (opp.frequentCombos[0]) {
    const [a, b] = opp.frequentCombos[0].combo.split("→");
    patterns.push(`Often follows ${a} with ${b}.`);
  }
  if (opp.ultimateUsageCount > 0) patterns.push(`Has used an ultimate-tier move ${opp.ultimateUsageCount}x.`);
  if (mem.transformation.history.length > 0) patterns.push(`Has transformed ${mem.transformation.history.length}x this battle.`);
  opp.observedPatterns = patterns;

  opp.weaknesses = [];
  opp.strengths = [];
  if (blockRatio < 0.1 && totalActions >= 4) opp.weaknesses.push("Rarely defends — vulnerable to sustained pressure.");
  if (opp.preferredRange === "ranged") opp.weaknesses.push("Relies on ranged attacks — closing distance may limit options.");
  if (opp.hitCount > opp.missCount * 2 && totalActions >= 4) opp.strengths.push("High accuracy — attacks land consistently.");
  if (opp.mostUsedPowers[0]?.count >= 3) opp.strengths.push(`Has a reliable go-to move ("${opp.mostUsedPowers[0].name}").`);
  if (opp.healingBehavior !== "none observed") opp.strengths.push("Has sustain via healing — burst damage may be more effective than attrition.");

  return {
    ...opp,
    topPowers: listPowers(mem.power).slice(0, 5),
  };
}
