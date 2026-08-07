// ---------- BATTLE STATE MODULE ----------
// Owns the *shape* of a fighter and where they stand in the arena. Nothing
// here knows how to draw a fighter (that's the renderer) or how combat math
// works (that's the battle engine) — this is purely data.

export const ARENA_WIDTH = 1000;
export const ARENA_HEIGHT = 420;
export const GROUND_Y = 340; // every fighter's feet sit on this line for now

/**
 * Evenly spaces `count` fighters left-to-right across the arena. Works for
 * any roster size (2, 4, 8, 16, ...) without the renderer or engine caring —
 * it's just an array of {x, y} handed to whoever draws the scene.
 */
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

/**
 * Builds a fresh fighter record: identity fields from character generation
 * merged with live combat fields (hp/energy/status/cooldowns) and a fixed
 * spawn position. This is the single object shape every module downstream
 * (engine, renderer, HUD) agrees on.
 */
export function createFighter({ key, index = 0, total = 2, provider, model, apiKey, customPrompt, character = {}, position }) {
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
  };
}
