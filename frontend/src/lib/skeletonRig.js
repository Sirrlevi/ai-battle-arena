// ---------- SKELETON RIG ----------
// Phase 4, spec section 1/2/3. Every fighter is now a procedural joint
// skeleton (head/neck/chest/waist/shoulders/upper+lower arms/hands/
// upper+lower legs/feet) instead of two straight limb lines. This module
// is pure math: given the SAME animation context the pre-4 Stickman.jsx
// already received (state, attackPhase, facing, velocity...), it returns a
// joint-angle pose. No sprite sheets, nothing frame-based — every pose is
// computed procedurally every frame, which is what makes blending between
// them (spec section 12) just a lerp instead of a crossfade between assets.
//
// This module never decides WHAT happens (that's still the Combat Engine
// via the Animation Event Bus) — only HOW a given, already-decided state
// looks. Renderer never invents combat.

// ---------- Attack variant catalog (spec section 3) ----------
// Each variant is a 4-phase pose recipe: anticipation -> execution ->
// followThrough -> recovery. Angles are degrees, mirrored by facing.
export const ATTACK_VARIANTS = {
  punch: { arm: [-30, 75, 40, 10], leg: [0, 6, 4, 0], lean: [-4, 10, 4, 0] },
  kick: { arm: [10, -10, 0, 0], leg: [-20, 85, 30, 0], lean: [-6, 8, 2, 0], legLead: true },
  uppercut: { arm: [-50, 100, 60, 15], leg: [0, 10, 6, 0], lean: [-8, 14, 6, 0] },
  roundhouse: { arm: [15, -20, 0, 0], leg: [-30, 110, 40, 0], lean: [-10, 16, 6, 0], legLead: true, spin: true },
  grab: { arm: [-20, 40, 40, 10], leg: [0, 4, 4, 0], lean: [-4, 6, 6, 2] },
  throw: { arm: [40, -60, -20, 0], leg: [0, 8, 4, 0], lean: [-2, -8, -4, 0] },
  slash: { arm: [-40, 90, 50, 10], leg: [0, 6, 4, 0], lean: [-6, 10, 4, 0] },
  hammer: { arm: [-70, 110, 60, 20], leg: [0, 10, 6, 0], lean: [-10, 18, 8, 0] },
  spear: { arm: [-20, 95, 30, 5], leg: [0, 4, 2, 0], lean: [-4, 12, 2, 0] },
  staff: { arm: [-30, 70, 40, 10], leg: [0, 6, 4, 0], lean: [-4, 8, 4, 0] },
  claws: { arm: [-35, 80, 45, 10], leg: [0, 6, 4, 0], lean: [-6, 10, 4, 0] },
  tail: { arm: [0, 10, 5, 0], leg: [0, 6, 4, 0], lean: [-4, 10, 6, 0] },
  energy_punch: { arm: [-30, 80, 45, 10], leg: [0, 6, 4, 0], lean: [-4, 10, 4, 0], glow: true },
  ground_slam: { arm: [-90, 130, 70, 20], leg: [0, 14, 8, 0], lean: [-14, 20, 10, 0] },
  air_combo: { arm: [-30, 75, 40, 10], leg: [-10, 60, 20, 0], lean: [-4, 10, 4, 0], airborne: true },
  dive_attack: { arm: [-60, 100, 50, 10], leg: [0, 8, 4, 0], lean: [-20, 25, 10, 0], airborne: true },
};

const PHASE_INDEX = { anticipation: 0, windup: 0, execution: 1, strike: 1, followThrough: 2, followthrough: 2, recovery: 3 };

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return Math.max(0, Math.min(1, t)); }

/** Blends smoothly between the current and previous phase's target angle instead of snapping — spec section 12's "avoid abrupt transitions". */
function phaseAngle(recipeArr, phaseName, phaseT) {
  const idx = PHASE_INDEX[phaseName] ?? 0;
  const from = recipeArr[idx];
  const to = recipeArr[Math.min(3, idx + 1)];
  return lerp(from, to, clamp01(phaseT));
}

