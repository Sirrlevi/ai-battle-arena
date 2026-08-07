
// ---------- ATTACK DEFINITIONS - LONG vs SHORT RANGE - M3 ----------
// Clear definitions so AI never confused

export const ATTACK_RANGES = {
  LONG: {
    label: "Long Range",
    description: "Can hit target from far without closing distance. Includes beams, blasts, projectiles, waves.",
    examples: ["laser beam", "heat vision", "energy blast", "fireball", "ice shard", "lightning bolt", "arrow", "bullet", "plasma blast", "shockwave", "force push", "repulsor blast", "ki blast"],
    needsCloseDistance: false,
    minDistance: 0,
    maxDistance: 900,
    canUseFromFar: true,
    movementRequired: false,
    keywords: ["laser","beam","ray","blast","bolt","fireball","projectile","arrow","bullet","missile","rocket","orb","sphere","ball","wave","pulse","shockwave","heat vision","optic blast","eye beam","flame thrower","ice shard","lightning","thunder","wind gust","force push","repulsor","ki blast","energy blast","plasma","concussive","ranged","distance","throw","shoot","launch"],
  },
  SHORT: {
    label: "Short Range",
    description: "Hand-to-hand combat, must go close to opponent to hit. Includes punches, kicks, elbows, knees, headbutts, grapples, stabs.",
    examples: ["jab","cross","hook","uppercut","punch","kick","knee","elbow","headbutt","clinch","grapple","stab","slash","dirty boxing","shoulder smash"],
    needsCloseDistance: true,
    minDistance: 0,
    maxDistance: 80,
    canUseFromFar: false,
    movementRequired: true,
    approachDistance: 56,
    keywords: ["punch","jab","cross","hook","uppercut","overhand","fist","hammerfist","backfist","palm","kick","knee","roundhouse","front kick","side kick","axe kick","sweep","teep","stomp","elbow","forearm","headbutt","head butt","forehead","skull","clinch","grapple","throw","slam","suplex","wrestle","dirty boxing","shoulder","stab","dagger","knife","blade","slash","cut","claw","bite","close range","melee","hand-to-hand","hand to hand","short range","up close"],
  }
};

// Combo moves list - all 120 short range moves that AI should know
export const COMBO_MOVES_CATALOG = [
  // Basic Punches
  "Jab","Cross","Lead Hook","Rear Hook","Uppercut","Overhand","Body Jab","Body Cross","Liver Shot","Short Uppercut","Zap Uppercut","Corkscrew Punch","Shovel Hook","Double Jab","Jab-Cross",
  // Elbows
  "Horizontal Elbow","Diagonal Elbow","Upward Elbow","Spinning Elbow","Elbow to Head","Double Elbow","Elbow to Body","Rising Elbow","Back Elbow","Elbow Combo",
  // Head
  "Front Headbutt","Side Headbutt","Upward Headbutt","Head Smash","Running Headbutt","Headbutt into Clinch","Forehead Smash","Head Whip","Double Headbutt","Headbutt + Knee",
  // Kicks
  "Front Kick","Low Front Kick","Roundhouse Kick","Low Roundhouse","Switch Kick","Swing Kick","Axe Kick","Knee Strike","Flying Knee","Side Kick","Hook Kick","Spinning Back Kick","Low Sweep","Teep Kick","Snap Kick","Double Low Kick","Kick to Knee","Close Head Kick","Jumping Head Kick","Kick + Punch Combo",
  // Knees
  "Straight Knee","Diagonal Knee","Flying Knee","Clinch Knee","Double Knee","Knee to Body","Knee to Head","Spinning Knee","Jumping Knee","Knee + Elbow",
  // Clinch
  "Shoulder Smash","Clinch Punch","Dirty Boxing","Collar Tie Elbow","Underhook Punch","Body Lock Knee","Thai Clinch Knees","Head Control Elbow","Frame Elbow","Arm Drag Punch","Wrist Control Uppercut","Clinch Headbutt","Break Clinch Counter","Short Slam Setup","Clinch Combo",
  // Combos
  "Jab-Cross-Hook","Jab-Cross-Uppercut","Hook-Uppercut-Hook","Elbow-Knee-Elbow","Punch-Elbow-Headbutt","Low Kick-Cross-Hook","Knee-Elbow-Knee","Headbutt-Knee-Elbow","Zap Uppercut-Hook-Cross","Swing Kick-Punch-Elbow","Double Jab-Overhand","Body-Uppercut-Hook","Low Kick-Body-Head Kick","Clinch Knee-Elbow-Headbutt","Spin Elbow-Knee-Punch","Front Kick-Punch","Triple Punch Burst","Elbow-Headbutt-Knee","4-Hit Punch Flurry","Heavy Finisher","Switch Kick-Cross-Hook","Low-High Kick Combo","Punch-Knee-Punch","Double Elbow + Knee","Head Kick into Clinch","Uppercut-Elbow-Uppercut","Body-Body-Head","Jab Flurry into Uppercut","Spinning Backfist into Knee","Ultimate Close Combo",
  // Extra
  "Superman Punch","Backfist","Spinning Backfist","Hammerfist","Palm Strike","Ridge Hand","Chop","Double Palm","Rising Palm","Short Spinning Kick"
];

