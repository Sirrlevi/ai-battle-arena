
// ---------- WORLD STATE - M2 PHYSICS FIRST ----------
function approximateDistance(selfPosition, enemyPosition) {
  if (!selfPosition || !enemyPosition || !Number.isFinite(selfPosition.x) || !Number.isFinite(enemyPosition.x)) {
    return { value: null, label: "unknown" };
  }
  const value = Math.round(Math.abs(selfPosition.x - enemyPosition.x));
  const label = value <= 90 ? "melee" : value <= 260 ? "close" : "far";
  return { value, label };
}

function getSideInfo(selfPos, enemyPos) {
  if (!selfPos || !enemyPos) return { side: 'unknown', direction: 'unknown', facingNeeded: 1 };
  const enemyOnRight = enemyPos.x > selfPos.x;
  return {
    side: enemyOnRight ? 'right' : 'left',
    direction: enemyOnRight ? 'to your right' : 'to your left',
    facingNeeded: enemyOnRight ? 1 : -1,
    isBehind: Math.sign(selfPos.facing||1) !== Math.sign(enemyPos.x - selfPos.x) ? false : false, // simplified
    relativeX: Math.round(enemyPos.x - selfPos.x),
  };
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

export function buildWorldStateView({ round, selfState, enemyState, selfProfile, enemyProfile, arenaMemory, selfPosition, enemyPosition, livePositions }) {
  const distance = approximateDistance(selfPosition, enemyPosition);
  const sideInfo = getSideInfo(selfPosition, enemyPosition);
  
  // Enhanced position data for M2
  const positionData = livePositions || {};
  const selfPos = selfPosition || positionData.self || null;
  const enemyPos = enemyPosition || positionData.enemy || null;
  
  return {
    round,
    self: fighterView(selfState, selfProfile),
    opponent: {
      ...fighterView(enemyState, enemyProfile),
      knownPowers: enemyProfile?.knownPowers || [],
      observedWeaknesses: enemyProfile?.weaknesses || [],
    },
    distance: {
      ...distance,
      side: sideInfo.side,
      direction: sideInfo.direction,
      relativeX: sideInfo.relativeX,
      facingNeeded: sideInfo.facingNeeded,
    },
    // M2: Live positions so AI knows exactly where opponent is
    livePositions: {
      self: selfPos ? { x: Math.round(selfPos.x), y: Math.round(selfPos.y||0), facing: selfPos.facing||1, vx: Math.round(selfPos.vx||0), isTeleporting: !!selfPos.isTeleporting, isSliding: !!selfPos.isSliding, knockdownPhase: selfPos.knockdownPhase||null } : null,
      enemy: enemyPos ? { x: Math.round(enemyPos.x), y: Math.round(enemyPos.y||0), facing: enemyPos.facing||-1, vx: Math.round(enemyPos.vx||0), isTeleporting: !!enemyPos.isTeleporting, isSliding: !!enemyPos.isSliding, knockdownPhase: enemyPos.knockdownPhase||null, isDown: enemyPos.knockdownPhase==='down' } : null,
      distanceValue: positionData.distance || distance.value,
      side: positionData.side || sideInfo.side,
    },
    arena: {
      weather: arenaMemory.weather,
      gravity: arenaMemory.gravity,
      timeFlow: arenaMemory.timeFlow,
      activeEvents: arenaMemory.events.map((e) => e.label),
      terrainDamage: arenaMemory.terrainDamage || 0,
    },
  };
}
