// ---------- WORLD STATE ----------
// Phase 3.8, spec section 3. Every turn, the AI must be able to see its own
// HP/energy/mana/stamina, cooldowns, status effects, and the arena — not
// just narrate blind. This module assembles that view from engine-side
// resource state (resources.js) + the shared arena memory (arenaTracker.js,
// unchanged) into a compact object the prompt builder can drop straight
// into the user turn prompt.

export function buildWorldStateView({ round, selfState, enemyState, selfProfile, enemyProfile, arenaMemory, positions = {}, distance = null, battleMemory = null, timelineState = null }) {
  return {
    protocolVersion: "3.9",
    round,
    self: {
      hp: selfState.hp, maxHp: selfState.maxHp,
      energy: selfState.energy, maxEnergy: selfState.maxEnergy,
      mana: selfState.mana, maxMana: selfState.maxMana,
      stamina: selfState.stamina, maxStamina: selfState.maxStamina,
      shield: selfState.shield,
      realityStability: selfState.realityStability ?? 100,
      mentalStability: selfState.mentalStability ?? 100,
      armor: selfState.armor,
      cooldowns: selfState.cooldowns,
      statusEffects: selfState.statusEffects.map((s) => ({ type: s.type, roundsLeft: s.roundsLeft, stacks: s.stacks })),
      buffs: selfState.buffs || [],
      debuffs: selfState.debuffs || [],
      summons: selfState.summons || [],
      currentForm: selfState.transformations.currentForm,
      transformationState: selfState.transformations,
      position: positions.self || null,
      tier: selfProfile?.combatTier,
      combatProfile: selfProfile,
    },
    opponent: {
      hp: enemyState.hp, maxHp: enemyState.maxHp,
      energy: enemyState.energy, maxEnergy: enemyState.maxEnergy,
      mana: enemyState.mana, maxMana: enemyState.maxMana,
      stamina: enemyState.stamina, maxStamina: enemyState.maxStamina,
      shield: enemyState.shield,
      realityStability: enemyState.realityStability ?? 100,
      mentalStability: enemyState.mentalStability ?? 100,
      armor: enemyState.armor,
      cooldowns: enemyState.cooldowns,
      statusEffects: enemyState.statusEffects.map((s) => ({ type: s.type, roundsLeft: s.roundsLeft, stacks: s.stacks })),
      buffs: enemyState.buffs || [],
      debuffs: enemyState.debuffs || [],
      summons: enemyState.summons || [],
      currentForm: enemyState.transformations.currentForm,
      transformationState: enemyState.transformations,
      position: positions.enemy || null,
      tier: enemyProfile?.combatTier,
      knownPowers: enemyProfile?.knownPowers || [],
      observedWeaknesses: enemyProfile?.weaknesses || [],
    },
    arena: {
      weather: arenaMemory.weather,
      gravity: arenaMemory.gravity,
      timeFlow: arenaMemory.timeFlow,
      activeEvents: arenaMemory.events.map((e) => e.label),
      environmentalDamage: arenaMemory.environmentalDamage || 0,
      destroyedTerrain: arenaMemory.destroyedTerrain || [],
    },
    distance,
    positions,
    recentEvents: (battleMemory?.shortTerm || []).slice(-6),
    timelineState: timelineState || { timeFlow: arenaMemory.timeFlow, branches: [], paradoxRisk: "stable" },
    battleMemory: battleMemory ? {
      currentGoal: battleMemory.currentGoal,
      knownWeaknesses: battleMemory.opponent?.weaknesses || [],
      knownStrengths: battleMemory.opponent?.strengths || [],
      repeatedAbilities: battleMemory.opponent?.mostUsedPowers || [],
      healingHabits: battleMemory.opponent?.healingBehavior || "none observed",
      riskTolerance: battleMemory.opponent?.aggressionLevel || "unknown",
    } : null,
  };
}