export function classifyRange(abilityName, description) {
  const text = (abilityName + " " + description).toLowerCase();
  const longKeywords = ATTACK_RANGES.LONG.keywords;
  const shortKeywords = ATTACK_RANGES.SHORT.keywords;
  
  // Check long first (beams, blasts etc are more specific)
  for (const kw of longKeywords) {
    if (text.includes(kw)) {
      // But if it also contains short keywords like punch + blast, check which is more dominant?
      // If it's "punch blast" - treat as long if blast is main
      if (longKeywords.some(lk => text.includes(lk))) return { range: "long", needsClose: false, type: kw, definition: ATTACK_RANGES.LONG };
    }
  }
  for (const kw of shortKeywords) {
    if (text.includes(kw)) return { range: "short", needsClose: true, type: kw, distance: 60, definition: ATTACK_RANGES.SHORT };
  }
  // Default based on description length? If contains "from a distance" etc
  if (text.includes("ranged") || text.includes("distance") || text.includes("far") || text.includes("projectile")) {
    return { range: "long", needsClose: false, type: "projectile", definition: ATTACK_RANGES.LONG };
  }
  return { range: "short", needsClose: true, type: "melee", distance: 60, definition: ATTACK_RANGES.SHORT };
}

export function getCharacterArchetype(combatStyle, knownPowers) {
  const style = (combatStyle||'').toLowerCase();
  const powers = (knownPowers||[]).join(' ').toLowerCase();
  const text = style + ' ' + powers;
  
  const longCount = ATTACK_RANGES.LONG.keywords.filter(kw => text.includes(kw)).length;
  const shortCount = ATTACK_RANGES.SHORT.keywords.filter(kw => text.includes(kw)).length;
  
  if (longCount > shortCount * 1.5) return "long_range_specialist";
  if (shortCount > longCount * 1.5) return "hand_to_hand_specialist";
  return "hybrid";
}

export function getAvailableMovesForArchetype(archetype) {
  if (archetype === "hand_to_hand_specialist") {
    return { 
      primary: COMBO_MOVES_CATALOG, 
      description: "You are a hand-to-hand specialist. You KNOW all 120 close combat moves listed. You MUST use them - forced to use combos, not just basic strike. Use Jab, Cross, Hook, Uppercut, Elbows, Knees, Headbutts, Clinch moves, and Combos. Be creative, chain them.",
      forcedToUseCombos: true,
      comboUsage: "high"
    };
  } else if (archetype === "long_range_specialist") {
    return {
      primary: ["laser beam","energy blast","fireball","ice shard","lightning bolt","arrow","blast","shockwave"],
      secondary: COMBO_MOVES_CATALOG.slice(0,30), // knows some basic hand-to-hand but prefers long
      description: "You are a long-range specialist with powers like beams, blasts, projectiles. You can hit from far without closing distance. Use long range as primary, but you still KNOW some hand-to-hand moves (Jab, Cross, Hook, etc) for when opponent gets close.",
      forcedToUseCombos: false,
      comboUsage: "low"
    };
  } else {
    return {
      primary: [...COMBO_MOVES_CATALOG.slice(0,40), "energy blast","fireball","laser beam"],
      description: "You are a hybrid fighter. You know both long range (beams, blasts, projectiles) and short range (120 combo moves). Mix both. Use long range when far, close in for hand-to-hand combos when near.",
      forcedToUseCombos: true,
      comboUsage: "medium"
    };
  }
}
