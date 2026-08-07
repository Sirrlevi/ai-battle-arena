// ---------- STATUS EFFECT SYSTEM ----------
// Phase 3.8. Fixed catalog so every effect the engine can apply has known,
// deterministic behavior (duration, stacking rule, per-tick impact) instead
// of being free-form text. The Reality Interpreter's keyword matching (see
// authority/realityInterpreter.js) still decides *which* effect an ability
// implies from its description; this module owns what that effect *does*
// once applied.

export const STATUS_CATALOG = {
  burn: { stacking: "additive", defaultRounds: 3, tickDamagePct: 0.03 },
  freeze: { stacking: "refresh", defaultRounds: 1, mobilityMultiplier: 0 },
  shock: { stacking: "refresh", defaultRounds: 1, accuracyMultiplier: 0.6 },
  poison: { stacking: "additive", defaultRounds: 4, tickDamagePct: 0.025 },
  bleed: { stacking: "additive", defaultRounds: 3, tickDamagePct: 0.035 },
  fear: { stacking: "refresh", defaultRounds: 2, damageDealtMultiplier: 0.7 },
  blind: { stacking: "refresh", defaultRounds: 2, accuracyMultiplier: 0.4 },
  silence: { stacking: "refresh", defaultRounds: 2, blocksManaAbilities: true },
  confusion: { stacking: "refresh", defaultRounds: 2, accuracyMultiplier: 0.5 },
  slow: { stacking: "refresh", defaultRounds: 2, mobilityMultiplier: 0.5 },
  root: { stacking: "refresh", defaultRounds: 2, mobilityMultiplier: 0 },
  gravity_lock: { stacking: "refresh", defaultRounds: 2, mobilityMultiplier: 0, flightDisabled: true },
  time_stop: { stacking: "refresh", defaultRounds: 1, skipsTurn: true },
  reality_fracture: { stacking: "additive", defaultRounds: 3, damageTakenMultiplier: 1.25 },
  mana_drain: { stacking: "additive", defaultRounds: 3, manaDrainPct: 0.1 },
  energy_drain: { stacking: "additive", defaultRounds: 3, energyDrainPct: 0.1 },
  armor_break: { stacking: "refresh", defaultRounds: 3, armorMultiplier: 0.5 },
  shield_break: { stacking: "instant", defaultRounds: 0, removesShield: true },
  stun: { stacking: "refresh", defaultRounds: 1, skipsTurn: true },
  healing_reduction: { stacking: "refresh", defaultRounds: 3, healingReceivedMultiplier: 0.4 },
};

export function applyStatus(state, type, { rounds, sourceAbility, round } = {}) {
  const def = STATUS_CATALOG[type];
  if (!def) return null;

  if (type === "shield_break") {
    state.shield = 0;
    return null;
  }

  const duration = rounds || def.defaultRounds;
  const existing = state.statusEffects.find((s) => s.type === type);

  if (def.stacking === "additive") {
    if (existing) {
      existing.stacks = Math.min(5, (existing.stacks || 1) + 1);
      existing.roundsLeft = Math.max(existing.roundsLeft, duration);
    } else {
      state.statusEffects.push({ type, stacks: 1, roundsLeft: duration, appliedRound: round, source: sourceAbility || null });
    }
  } else {
    // refresh / instant: replace duration, single stack
    if (existing) {
      existing.roundsLeft = duration;
    } else {
      state.statusEffects.push({ type, stacks: 1, roundsLeft: duration, appliedRound: round, source: sourceAbility || null });
    }
  }
  return state.statusEffects.find((s) => s.type === type);
}

export function hasStatus(state, type) {
  return state.statusEffects.some((s) => s.type === type);
}

export function statusMultiplier(state, field) {
  let multiplier = 1;
  for (const s of state.statusEffects) {
    const def = STATUS_CATALOG[s.type];
    if (def && typeof def[field] === "number") multiplier *= def[field];
  }
  return multiplier;
}

export function skipsTurn(state) {
  return state.statusEffects.some((s) => STATUS_CATALOG[s.type]?.skipsTurn);
}

/**
 * Ticks damage-over-time effects against a fighter's own resource state and
 * decrements durations, expiring anything at 0. Called once per fighter per
 * round from the Combat Engine. Returns the total DoT damage applied (for
 * the verdict/debug panel — never random).
 */
export function tickStatuses(state) {
  let dotDamage = 0;
  for (const s of state.statusEffects) {
    const def = STATUS_CATALOG[s.type];
    if (!def) continue;
    if (def.tickDamagePct) {
      const amount = Math.max(1, Math.round(state.maxHp * def.tickDamagePct * (s.stacks || 1)));
      state.hp = Math.max(0, state.hp - amount);
      dotDamage += amount;
    }
    if (def.manaDrainPct && state.maxMana > 0) {
      state.mana = Math.max(0, state.mana - Math.round(state.maxMana * def.manaDrainPct));
    }
    if (def.energyDrainPct) {
      state.energy = Math.max(0, state.energy - Math.round(state.maxEnergy * def.energyDrainPct));
    }
    s.roundsLeft -= 1;
  }
  state.statusEffects = state.statusEffects.filter((s) => s.roundsLeft > 0);
  return dotDamage;
}
