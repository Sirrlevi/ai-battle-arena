// ---------- WORLD STATE ----------
// Phase 3.8 (section 3) + Phase 3.9 (section 4 — "Shared World State"). Every
// turn, BOTH the attacking and defending AI must see an identical
// synchronized snapshot: not just HP/energy, but mana/stamina/shield/armor,
// reality & mental stability, cooldowns, current form, distance, and known
// facts about the opponent. This module is the single place that snapshot
// gets assembled, so the Attack Packet prompt and the Defense Packet prompt
// (see attackPacket.js / defensePacket.js) never drift from each other.

function approximateDistance(selfPosition, enemyPosition) {
  if (!selfPosition || !enemyPosition || !Number.isFinite(selfPosition.x) || !Number.isFinite(enemyPosition.x)) {
    return { value: null, label: "unknown" };
  }
  const value = Math.round(Math.abs(selfPosition.x - enemyPosition.x));
  const label = value <= 90 ? "melee" : value <= 260 ? "close" : "far";
  return { value, label };
}

function fighterView(state, profile) {
  return {
    hp: state.hp, maxHp: state.maxHp,
    energy: state.energy, maxEnergy: state.maxEnergy,
    mana: state.mana, maxMana: state.maxMana,
    stamina: state.stamina, maxStamina: state.maxStamina,
    shield: state.shield,
    armor: state.armor,
    realityStability: state.realityStability,
    mentalStability: state.mentalStability,
    cooldowns: state.cooldowns,
    statusEffects: state.statusEffects.map((s) => ({ type: s.type, roundsLeft: s.roundsLeft, stacks: s.stacks })),
    currentForm: state.transformations.currentForm,
    summons: state.summons,
    tier: profile?.combatTier,
  };
}

export function buildWorldStateView({ round, selfState, enemyState, selfProfile, enemyProfile, arenaMemory, selfPosition, enemyPosition }) {
  const distance = approximateDistance(selfPosition, enemyPosition);
  return {
    round,
    self: fighterView(selfState, selfProfile),
    opponent: {
      ...fighterView(enemyState, enemyProfile),
      knownPowers: enemyProfile?.knownPowers || [],
      observedWeaknesses: enemyProfile?.weaknesses || [],
    },
    distance,
    arena: {
      weather: arenaMemory.weather,
      gravity: arenaMemory.gravity,
      timeFlow: arenaMemory.timeFlow,
      activeEvents: arenaMemory.events.map((e) => e.label),
      terrainDamage: arenaMemory.terrainDamage || 0,
    },
  };
}

