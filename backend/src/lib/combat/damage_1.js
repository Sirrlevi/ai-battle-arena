
// ---------- DAMAGE MODULE - M1 REWRITE WITH PHYSICS PROFILE ----------
// Deterministic damage formula with weight class, density, physics profile

import { tierGate, tierPowerScore } from "./tiers.js";
import { generateBackendPhysicsProfile } from "./physicsProfile.js";

function elementalMultiplier(abilityElement, defenderResistances = [], defenderImmunities = [], defenderWeaknesses = []) {
  const el = (abilityElement||'').toLowerCase();
  if (!el) return 1;
  if (defenderImmunities.some(w=>w.toLowerCase().includes(el))) return 0;
  if (defenderResistances.some(w=>w.toLowerCase().includes(el))) return 0.6;
  if (defenderWeaknesses.some(w=>w.toLowerCase().includes(el))) return 1.5;
  return 1;
}

export function computeDamage({ ability, attackerProfile, defenderProfile, attackerState, defenderState, attackerTierIndex, defenderTierIndex }) {
  const attPhys = generateBackendPhysicsProfile(attackerProfile);
  const defPhys = generateBackendPhysicsProfile(defenderProfile);

  // Tier gate
  const gate = tierGate({ attackerTier: attackerProfile?.combatTierIndex ?? 1, defenderTier: defenderProfile?.combatTierIndex ?? 1, ability });
  
  // Base power from stats
  const strength = attackerProfile?.strength ?? 4;
  const combatSkill = attackerProfile?.combatSkill ?? 4;
  const basePower = (strength*1.4 + combatSkill*0.8) * tierPowerScore(attackerProfile?.combatTierIndex ?? 1);
  
  // Fatigue
  const energyRatio = (attackerState?.energy ?? 100) / 100;
  const staminaRatio = (attackerState?.stamina ?? 100) / 100;
  const fatigue = 0.6 + energyRatio*0.25 + staminaRatio*0.15;

  // Element
  const elemMult = elementalMultiplier(ability?.element, defenderProfile?.resistances, defenderProfile?.immunities, defenderProfile?.weaknesses);

  // Weight class: heavier attacker hits harder, but slower; energy/ethereal less mass but can bypass
  const weightBonus = attPhys.isEthereal ? 0.7 : attPhys.isEnergy ? 0.9 : Math.min(1.6, 0.8 + attPhys.mass/300);
  const massRatio = attPhys.mass / Math.max(10, defPhys.mass);
  const massFactor = Math.min(1.8, Math.max(0.5, 0.7 + massRatio*0.3));

  // Density impact: denser hits harder
  const densityFactor = 0.8 + (attPhys.density / Math.max(0.2, defPhys.density))*0.2;

  // Crit
  const isCrit = ability?.crit || false;
  const critMult = isCrit ? 1.6 : 1;

  // Defense
  const defense = (defenderProfile?.durability ?? 4) * 2 + (defenderState?.shield||0)*0.1;
  const defenseMult = Math.max(0.15, 1 - defense/50);

  let damage = basePower * 0.22 * fatigue * elemMult * weightBonus * massFactor * densityFactor * critMult * defenseMult * gate.multiplier;
  
  // Shield absorption
  let shieldAbsorbed = 0;
  if (defenderState?.shield > 0 && damage>0) {
    shieldAbsorbed = Math.min(defenderState.shield, damage);
    defenderState.shield -= shieldAbsorbed;
    damage -= shieldAbsorbed;
  }

  // Deterministic rounding
  damage = Math.max(0, Math.round(damage));

  return {
    damage,
    breakdown: {
      basePower, fatigue, elemMult, weightBonus, massFactor, densityFactor, critMult, defenseMult, gate: gate.multiplier, shieldAbsorbed,
      attackerMass: attPhys.mass,
      defenderMass: defPhys.mass,
      massRatio,
      weightClass: attPhys.weightClass,
    },
    attackerPhysics: attPhys,
    defenderPhysics: defPhys,
    tierGate: gate,
  };
}

export function resolveHit({ ability, attackerProfile, defenderProfile, attackerState, defenderState }) {
  const acc = ability?.accuracy ?? 75;
  const eva = defenderProfile?.speed ?? 4;
  const evasionScore = eva * 6 + (defenderProfile?.combatSkill||4)*2;
  const hitThreshold = acc - evasionScore*0.3;
  // deterministic: if accuracy > threshold, hit
  const hits = hitThreshold > 40 || ability?.alwaysHits;
  return { hits, accuracy: acc, evasion: evasionScore, threshold: hitThreshold };
}

// For backend backward compat
export function absorbWithShield(damage, shield) {
  const absorbed = Math.min(shield, damage);
  return { remaining: damage - absorbed, absorbed, shieldLeft: shield - absorbed };
}
