// ---------- RESOURCE SYSTEM ----------
// Phase 3.8. Independent resource pools per fighter, derived from that
// fighter's Combat Profile so a low-stamina office worker and a
// near-infinite cosmic entity don't share the same pool sizes. This is
// engine-side state (session.resources[fighterKey]) — separate from the
// frontend's hp/energy display state, which stays the UI's job. The engine
// uses this to decide whether an action is even possible before it ever
// reaches damage calculation.

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function createResourceState(profile) {
  const enduranceScale = 40 + (profile.stamina || 5) * 6; // Stamina stat is 0-10-ish from extraction
  const energyScale = 40 + (profile.energyCapacity || 5) * 8;
  const manaScale = (profile.manaCapacity || 0) * 8;

  return {
    hp: 100,
    maxHp: 100,
    energy: 100,
    maxEnergy: Math.round(energyScale),
    mana: manaScale > 0 ? Math.round(manaScale) : 0,
    maxMana: Math.round(manaScale),
    stamina: Math.round(enduranceScale),
    maxStamina: Math.round(enduranceScale),
    shield: 0,
    maxShield: 0,
    armor: profile.durability || 0,
    cooldowns: {}, // ability_name -> round it becomes ready again
    buffs: [],
    debuffs: [],
    statusEffects: [], // see statusEffects.js — {type, stacks, roundsLeft, appliedRound, source}
    transformations: { currentForm: "base", history: [] },
    shields: [], // active named shields, e.g. from a "Barrier" ability
    summons: [],
  };
}

export function getOrCreateResourceState(session, fighterKey, profile) {
  if (!session.resources) session.resources = {};
  if (!session.resources[fighterKey]) {
    session.resources[fighterKey] = createResourceState(profile || {});
  }
  return session.resources[fighterKey];
}

/** Syncs hp/energy the frontend already tracks authoritatively into engine-side state each turn. */
export function syncExternalVitals(state, { hp, energy }) {
  if (Number.isFinite(hp)) state.hp = clamp(hp, 0, state.maxHp);
  if (Number.isFinite(energy)) state.energy = clamp(energy, 0, state.maxEnergy);
}

export function canAfford(state, cost = {}) {
  const missing = [];
  if (cost.energy && state.energy < cost.energy) missing.push("energy");
  if (cost.mana && state.mana < cost.mana) missing.push("mana");
  if (cost.stamina && state.stamina < cost.stamina) missing.push("stamina");
  return { affordable: missing.length === 0, missing };
}

export function spend(state, cost = {}) {
  if (cost.energy) state.energy = clamp(state.energy - cost.energy, 0, state.maxEnergy);
  if (cost.mana) state.mana = clamp(state.mana - cost.mana, 0, state.maxMana);
  if (cost.stamina) state.stamina = clamp(state.stamina - cost.stamina, 0, state.maxStamina);
}

export function regenTick(state) {
  state.energy = clamp(state.energy + Math.round(state.maxEnergy * 0.08), 0, state.maxEnergy);
  state.stamina = clamp(state.stamina + Math.round(state.maxStamina * 0.1), 0, state.maxStamina);
  if (state.maxMana > 0) state.mana = clamp(state.mana + Math.round(state.maxMana * 0.06), 0, state.maxMana);
}

export function applyShield(state, amount, label) {
  state.shield = clamp(state.shield + amount, 0, Math.max(state.maxShield, amount));
  state.maxShield = Math.max(state.maxShield, state.shield);
  state.shields.push({ label: label || "Barrier", amount, appliedAt: Date.now() });
}

/** Shields absorb before HP. Returns the remainder that should hit HP/armor. */
export function absorbWithShield(state, incoming) {
  if (state.shield <= 0) return incoming;
  const absorbed = Math.min(state.shield, incoming);
  state.shield -= absorbed;
  return incoming - absorbed;
}

export function isOnCooldown(state, abilityName, round) {
  const ready = state.cooldowns[abilityName];
  return typeof ready === "number" && ready > round;
}

export function setCooldown(state, abilityName, round, cooldownRounds) {
  if (!cooldownRounds) return;
  state.cooldowns[abilityName] = round + cooldownRounds;
}
