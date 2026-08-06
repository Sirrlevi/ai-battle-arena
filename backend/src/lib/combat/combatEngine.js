// ---------- COMBAT ENGINE (ORCHESTRATOR) ----------
// Phase 3.8 + Phase 3.9. This is the module that turns "two AIs wrote some
// flavor text" into an actual simulated, negotiated outcome. Phase 3.8 gave
// it Combat Profiles, tiers, resources, and deterministic damage. Phase 3.9
// adds the other half: the DEFENDER's own structured Defense Packet (spec
// section 3) — dodge/block/counter/shield/teleport/reality-or-time defense/
// passive/transformation — gets folded into the same verdict instead of the
// defender being a passive number the attacker's roll happens to.
//
// `defenseResolution` (built by decisionEngine.js via
// validation.validateDefensePacket) is optional — when it's absent this
// function's behavior is byte-for-byte the Phase 3.8 pipeline, so Engine
// Authority battles that predate the negotiation protocol (or a turn where
// the defender's provider call failed and produced only the inert fallback)
// still resolve exactly as before.
//
// This module is pure/synchronous — no LLM calls, no randomness. Same
// inputs always produce the same verdict.

import { getOrCreateAbility, recordAbilityUse } from "./abilityRegistry.js";
import { validateAction } from "./validation.js";
import { computeDamage, resolveHit } from "./damage.js";
import { applyStatus, tickStatuses } from "./statusEffects.js";
import { spend, setCooldown, applyShield } from "./resources.js";
import { tierGate, tierPowerScore } from "./tiers.js";
import { generateBackendPhysicsProfile, computeImpactPhysics } from "./physicsProfile.js";
import { applyFormToProfile, resolveFormKey } from "./forms.js";

/**
 * Minimal, deterministic physics read-out (spec section 11). This project's
 * actual movement/collision simulation lives client-side (movementController,
 * collisionSystem, projectileManager) — this function doesn't replace that,
 * it gives the engine verdict a physically-consistent knockback/impact
 * figure derived from the same damage math, so the client's physics layer
 * has something grounded to animate instead of a guess.
 */
function computePhysics({ damage, ability, attackerTierIndex, attackerProfile, defenderProfile }) {
  if (damage <= 0) return { knockback: 0, impactRadius: ability.areaOfEffect ? 3 : 1 };
  try {
    // M1 dynamic physics
    const massA = attackerProfile ? (attackerProfile.strength||4)*18 + 20 : 75;
    const massD = defenderProfile ? (defenderProfile.durability||4)*15 + 20 : 75;
    const massRatio = massA / Math.max(10, massD);
    const base = Math.round(Math.min(70, damage * 0.9 + attackerTierIndex * 2.2));
    const knockback = Math.round(base * Math.max(0.4, Math.min(1.8, massRatio)));
    const impactRadius = ability.areaOfEffect ? Math.max(3, Math.round(damage / 12)) : 1;
    return { knockback, impactRadius, terrainDamage: ability.areaOfEffect && damage > 25, massRatio, attackerMass: massA, defenderMass: massD };
  } catch(e) {
    const knockback = Math.round(Math.min(60, damage * 0.9 + attackerTierIndex * 2));
    const impactRadius = ability.areaOfEffect ? Math.max(3, Math.round(damage / 12)) : 1;
    return { knockback, impactRadius, terrainDamage: ability.areaOfEffect && damage > 25 };
  }
}

const NO_DEFENSE = { chosenResponse: "none", damageMultiplier: 1, hitOverride: null, note: "No special defense chosen." };

/**
 * Phase 3.9, spec sections 3/5/8. Turns a *validated* Defense Packet into a
 * concrete mechanical adjustment applied around the normal hit/damage
 * pipeline. Every branch is deterministic — no dice — and always returns a
 * `note` explaining what happened, per spec section 14 ("every verdict must
 * explain why").
 */
