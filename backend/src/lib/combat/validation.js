// ---------- VALIDATION ENGINE ----------
// Phase 3.8, spec section 6. Runs BEFORE damage is ever calculated. Nothing
// downstream ever needs to guess whether an action is legal — this is the
// one place that decides, and it always explains why (spec section 12:
// "every verdict must explain WHY").
//
// Per spec section 14 ("the engine must never ignore character lore"), a
// rejected/downgraded action is never silently discarded — it's downgraded
// to a basic action and the reason is carried through to the verdict and
// narration so the player can see the engine's reasoning, exactly like
// spec section 12's damage-blocked example.

import { canAfford, isOnCooldown } from "./resources.js";
import { hasStatus, skipsTurn } from "./statusEffects.js";

export function validateAction({ ability, actorState, targetState, round, arena }) {
  const reasons = [];

  if (skipsTurn(actorState)) {
    return { valid: false, code: "STUNNED", reason: "Actor is stunned/frozen/time-stopped this round and cannot act.", downgrade: "skip" };
  }

  if (hasStatus(actorState, "silence") && ability.manaCost > 0) {
    return { valid: false, code: "SILENCED", reason: "Actor is silenced and cannot use mana-based abilities.", downgrade: "basic" };
  }

  const cost = { energy: ability.energyCost, mana: ability.manaCost, stamina: Math.round(ability.energyCost * 0.4) };
  const affordability = canAfford(actorState, cost);
  if (!affordability.affordable) {
    reasons.push(`Insufficient ${affordability.missing.join(" and ")} for "${ability.name}".`);
    return { valid: false, code: "INSUFFICIENT_RESOURCES", reason: reasons.join(" "), downgrade: "basic", cost };
  }

  if (isOnCooldown(actorState, ability.name, round)) {
    return {
      valid: false,
      code: "ON_COOLDOWN",
      reason: `"${ability.name}" is still on cooldown (ready round ${actorState.cooldowns[ability.name]}).`,
      downgrade: "basic",
      cost,
    };
  }

  if (ability.requiresTarget && targetState?.hp <= 0) {
    return { valid: false, code: "NO_VALID_TARGET", reason: "Target is already defeated.", downgrade: "skip", cost };
  }

  if (targetState?.shields?.some((s) => s.blocksElement === ability.element)) {
    return { valid: false, code: "BLOCKED_BY_SHIELD", reason: `Target's active shield blocks ${ability.element} damage entirely.`, downgrade: "none", cost, damageOverride: 0 };
  }

  return { valid: true, code: "OK", reason: "Action validated — sufficient resources, no blocking conditions.", cost };
}

// ---------- DEFENSE PACKET VALIDATION ----------
// Phase 3.9, spec section 5/6. "The engine never blindly trusts either AI" —
// a Defense Packet is only as good as what the defender can actually afford
// and is actually capable of. An invalid defense doesn't fail the turn; it
// downgrades to "none" (no special defense), same philosophy as
// validateAction: explain, downgrade, never hard-reject the turn.

const CAPABILITY_REQUIREMENT = {
  reality_defense: "realityManipulation",
  time_defense: "timeManipulation",
  teleport: "teleportation",
};

export function validateDefensePacket({ defensePacket, defenderProfile, defenderState, round }) {
  const chosen = defensePacket.chosenResponse;

  if (chosen === "none" || !chosen) {
    return { valid: true, code: "OK", reason: "No special defense chosen.", chosenResponse: "none" };
  }

  const requiredCapability = CAPABILITY_REQUIREMENT[chosen];
  if (requiredCapability && !defenderProfile?.[requiredCapability]) {
    return {
      valid: false, code: "CAPABILITY_MISSING", chosenResponse: "none",
      reason: `Defender's Combat Profile does not include ${requiredCapability} — "${chosen}" downgraded to no special defense.`,
    };
  }

  if (chosen === "counter" && isOnCooldown(defenderState, defensePacket.counterAbility || "Counter", round)) {
    return { valid: false, code: "ON_COOLDOWN", chosenResponse: "none", reason: `Counter ability is on cooldown — downgraded to no special defense.` };
  }

  const cost = defensePacket.resourceConsumption || { energy: 0, mana: 0, stamina: 0 };
  const affordability = canAfford(defenderState, cost);
  if (!affordability.affordable) {
    return {
      valid: false, code: "INSUFFICIENT_RESOURCES", chosenResponse: "none",
      reason: `Defender cannot afford the declared ${affordability.missing.join(" and ")} cost for "${chosen}" — downgraded to no special defense.`,
    };
  }

  if (skipsTurn(defenderState) && chosen !== "none") {
    return { valid: false, code: "STUNNED", chosenResponse: "none", reason: "Defender is stunned/frozen and cannot mount a special defense this round." };
  }

  return { valid: true, code: "OK", reason: `"${chosen}" validated — sufficient resources, capability present.`, chosenResponse: chosen, cost };
}
