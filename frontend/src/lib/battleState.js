
// ---------- BATTLE STATE MODULE - M1 REWRITE ----------
// Owns fighter shape + physics profile generation

export const ARENA_WIDTH = 1000;
export const ARENA_HEIGHT = 420;
export const GROUND_Y = 340;

export function computeSpawnPositions(count, arenaWidth = ARENA_WIDTH, groundY = GROUND_Y) {
  const margin = Math.min(140, arenaWidth * 0.12);
  if (count <= 1) return [{ x: arenaWidth / 2, y: groundY }];
  const span = arenaWidth - margin * 2;
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(margin + (span * i) / (count - 1)),
    y: groundY,
  }));
}

const DEFAULT_COLORS = ["#7C6BFF", "#FF7A45", "#3ECF8E", "#E8B94A", "#E4443B", "#4AC7E8", "#E84AC0", "#B4E84A"];

export function createFighter({ key, index = 0, total = 2, provider, model, apiKey, customPrompt, character = {}, position, combatProfile = null }) {
  // M1: physics profile will be generated later from combatProfile, but we init placeholder
  return {
    key,
    provider,
    model,
    apiKey,
    customPrompt,
    name: character.name || `Fighter ${key}`,
    color: character.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    aura: character.aura || "",
    weapon: character.weapon || "",
    combatStyle: character.combatStyle || "",
    personality: character.personality || "",
    intro: character.intro || "",
    hp: 100,
    maxHp: 100,
    energy: 100,
    maxEnergy: 100,
    status: [],
    cooldowns: {},
    alive: true,
    position: position || computeSpawnPositions(total)[index] || { x: ARENA_WIDTH / 2, y: GROUND_Y },
    character: character,
    combatProfile: combatProfile,
    physicsProfile: null, // generated via generatePhysicsProfile
    transformations: [], // track form changes for regen
  };
}

export function resetFighterCombatState(fighter) {
  return {
    ...fighter,
    hp: 100,
    maxHp: 100,
    energy: 100,
    maxEnergy: 100,
    status: [],
    cooldowns: {},
    alive: true,
    physicsProfile: fighter.physicsProfile, // keep physics
  };
}

// Check if should regen physics (transformation etc)
export function checkPhysicsRegen(fighter, eventType, description) {
  const text = `${eventType||''} ${description||''}`.toLowerCase();
  const triggers = ['transform','evolve','mutate','fuse','grow','shrink','form','ascend','giant','colossal','tiny','enlarge'];
  return triggers.some(t=>text.includes(t));
}