function resolveDefenseEffect({ defenseResolution, defensePacket, attackerProfile, defenderProfile, defenderState, round }) {
  if (!defenseResolution || defenseResolution.chosenResponse === "none") return NO_DEFENSE;

  const chosen = defenseResolution.chosenResponse;
  if (defenseResolution.cost) spend(defenderState, defenseResolution.cost);

  switch (chosen) {
    case "dodge":
    case "teleport":
      return { chosenResponse: chosen, damageMultiplier: 0, hitOverride: "miss", note: `Defender ${chosen === "teleport" ? "teleports clear of" : "dodges"} the attack entirely.` };

    case "block":
      return { chosenResponse: chosen, damageMultiplier: 0.4, hitOverride: null, note: "Defender blocks — damage significantly reduced." };

    case "passive":
      return { chosenResponse: chosen, damageMultiplier: 0.75, hitOverride: null, note: "Defender's passive ability softens the blow." };

    case "reality_defense":
    case "time_defense":
      return { chosenResponse: chosen, damageMultiplier: 0.15, hitOverride: null, note: `Defender bends ${chosen === "time_defense" ? "time" : "reality"} itself to blunt the attack — only a fraction gets through.` };

    case "shield": {
      const shieldAmount = Math.max(10, Math.round(((defenderProfile?.durability ?? 4) + (defenderProfile?.energyCapacity ?? 4)) * 3));
      applyShield(defenderState, shieldAmount, defensePacket?.counterAbility || "Emergency Barrier");
      // No damageMultiplier — the shield absorbs via the normal
      // absorbWithShield() step inside computeDamage(), so a shield that's
      // too small to fully cover the hit still lets the remainder through.
      return { chosenResponse: chosen, damageMultiplier: 1, hitOverride: null, note: `Defender raises a ${shieldAmount}-point shield.` };
    }

    case "transformation": {
      const formKey = resolveFormKey(defensePacket?.counterAbility || defensePacket?.reason);
      defenderState.transformations.currentForm = formKey;
      defenderState.transformations.history.push({ round, form: formKey, trigger: "defensive transformation" });
      return { chosenResponse: chosen, damageMultiplier: 0.85, hitOverride: null, formOverride: formKey, note: `Defender transforms into "${formKey}" mid-defense, gaining resilience for this hit.` };
    }

    case "counter": {
      const defScore = (defenderProfile?.combatSkill ?? 4) + (defenderProfile?.speed ?? 4);
      const atkScore = (attackerProfile?.combatSkill ?? 4) + (attackerProfile?.speed ?? 4);
      const succeeds = defScore - atkScore >= -2; // small deterministic tolerance, not randomness
      if (!succeeds) {
        return { chosenResponse: chosen, damageMultiplier: 1, hitOverride: null, note: "Counter attempt fails — defender isn't fast/skilled enough to intercept; full damage applies." };
      }
      const gate = tierGate({ attackerTier: defenderProfile?.combatTierIndex ?? 1, defenderTier: attackerProfile?.combatTierIndex ?? 1 });
      const counterDamage = Math.max(1, Math.round(((defenderProfile?.strength ?? 4) + defScore) * 1.8 * tierPowerScore(defenderProfile?.combatTierIndex ?? 1) / Math.max(0.5, tierPowerScore(attackerProfile?.combatTierIndex ?? 1)) * gate.multiplier));
      return {
        chosenResponse: chosen, damageMultiplier: 0.3, hitOverride: null, counterDamage,
        note: `Counter succeeds — defender takes reduced damage and reflects ${counterDamage} damage back at the attacker.`,
      };
    }

    default:
      return NO_DEFENSE;
  }
}

/**
 * The Engine Verdict. Runs the full pipeline: ability lookup/derivation ->
 * validation -> (if valid) hit resolution -> defense-packet adjustment ->
 * damage -> status application -> resource spend -> cooldown -> physics
 * read-out. Always returns a verdict object, never throws — an invalid/
 * blocked action still resolves to a verdict with damage 0 and a populated
 * `reason`, per spec section 12/14 ("Instead of only: 0 damage" -> always
 * explain why; "nothing should happen without explanation").
 *
 * `defenseResolution`/`defensePacket` are optional (Phase 3.9) — omitting
 * them reproduces the exact Phase 3.8 behavior.
 */
