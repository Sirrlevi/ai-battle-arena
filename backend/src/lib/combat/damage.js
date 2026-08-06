// ---------- ADVANCED DAMAGE SYSTEM ----------
// Phase 3.8, spec section 7. No Math.random() anywhere in this file — spec
// section 7 is explicit that "Damage must NOT be random." Every number here
// is a pure function of the two Combat Profiles, current resource state,
// the ability, and arena conditions, so the same inputs always produce the
// same output (spec section 16/12: "deterministic, explainable").
//
// "Accuracy" is still a real concept (spec section 4's Ability System has
// an accuracy field) but it's resolved as a deterministic threshold check
// against the defender's evasion score, not a dice roll — see resolveHit().

import { tierGate, tierPowerScore } from "./tiers.js";
import { statusMultiplier } from "./statusEffects.js";
import { absorbWithShield } from "./resources.js";

function evasionScore(profile, defenderState) {
  const base = 20 + (profile?.mobility ?? 4) * 4 + (profile?.speed ?? 4) * 2;
  const slow = statusMultiplier(defenderState, "mobilityMultiplier");
  return Math.round(base * (slow === 0 ? 0.1 : slow));
}

/**
 * Deterministic hit resolution: ability.accuracy vs the defender's evasion,
 * both 0-100ish scales, compared directly rather than rolled against.
 * Guarding/blind/confusion statuses shift the effective accuracy instead of
 * introducing randomness.
 */
export function resolveHit({ ability, attackerState, defenderState, defenderProfile }) {
  if (!ability.canMiss) return { hits: true, margin: null };
  let effectiveAccuracy = ability.accuracy * statusMultiplier(attackerState, "accuracyMultiplier");
  const evasion = evasionScore(defenderProfile, defenderState);
  const margin = effectiveAccuracy - evasion;
  return { hits: margin >= -10, margin }; // small tolerance band, not randomness — a near-miss still lands weakly
}

function elementalResistanceMultiplier(defenderProfile, element) {
  if (!defenderProfile) return 1;
  const lower = (s) => (s || "").toLowerCase();
  if ((defenderProfile.immunities || []).some((i) => lower(i).includes(element))) return 0;
  if ((defenderProfile.resistances || []).some((r) => lower(r).includes(element))) return 0.4;
  if ((defenderProfile.weaknesses || []).some((w) => lower(w).includes(element))) return 1.6;
  return 1;
}

/**
 * The single deterministic damage formula. Returns a full breakdown (not
 * just a number) so the Engine Verdict can explain exactly how the total
 * was reached — spec section 12.
 */
export function computeDamage({ ability, attackerProfile, defenderProfile, attackerState, defenderState, round, arena }) {
  const attackerTier = attackerProfile?.combatTierIndex ?? 1;
  const defenderTier = defenderProfile?.combatTierIndex ?? 1;

  const explicitBypass =
    (attackerProfile?.ultimateAbility && ability.name && attackerProfile.ultimateAbility.toLowerCase().includes(ability.name.toLowerCase())) ||
    (defenderProfile?.weaknesses || []).some((w) => (w || "").toLowerCase().includes((ability.element || "").toLowerCase()) && ability.element !== "physical");

  const gate = tierGate({ attackerTier, defenderTier, bypass: explicitBypass });

  const powerScore = tierPowerScore(attackerTier);
  const statPower = (attackerProfile?.strength ?? 4) + (attackerProfile?.combatSkill ?? 4);
  const energyRatio = attackerState.maxEnergy > 0 ? attackerState.energy / attackerState.maxEnergy : 1;
  const staminaRatio = attackerState.maxStamina > 0 ? attackerState.stamina / attackerState.maxStamina : 1;
  const fatigue = 0.55 + 0.45 * ((energyRatio + staminaRatio) / 2); // never below 55% output just for being tired

  const defenseScore = (defenderProfile?.durability ?? 4) * 2 + (defenderState.armor || 0);
  const resistMultiplier = elementalResistanceMultiplier(defenderProfile, ability.element);

  const critical = ability.canCrit && attackerState.energy === attackerState.maxEnergy; // deterministic "peak condition" crit, not a roll
  const critMultiplier = critical ? 1.25 : 1;

  const debuffMultiplier = statusMultiplier(attackerState, "damageDealtMultiplier");
  const vulnerabilityMultiplier = statusMultiplier(defenderState, "damageTakenMultiplier");

  let raw = (statPower * 1.8 + powerScore * 3) * fatigue;
  raw = raw * gate.multiplier * resistMultiplier * critMultiplier * debuffMultiplier * vulnerabilityMultiplier;
  raw = raw - defenseScore * 0.6;
  raw = Math.max(gate.blocked ? 0 : 1, Math.round(raw));

  const preShield = raw;
  const finalDamage = Math.max(0, absorbWithShield(defenderState, raw));

  return {
    damage: finalDamage,
    breakdown: {
      attackerTier: attackerProfile?.combatTier, defenderTier: defenderProfile?.combatTier,
      tierGate: gate,
      statPower, powerScore: Math.round(powerScore * 100) / 100, fatigue: Math.round(fatigue * 100) / 100,
      defenseScore, resistMultiplier, critical, critMultiplier,
      debuffMultiplier, vulnerabilityMultiplier,
      preShieldDamage: preShield,
      shieldAbsorbed: preShield - finalDamage,
    },
  };
}
