export const AUTHORITY_MODES = { ENGINE: "engine", AI: "ai", HYBRID: "hybrid" };

export function interpretRealityClaim(action = {}, mode = AUTHORITY_MODES.ENGINE) {
  const text = `${action.action || ""} ${action.ability_name || ""} ${action.description || ""} ${action.expected_result || ""}`.toLowerCase();
  const type = /heal|regen|restore|resurrect/.test(text) ? "Healing" : /shield|barrier|guard|defend/.test(text) ? "Shield" : /teleport|blink|warp/.test(text) ? "Teleport" : /summon|create ally/.test(text) ? "Summon" : /transform|evolve|ascend|form/.test(text) ? "Transformation" : /time stop|freeze time/.test(text) ? "Time Stop" : /rewrite|reality|concept|dimension|universe|omniversal/.test(text) ? "Reality Rewrite" : /beam|laser|ray/.test(text) ? "Beam" : /projectile|orb|bolt|missile/.test(text) ? "Projectile" : "Attack";
  const element = /void/.test(text) ? "Void" : /fire|flame/.test(text) ? "Fire" : /ice|frost/.test(text) ? "Ice" : /lightning|storm|thunder/.test(text) ? "Lightning" : /shadow|dark/.test(text) ? "Shadow" : /holy|light/.test(text) ? "Light" : "Kinetic";
  const scale = /infinite|omniversal|universe|cosmic|god/.test(text) ? "Cosmic" : /massive|ultimate|final|colossal/.test(text) ? "Extreme" : "Standard";
  return { authorityMode: mode, translatedType: type, element, scale, intensity: scale === "Cosmic" ? "Extreme" : action.energy_cost >= 30 ? "High" : "Moderate", specialEffects: [type !== "Attack" ? type : null, element !== "Kinetic" ? `${element} aura` : null, scale === "Cosmic" ? "Reality crack" : null].filter(Boolean), rendererHints: { effect: element.toLowerCase(), magnitude: scale }, antiBoringGuidance: mode !== AUTHORITY_MODES.ENGINE ? "Escalate creatively while preserving counterplay; avoid instant-win closure." : "Engine rules are authoritative." };
}
export function applyAuthority(mode, engineResolver, round, attacker, defender, action) {
  const interpreterOutput = interpretRealityClaim(action, mode);
  const aiDecision = { claimedResult: action?.expected_result || "intent only", action };
  if (mode === AUTHORITY_MODES.AI) {
    const entry = { round, actorKey: attacker.key, actorName: attacker.name, defenderKey: defender.key, thought: action?.thought || "", action: action?.action || interpreterOutput.translatedType, ability_name: action?.ability_name || interpreterOutput.translatedType, description: action?.description || "", result: "ai_claim", damage: 0, effect: interpreterOutput.rendererHints.effect, narrativeNote: action?.expected_result || "AI-authored reality event accepted.", interpreterOutput, aiDecision, engineDecision: "AI Authority: engine coordinated the turn and did not override claims." };
    return entry;
  }
  const entry = engineResolver(round, attacker, defender, action);
  entry.interpreterOutput = interpreterOutput; entry.aiDecision = aiDecision;
  entry.engineDecision = mode === AUTHORITY_MODES.HYBRID ? "Hybrid Authority: narrative accepted, gameplay values calculated by engine." : "Engine Authority: engine resolved HP, damage, energy, cooldowns, hit/miss, death, and victory.";
  if (mode === AUTHORITY_MODES.HYBRID) entry.narrativeNote = `${interpreterOutput.scale} ${interpreterOutput.element} ${interpreterOutput.translatedType} translated into structured combat.`;
  return entry;
}