const HIT_REACTION_POSE = {
  light: { lean: 6, armSpread: 10, kneeBend: 4 },
  heavy: { lean: 16, armSpread: 24, kneeBend: 10 },
  knockback: { lean: 22, armSpread: 30, kneeBend: 4 },
  launch: { lean: 30, armSpread: 34, kneeBend: -10 }, // negative = legs kick up
  wallcrash: { lean: 34, armSpread: 40, kneeBend: 14 },
  spin: { lean: 20, armSpread: 45, kneeBend: 6, spin: true },
  collapse: { lean: 40, armSpread: 20, kneeBend: 30 },
  death: { lean: 90, armSpread: 10, kneeBend: 0 },
};

/** Deterministic per-fighter variance so two personas visibly move differently (spec section 14). Pulled from personalitySeed.js's output — this module just consumes it. */
const DEFAULT_SEED = { idleBobSpeed: 1.6, idleBobAmp: 3, stanceWidth: 1, auraPulseSpeed: 1, leanBias: 0 };

/**
 * The single entry point. `ctx` mirrors what animationController already
 * tracks per-fighter plus a few Phase 4 additions (all optional, all with
 * safe defaults so existing callers keep working):
 *   state, facing, vx, vy, grounded, attackPhase: {variant, phase, t},
 *   hitReaction: {level, t} | null, transformProgress (0-1),
 *   crouching, seed (personalitySeed output), t (global clock for idle bob)
 */