export function simulateTurn({
  session, fighterKey, opponentKey, action, interpreted,
  selfProfile, enemyProfile, selfState, enemyState, round, arenaMemory,
  defenseResolution = null, defensePacket = null,
}) {
  const abilityName = action.ability_name || "Basic Strike";
  const ability = getOrCreateAbility(session, fighterKey, abilityName, {
    interpreted, profile: selfProfile, actionType: action.action,
  });

  if (action.action === "Defend") {
    return {
      valid: true, code: "DEFEND", reason: "Actor raises their guard.",
      ability, damage: 0, healing: 0, statusApplied: [], resourceChanges: { cost: { energy: 0, mana: 0, stamina: 0 } },
      physics: { knockback: 0, impactRadius: 0 }, tierGate: null,
    };
  }

  const validation = validateAction({ ability, actorState: selfState, targetState: enemyState, round, arena: arenaMemory });

  if (!validation.valid) {
    // Downgrade instead of reject — spec section 6 rejects the *impossible*
    // action, not the turn. A basic strike still costs a small, flat amount
    // so "downgrade" can't be used to bypass resource constraints for free.
    const basicCost = { energy: 5, mana: 0, stamina: 3 };
    if (validation.downgrade === "basic") spend(selfState, basicCost);
    return {
      valid: false, code: validation.code, reason: validation.reason,
      ability, damage: validation.damageOverride ?? 0, healing: 0, statusApplied: [],
      resourceChanges: { cost: validation.downgrade === "basic" ? basicCost : { energy: 0, mana: 0, stamina: 0 } },
      physics: { knockback: 0, impactRadius: 0 }, tierGate: null, downgrade: validation.downgrade,
    };
  }

  spend(selfState, validation.cost);
  setCooldown(selfState, ability.name, round, ability.cooldown);
  recordAbilityUse(session, fighterKey, ability.name);

  // ---- Healing / self-target abilities never roll to-hit, and a Defense
  // Packet is irrelevant to them (nothing to defend against). ----
  if (!ability.requiresTarget) {
    let healing = 0;
    if (interpreted?.eventType === "healing") {
      const healPower = (selfProfile?.healingAbility ?? 0) * 6 + (selfProfile?.regeneration ?? 0) * 2;
      healing = Math.max(1, Math.round(healPower));
      selfState.hp = Math.min(selfState.maxHp, selfState.hp + healing);
    }
    if (interpreted?.eventType === "shield") {
      const shieldAmount = Math.max(10, Math.round(((selfProfile?.durability ?? 4) + (selfProfile?.energyCapacity ?? 4)) * 3));
      applyShield(selfState, shieldAmount, ability.name);
    }
    if (interpreted?.eventType === "transformation") {
      selfState.transformations.currentForm = interpreted.transformTo || ability.name;
      selfState.transformations.history.push({ round, form: selfState.transformations.currentForm });
    }
    return {
      valid: true, code: "OK", reason: `"${ability.name}" resolved as a self-directed action.`,
      ability, damage: 0, healing, statusApplied: [],
      resourceChanges: { cost: validation.cost },
      physics: { knockback: 0, impactRadius: 0 }, tierGate: null,
    };
  }

  // ---- Defense Packet adjustment (Phase 3.9) — computed before hit
  // resolution so a dodge/teleport can short-circuit it entirely. ----
  const defenseEffect = resolveDefenseEffect({ defenseResolution, defensePacket, attackerProfile: selfProfile, defenderProfile: enemyProfile, defenderState: enemyState, round });

  if (defenseEffect.hitOverride === "miss") {
    return {
      valid: true, code: "DEFENDED", reason: `"${ability.name}" was neutralized by the defender's response: ${defenseEffect.note}`,
      ability, damage: 0, healing: 0, statusApplied: [],
      resourceChanges: { cost: validation.cost },
      physics: { knockback: 0, impactRadius: 0 }, tierGate: null,
      defense: defenseEffect,
    };
  }

  // Transformation defense swaps in a temporarily boosted profile for THIS
  // hit's damage math (durability/tier from the new form); it does not
  // mutate enemyProfile itself, since a profile is meant to stay the fixed
  // ground truth and forms.js already re-derives from it every time.
  const effectiveDefenderProfile = defenseEffect.formOverride ? applyFormToProfile(enemyProfile, defenseEffect.formOverride) : enemyProfile;

  // ---- Hit resolution (deterministic, see damage.js) ----
  const hitResult = resolveHit({ ability, attackerState: selfState, defenderState: enemyState, defenderProfile: effectiveDefenderProfile });
  if (!hitResult.hits) {
    return {
      valid: true, code: "MISS", reason: `"${ability.name}" did not connect — accuracy/evasion margin ${hitResult.margin}.`,
      ability, damage: 0, healing: 0, statusApplied: [],
      resourceChanges: { cost: validation.cost },
      physics: { knockback: 0, impactRadius: 0 }, tierGate: null,
      defense: defenseEffect.chosenResponse !== "none" ? defenseEffect : undefined,
    };
  }

  const { damage: rawDamage, breakdown } = computeDamage({
    ability, attackerProfile: selfProfile, defenderProfile: effectiveDefenderProfile,
    attackerState: selfState, defenderState: enemyState, round, arena: arenaMemory,
  });

  const damage = Math.round(rawDamage * (defenseEffect.damageMultiplier ?? 1));
  enemyState.hp = Math.max(0, enemyState.hp - damage);

  // A successful counter reflects damage onto the attacker's own resource
  // state — the attacker's `simulateTurn` call already returned by this
  // point in a normal flow, so decisionEngine.js applies this to the
  // attacker's resource state directly using the field below.
  const counterDamage = defenseEffect.counterDamage || 0;

  const statusApplied = [];
  for (const statusType of ability.statusEffects) {
    const applied = applyStatus(enemyState, statusType, { round, sourceAbility: ability.name });
    if (applied) statusApplied.push({ type: statusType, roundsLeft: applied.roundsLeft, stacks: applied.stacks });
  }

  const physics = computePhysics({ damage, ability, attackerTierIndex: selfProfile?.combatTierIndex ?? 1, attackerProfile: selfProfile, defenderProfile: enemyProfile });

  const defenseNote = defenseEffect.chosenResponse !== "none" ? ` Defender's response: ${defenseEffect.note}` : "";

  return {
    valid: true,
    code: breakdown.tierGate.blocked ? "TIER_BLOCKED" : "OK",
    reason: (breakdown.tierGate.blocked
      ? breakdown.tierGate.note
      : `"${ability.name}" connects for ${damage} damage (${breakdown.critical ? "critical, " : ""}${ability.element}).`) + defenseNote,
    ability, damage, healing: 0, statusApplied,
    resourceChanges: { cost: validation.cost },
    physics, tierGate: breakdown.tierGate, breakdown,
    lethal: enemyState.hp <= 0,
    defense: defenseEffect.chosenResponse !== "none" ? defenseEffect : undefined,
    counterDamage,
  };
}

/** Call once per fighter at the start of the round, before actions resolve. */
export function tickRoundStart(selfState) {
  return tickStatuses(selfState);
}
