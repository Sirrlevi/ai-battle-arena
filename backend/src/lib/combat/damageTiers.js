
// ---------- DAMAGE TIERS - M3 CINEMATIC ACTION PACKED ----------
// 0-5, 5-10, 10-20, 20-30, 30-40, 40-60, 60-80, 80-100, 100+
// Each tier has real physics, cinematic effects, ragdoll, camera, etc.

export const DAMAGE_TIERS = [
  {
    min: 0, max: 5, name: "tickle", label: "Light Tap",
    reaction: "flinch",
    knockback: 0.3, stagger: 0.2, shake: null, hitstop: 20, camera: null,
    anim: { type: "hit", lean: 8, crouch: 0.05, hop: 0 },
    vfx: { dust: 0, debris: 0, sparks: 0 },
    sound: "light",
    description: "Same as current - tiny flinch, no push"
  },
  {
    min: 5, max: 10, name: "light", label: "Light Hit",
    reaction: "shake_push",
    knockback: 0.7, stagger: 0.4, shake: "tiny", hitstop: 35, camera: null,
    anim: { type: "hit", lean: 14, crouch: 0.1, hop: -1, shakeIntensity: 0.3, pushBack: 12 },
    vfx: { dust: 0.2, debris: 0, sparks: 1 },
    sound: "light",
    description: "Jyada shake, thoda piche 12px"
  },
  {
    min: 10, max: 20, name: "medium", label: "Solid Hit",
    reaction: "stagger_back",
    knockback: 1.2, stagger: 0.7, shake: "small", hitstop: 55, camera: "small-shake",
    anim: { type: "stagger", lean: 22, crouch: 0.15, hop: -2, shakeIntensity: 0.5, pushBack: 28, stumble: true },
    vfx: { dust: 0.4, debris: 1, sparks: 2, hitFlash: true },
    sound: "medium",
    description: "Aur jyada impact, 28px piche, stumble"
  },
  {
    min: 20, max: 30, name: "heavy", label: "Heavy Blow",
    reaction: "knockdown_launch",
    knockback: 2.0, stagger: 1.0, shake: "medium", hitstop: 80, camera: "medium-shake",
    anim: { type: "knockdown", lean: 35, crouch: 0.25, hop: -4, fallDirection: "back", launchSpeed: 180, airTime: 0.18, fallBack: true },
    vfx: { dust: 0.7, debris: 3, sparks: 3, shockwave: 0.5, crack: 0.3 },
    sound: "heavy",
    description: "Piche jake pade, real physics, ragdoll start, 180 speed launch"
  },
  {
    min: 30, max: 40, name: "very_heavy", label: "Crushing Blow",
    reaction: "launch_fall",
    knockback: 2.8, stagger: 1.2, shake: "medium", hitstop: 100, camera: "medium-shake",
    anim: { type: "launch_fall", lean: 45, crouch: 0.35, hop: -6, fallDirection: "back", launchSpeed: 260, airTime: 0.28, spin: 15, ragdoll: 0.3 },
    vfx: { dust: 0.9, debris: 5, sparks: 4, shockwave: 0.7, crack: 0.6, impactRing: true },
    sound: "very_heavy",
    description: "Aur piche, 260 speed, hawa me 0.28s, thoda spin, wall tak ja sakta"
  },
  {
    min: 40, max: 60, name: "brutal", label: "Brutal Impact",
    reaction: "wall_slam",
    knockback: 3.8, stagger: 1.5, shake: "large", hitstop: 120, camera: "large-shake",
    anim: { type: "wall_slam", lean: 55, crouch: 0.45, hop: -8, fallDirection: "back", launchSpeed: 340, airTime: 0.38, spin: 25, ragdoll: 0.5, wallBounce: true },
    vfx: { dust: 1.0, debris: 8, sparks: 6, shockwave: 1.0, crack: 0.9, crater: 0.5, screenFlash: 0.2 },
    sound: "brutal",
    description: "Wall boundary se takraye, 340 speed, bounce, camera large shake"
  },
  {
    min: 60, max: 80, name: "devastating", label: "Devastating Blow",
    reaction: "ragdoll_slam",
    knockback: 5.0, stagger: 2.0, shake: "large", hitstop: 150, camera: "large-shake",
    anim: { type: "ragdoll_slam", lean: 70, crouch: 0.6, hop: -12, fallDirection: "back", launchSpeed: 460, airTime: 0.52, spin: 40, ragdoll: 0.8, wallBounce: true, groundBounce: true },
    vfx: { dust: 1.2, debris: 12, sparks: 8, shockwave: 1.3, crack: 1.2, crater: 0.9, impactRing: true, screenFlash: 0.4, slowMo: 0.2 },
    sound: "devastating",
    description: "Ragdoll, piche jake pade, wall bounce + ground bounce, slow-mo"
  },
  {
    min: 80, max: 100, name: "annihilating", label: "Annihilating Strike",
    reaction: "catastrophic",
    knockback: 6.5, stagger: 2.5, shake: "extreme", hitstop: 180, camera: "extreme-shake",
    anim: { type: "catastrophic", lean: 85, crouch: 0.8, hop: -16, fallDirection: "back", launchSpeed: 600, airTime: 0.68, spin: 60, ragdoll: 1.0, wallBounce: true, groundBounce: true, roll: true },
    vfx: { dust: 1.5, debris: 18, sparks: 12, shockwave: 1.8, crack: 1.5, crater: 1.3, impactRing: true, screenFlash: 0.6, slowMo: 0.35, zoom: 1.15 },
    sound: "annihilating",
    description: "Catastrophic, 600 speed, full ragdoll, roll, extreme camera, zoom, slow-mo"
  },
  {
    min: 100, max: Infinity, name: "godlike", label: "Godlike Annihilation",
    reaction: "godlike",
    knockback: 8.5, stagger: 3.0, shake: "extreme", hitstop: 220, camera: "extreme-shake",
    anim: { type: "godlike", lean: 90, crouch: 1.0, hop: -20, fallDirection: "back", launchSpeed: 800, airTime: 0.85, spin: 90, ragdoll: 1.0, wallBounce: true, groundBounce: true, roll: true, crater: true },
    vfx: { dust: 2.0, debris: 25, sparks: 15, shockwave: 2.5, crack: 2.0, crater: 2.0, impactRing: true, screenFlash: 0.8, slowMo: 0.5, zoom: 1.25, screenShake: 1.5 },
    sound: "godlike",
    description: "Godlike, 800 speed, wall to wall, full cinematic"
  },
];