export function computePose(ctx) {
  const {
    state = "idle", facing = 1, vx = 0, vy = 0, grounded = true,
    attackPhase = null, hitReaction = null, transformProgress = 0,
    seed = DEFAULT_SEED, t = 0,
  } = ctx;

  const dir = facing >= 0 ? 1 : -1;
  const seedSafe = { ...DEFAULT_SEED, ...seed };

  const pose = {
    headTilt: 0, neckTilt: 0, chestTilt: 0, waistTwist: 0,
    shoulderL: 0, shoulderR: 0, upperArmL: -160, upperArmR: -160, lowerArmL: 0, lowerArmR: 0, handL: 0, handR: 0,
    upperLegL: 8, upperLegR: -8, lowerLegL: 0, lowerLegR: 0, footL: 0, footR: 0,
    bobY: 0, leanX: 0, scaleY: 1, scaleX: 1, spinDeg: 0,
    stanceWidth: seedSafe.stanceWidth,
  };

  // ---- Idle / locomotion base (procedural, spec section 2) ----
  const bobSpeed = seedSafe.idleBobSpeed;
  const bobAmp = seedSafe.idleBobAmp;
  if (state === "idle") {
    pose.bobY = Math.sin(t * bobSpeed) * bobAmp;
    pose.headTilt = Math.sin(t * bobSpeed * 0.5) * 2;
  } else if (state === "walking") {
    const cycle = t * 6;
    pose.upperLegL = 8 + Math.sin(cycle) * 26;
    pose.upperLegR = -8 - Math.sin(cycle) * 26;
    pose.lowerLegL = Math.max(0, -Math.sin(cycle)) * 20;
    pose.lowerLegR = Math.max(0, Math.sin(cycle)) * 20;
    pose.shoulderL = -Math.sin(cycle) * 14;
    pose.shoulderR = Math.sin(cycle) * 14;
    pose.bobY = Math.abs(Math.sin(cycle)) * 3;
  } else if (state === "running") {
    const cycle = t * 11;
    pose.upperLegL = 20 + Math.sin(cycle) * 42;
    pose.upperLegR = -20 - Math.sin(cycle) * 42;
    pose.lowerLegL = Math.max(0, -Math.sin(cycle)) * 40;
    pose.lowerLegR = Math.max(0, Math.sin(cycle)) * 40;
    pose.shoulderL = -Math.sin(cycle) * 28;
    pose.shoulderR = Math.sin(cycle) * 28;
    pose.leanX = 10 * dir;
    pose.bobY = Math.abs(Math.sin(cycle)) * 5;
  } else if (state === "jumping" || state === "falling") {
    pose.upperLegL = 20; pose.upperLegR = -6;
    pose.lowerLegL = 30; pose.lowerLegR = 10;
    pose.shoulderL = -20; pose.shoulderR = 20;
    pose.leanX = (state === "falling" ? 4 : -4) * dir;
  } else if (state === "flying" || state === "hovering") {
    pose.leanX = (state === "flying" ? 26 : 4) * dir;
    pose.upperLegL = 6; pose.upperLegR = -6;
    pose.lowerLegL = 10; pose.lowerLegR = 10;
    pose.bobY = Math.sin(t * bobSpeed * 1.4) * (state === "hovering" ? 5 : 2);
  } else if (state === "blocking") {
    pose.upperArmL = -170; pose.upperArmR = -20;
    pose.lowerArmR = -60;
    pose.stanceWidth = seedSafe.stanceWidth * 1.15;
  }

  // ---- Attack pose (spec section 3: anticipation/execution/followThrough/recovery) ----
  if (attackPhase) {
    const recipe = ATTACK_VARIANTS[attackPhase.variant] || ATTACK_VARIANTS.punch;
    const dur = { windup: 0.16, strike: 0.12, followthrough: 0.14, recovery: 0.26, approach: 0.16 }[attackPhase.phase] ?? 0.2;
    const phaseT = dur > 0 ? clamp01((attackPhase.t || 0) / dur) : 0;
    const armAngle = phaseAngle(recipe.arm, attackPhase.phase, phaseT);
    const legAngle = phaseAngle(recipe.leg, attackPhase.phase, phaseT);
    const leanAngle = phaseAngle(recipe.lean, attackPhase.phase, phaseT);

    if (recipe.legLead) {
      pose.upperLegR = dir > 0 ? legAngle : -legAngle * 0.4;
      pose.upperLegL = dir > 0 ? -legAngle * 0.4 : legAngle;
    } else {
      pose.upperArmR = dir > 0 ? -160 + armAngle : -160 - armAngle * 0.3;
      pose.upperArmL = dir > 0 ? -160 - armAngle * 0.3 : -160 + armAngle;
    }
    pose.leanX += leanAngle * dir;
    if (recipe.spin && (attackPhase.phase === "strike" || attackPhase.phase === "execution")) pose.spinDeg = 180 * phaseT;
  }

  // ---- Hit reaction (spec section 7) ----
  if (hitReaction) {
    const rp = HIT_REACTION_POSE[hitReaction.level] || HIT_REACTION_POSE.light;
    const fade = clamp01(1 - (hitReaction.t || 0) / 0.4);
    pose.leanX -= rp.lean * fade * dir;
    pose.upperArmL -= rp.armSpread * fade;
    pose.upperArmR += rp.armSpread * fade;
    pose.lowerLegL += rp.kneeBend * fade;
    pose.lowerLegR += rp.kneeBend * fade;
    if (rp.spin) pose.spinDeg += 360 * (1 - fade);
  }

  // ---- Transformation cinematic (spec section 15) — a brief "power-up" pose, arms raised, chest expanded ----
  if (transformProgress > 0) {
    pose.upperArmL = lerp(pose.upperArmL, -100, transformProgress);
    pose.upperArmR = lerp(pose.upperArmR, -100, transformProgress);
    pose.chestTilt = -6 * transformProgress;
    pose.scaleY = 1 + 0.06 * Math.sin(transformProgress * Math.PI);
    pose.scaleX = 1 + 0.06 * Math.sin(transformProgress * Math.PI);
  }

  // ---- Crouch ----
  if (state === "crouching") {
    pose.scaleY = 0.72;
    pose.upperLegL = 30; pose.upperLegR = -30;
    pose.lowerLegL = 40; pose.lowerLegR = 40;
  }

  pose.leanX += seedSafe.leanBias * dir;
  return pose;
}

export function defaultSeed() { return DEFAULT_SEED; }
