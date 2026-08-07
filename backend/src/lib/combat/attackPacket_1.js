// ---------- ATTACK PACKET ----------
// Phase 3.9, spec section 2. The attacker's Action Intent (already parsed by
// decisionEngine.js from the LLM's JSON response) gets converted into a
// structured packet BEFORE it's allowed to cause any damage. This packet is
// what the defending AI actually sees — never the attacker's raw prose —
// so the defender is reasoning over the same structured facts the engine
// will eventually validate against, not a fresh read of flavor text.

export function buildAttackPacket({ action, ability, interpreted, attackerProfile, round }) {
  return {
    round,
    actionName: action.action,
    abilityUsed: ability.name,
    target: action.target || "Enemy",
    powerCategory: attackerProfile?.combatTier || "Peak Human",
    element: ability.element,
    intent: action.reason || action.thought || "",
    expectedResult: action.expected_result || "",
    energyCost: ability.energyCost,
    manaCost: ability.manaCost,
    cooldown: ability.cooldown,
    range: ability.range,
    areaOfEffect: ability.areaOfEffect,
    movement: action.movement || "",
    followUpPlan: action.follow_up_plan || "",
    specialEffects: interpreted?.specialEffects || [],
    statusEffects: ability.statusEffects,
    realityEffects: interpreted?.eventType === "reality_rewrite" ? interpreted.rawClaim : null,
    timelineEffects: interpreted?.eventType === "time_stop" ? interpreted.rawClaim : null,
    riskLevel: action.risk || "medium",
    description: action.description || "",
  };
}