export function getTierForDamage(damage) {
  return DAMAGE_TIERS.find(t => damage >= t.min && damage < t.max) || DAMAGE_TIERS[0];
}

export function getImpactForTier(tier, attackerX, defenderX, physicsProfile) {
  const dir = defenderX >= attackerX ? 1 : -1;
  const massFactor = physicsProfile ? Math.max(0.4, 150/(physicsProfile.mass||75)) : 1;
  return {
    knockback: tier.knockback * 260 * massFactor,
    launchVelocity: { x: dir * tier.anim.launchSpeed * massFactor || dir * tier.knockback * 80, y: tier.anim.hop * 10 || -tier.anim.launchSpeed*0.3 },
    stagger: tier.stagger,
    hitstop: tier.hitstop,
    camera: tier.camera,
    shake: tier.shake,
    fallDirection: tier.anim.fallDirection || 'back',
    isRagdoll: (tier.anim.ragdoll||0) > 0.3,
    isWallBounce: !!tier.anim.wallBounce,
    isGroundBounce: !!tier.anim.groundBounce,
  };
}

// For defensive stance after fall
export const DEFENSIVE_STANCE = {
  duration: 1.2, // how long to hold defensive after getting up
  crouch: 0.18,
  armGuard: 30,
  lean: -4,
  distanceToKeep: 120, // keep this distance from opponent
  slowMovement: 0.6, // 60% speed while in defensive
  canBlock: true,
};

export const LONG_RANGE_DEFINITIONS = [
  { type: "laser", names: ["laser","beam","ray","heat vision","optic blast","eye beam"], range: "long", needsDistance: false, projectile: true },
  { type: "blast", names: ["blast","energy blast","ki blast","plasma blast","concussive blast"], range: "long", needsDistance: false, projectile: true },
  { type: "projectile", names: ["fireball","energy bolt","bolt","orb","sphere","ball","arrow","bullet","missile","rocket"], range: "long", needsDistance: false, projectile: true },
  { type: "wave", names: ["shockwave","wave","pulse","repulsor","force push"], range: "long", needsDistance: false, projectile: false, area: true },
  { type: "elemental", names: ["lightning","thunder","ice shard","frost","flame thrower","fire breath","wind gust"], range: "long", needsDistance: false, projectile: true },
];

export const SHORT_RANGE_DEFINITIONS = [
  { type: "punch", names: ["punch","jab","cross","hook","uppercut","overhand","strike","fist","hammerfist","backfist","palm"], range: "short", needsDistance: true, distance: 60, melee: true },
  { type: "kick", names: ["kick","knee","roundhouse","front kick","side kick","axe kick","sweep","teep","stomp"], range: "short", needsDistance: true, distance: 75, melee: true },
  { type: "elbow", names: ["elbow","forearm"], range: "short", needsDistance: true, distance: 45, melee: true },
  { type: "head", names: ["headbutt","head butt","forehead","skull"], range: "short", needsDistance: true, distance: 40, melee: true },
  { type: "grapple", names: ["clinch","grapple","throw","slam","suplex","wrestle","dirty boxing","shoulder"], range: "short", needsDistance: true, distance: 50, melee: true },
  { type: "stab", names: ["stab","dagger","knife","blade","slash","cut","claw","bite"], range: "short", needsDistance: true, distance: 55, melee: true },
];

export function classifyAttackRange(abilityName, description) {
  const text = (abilityName + ' ' + description).toLowerCase();
  for (const def of LONG_RANGE_DEFINITIONS) {
    if (def.names.some(n => text.includes(n))) return { range: 'long', type: def.type, needsClose: false, definition: def };
  }
  for (const def of SHORT_RANGE_DEFINITIONS) {
    if (def.names.some(n => text.includes(n))) return { range: 'short', type: def.type, needsClose: true, distance: def.distance, definition: def };
  }
  // Default: if contains projectile words -> long, else short
  if (text.includes('ranged') || text.includes('distance') || text.includes('projectile') || text.includes('throw') || text.includes('shoot')) {
    return { range: 'long', type: 'projectile', needsClose: false };
  }
  return { range: 'short', type: 'melee', needsClose: true, distance: 60 };
}
