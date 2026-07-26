// ---------- WORLD STATE ----------
// Phase 3.8, spec section 3. Every turn, the AI must be able to see its own
// HP/energy/mana/stamina, cooldowns, status effects, and the arena — not
// just narrate blind. This module assembles that view from engine-side
// resource state (resources.js) + the shared arena memory (arenaTracker.js,
// unchanged) into a compact object the prompt builder can drop straight
// into the user turn prompt.

export function buildWorldStateView({ round, selfState, enemyState, selfProfile, enemyProfile, arenaMemory }) {
  return {
    round,
    self: {
      hp: selfState.hp, maxHp: selfState.maxHp,
      energy: selfState.energy, maxEnergy: selfState.maxEnergy,
      mana: selfState.mana, maxMana: selfState.maxMana,
      stamina: selfState.stamina, maxStamina: selfState.maxStamina,
      shield: selfState.shield,
      cooldowns: selfState.cooldowns,
      statusEffects: selfState.statusEffects.map((s) => ({ type: s.type, roundsLeft: s.roundsLeft, stacks: s.stacks })),
      currentForm: selfState.transformations.currentForm,
      tier: selfProfile?.combatTier,
    },
    opponent: {
      hp: enemyState.hp, maxHp: enemyState.maxHp,
      energy: enemyState.energy, maxEnergy: enemyState.maxEnergy,
      mana: enemyState.mana, maxMana: enemyState.maxMana,
      stamina: enemyState.stamina, maxStamina: enemyState.maxStamina,
      shield: enemyState.shield,
      statusEffects: enemyState.statusEffects.map((s) => ({ type: s.type, roundsLeft: s.roundsLeft, stacks: s.stacks })),
      currentForm: enemyState.transformations.currentForm,
      tier: enemyProfile?.combatTier,
      knownPowers: enemyProfile?.knownPowers || [],
      observedWeaknesses: enemyProfile?.weaknesses || [],
    },
    arena: {
      weather: arenaMemory.weather,
      gravity: arenaMemory.gravity,
      timeFlow: arenaMemory.timeFlow,
      activeEvents: arenaMemory.events.map((e) => e.label),
    },
  };
}
