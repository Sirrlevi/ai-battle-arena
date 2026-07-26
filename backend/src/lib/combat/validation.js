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
