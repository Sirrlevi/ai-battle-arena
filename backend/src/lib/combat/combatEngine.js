// ---------- COMBAT ENGINE (ORCHESTRATOR) ----------
// Phase 3.8. This is the module that turns "AI wrote some flavor text" into
// an actual simulated outcome. It's the replacement for the old behavior
// where the (client-side) engine just rolled dice and converted everything
// into a flat "18 damage". Called once per turn, after the AI's Action
// Intent has been parsed and interpreted, for every authority mode — even
// AI/Hybrid authority get a computed verdict now (spec section 2: "Engine
// must compare tiers before calculating outcomes", not just Engine-authority
// mode), though AI/Hybrid still apply their own narrative-trust rules on
// top in realityAuthorityLayer.js.
//
// This module is pure/synchronous — no LLM calls, no randomness. Same
// inputs always produce the same verdict.

import { getOrCreateAbility, recordAbilityUse } from "./abilityRegistry.js";
import { validateAction } from "./validation.js";
import { computeDamage, resolveHit } from "./damage.js";
import { applyStatus, tickStatuses } from "./statusEffects.js";
import { spend, setCooldown, applyShield } from "./resources.js";

/**
 * Minimal, deterministic physics read-out (spec section 11). This project's
 * actual movement/collision simulation lives client-side (movementController,
 * collisionSystem, projectileManager) — this function doesn't replace that,
 * it gives the engine verdict a physically-consistent knockback/impact
 * figure derived from the same damage math, so the client's physics layer
 * has something grounded to animate instead of a guess.
 */
function computePhysics({ damage, ability, attackerTierIndex }) {
  if (damage <= 0) return { knockback: 0, impactRadius: ability.areaOfEffect ? 3 : 1 };
  const knockback = Math.round(Math.min(60, damage * 0.9 + attackerTierIndex * 2));
  const impactRadius = ability.areaOfEffect ? Math.max(3, Math.round(damage / 12)) : 1;
  return { knockback, impactRadius, terrainDamage: ability.areaOfEffect && damage > 25 };
}


function computeDefenseAdjustment({ defensePacket, enemyState, enemyProfile, ability }) {
  if (!defensePacket) return { damageMultiplier: 1, cost: {}, note: "No Defense Packet was provided." };
  const cost = defensePacket.resourceConsumption || {};
  const affordable = (!cost.energy || enemyState.energy >= cost.energy) && (!cost.mana || enemyState.mana >= cost.mana) && (!cost.stamina || enemyState.stamina >= cost.stamina);
  if (!affordable) return { damageMultiplier: 1, cost: {}, note: "Defense Packet was resource-illegal, so no mitigation was applied." };
  spend(enemyState, { energy: cost.energy || 0, mana: cost.mana || 0, stamina: cost.stamina || 0, realityStability: cost.realityStability || 0, mentalStability: cost.mentalStability || 0 });
  const text = `${defensePacket.chosenResponse || ""} ${defensePacket.shield || ""} ${defensePacket.dodge || ""} ${defensePacket.teleport || ""} ${defensePacket.block || ""} ${defensePacket.realityDefense || ""} ${defensePacket.timeDefense || ""}`.toLowerCase();
  let multiplier = 1;
  if (text.includes("teleport") || text.includes("dodge") || text.includes("evade")) multiplier *= 0.55;
  if (text.includes("shield") || text.includes("barrier")) multiplier *= 0.65;
  if (text.includes("block") || text.includes("guard") || text.includes("parry")) multiplier *= 0.75;
  if ((ability.element && text.includes(ability.element)) || text.includes("counter")) multiplier *= 0.85;
  const resilience = Math.min(0.15, ((enemyProfile?.durability || 0) + (enemyProfile?.speed || 0)) / 160);
  multiplier = Math.max(0.2, multiplier - resilience);
  return { damageMultiplier: multiplier, cost, note: `Defense Packet mitigated outcome to ${Math.round(multiplier * 100)}% damage.` };
}

/**
 * The Engine Verdict. Runs the full pipeline: ability lookup/derivation ->
 * validation -> (if valid) hit resolution -> damage -> status application ->
 * resource spend -> cooldown -> physics read-out. Always returns a verdict
 * object, never throws — an invalid/blocked action still resolves to a
 * verdict with damage 0 and a populated `reason`, per spec section 12
 * ("Instead of only: 0 damage" -> always explain why).
 */
export function simulateTurn({
  session, fighterKey, opponentKey, action, interpreted,
  selfProfile, enemyProfile, selfState, enemyState, round, arenaMemory,
  attackPacket = null, defensePacket = null, authorityMode = "engine",
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
  const defenseAdjustment = computeDefenseAdjustment({ defensePacket, enemyState, enemyProfile, ability });

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

  // ---- Healing / self-target abilities never roll to-hit ----
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

  // ---- Hit resolution (deterministic, see damage.js) ----
  const hitResult = resolveHit({ ability, attackerState: selfState, defenderState: enemyState, defenderProfile: enemyProfile });
  if (!hitResult.hits) {
    return {
      valid: true, code: "MISS", reason: `"${ability.name}" did not connect — accuracy/evasion margin ${hitResult.margin}.`,
      ability, damage: 0, healing: 0, statusApplied: [],
      resourceChanges: { cost: validation.cost },
      physics: { knockback: 0, impactRadius: 0 }, tierGate: null,
    };
  }

  const { damage: rawDamage, breakdown } = computeDamage({
    ability, attackerProfile: selfProfile, defenderProfile: enemyProfile,
    attackerState: selfState, defenderState: enemyState, round, arena: arenaMemory,
  });

  const damage = Math.max(0, Math.round(rawDamage * defenseAdjustment.damageMultiplier));
  enemyState.hp = Math.max(0, enemyState.hp - damage);

  const statusApplied = [];
  for (const statusType of ability.statusEffects) {
    const applied = applyStatus(enemyState, statusType, { round, sourceAbility: ability.name });
    if (applied) statusApplied.push({ type: statusType, roundsLeft: applied.roundsLeft, stacks: applied.stacks });
  }

  const physics = computePhysics({ damage, ability, attackerTierIndex: selfProfile?.combatTierIndex ?? 1 });

  return {
    valid: true,
    code: breakdown.tierGate.blocked ? "TIER_BLOCKED" : "OK",
    reason: breakdown.tierGate.blocked
      ? breakdown.tierGate.note
      : `"${ability.name}" connects for ${damage} damage (${breakdown.critical ? "critical, " : ""}${ability.element}). ${defenseAdjustment.note}`,
    ability, damage, healing: 0, statusApplied,
    resourceChanges: { cost: validation.cost, defenseCost: defenseAdjustment.cost },
    physics, tierGate: breakdown.tierGate, breakdown: { ...breakdown, rawDamage, defenseAdjustment },
    negotiation: { attackPacket, defensePacket, arbitration: { authorityMode, validationsPassed: ["packet_schema", "resources", "cooldowns", "physics"], validationsFailed: [] } },
    worldSync: { stage: "world_state_synchronization", attacker: { hp: selfState.hp, energy: selfState.energy, mana: selfState.mana, stamina: selfState.stamina, form: selfState.transformations.currentForm }, defender: { hp: enemyState.hp, energy: enemyState.energy, mana: enemyState.mana, stamina: enemyState.stamina, form: enemyState.transformations.currentForm } },
    lethal: enemyState.hp <= 0,
  };
}

/** Call once per fighter at the start of the round, before actions resolve. */
export function tickRoundStart(selfState) {
  return tickStatuses(selfState);
}
