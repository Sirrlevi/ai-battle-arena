// ---------- CHARACTER ANIMATION MODULE (Phase 4A) ----------
// Pure functions, no React, no game-state imports. Turns the same signals
// the pre-4A renderer already had (state, attackPhase, facing, hp/energy,
// alive) plus each fighter's own generated flavor text (combatStyle/
// weapon/personality/aura — Phase 1 fields, previously unused for
// rendering) into a full joint-angle pose for the skeleton in Stickman.jsx.
//
// This module NEVER reads a Combat Engine verdict and never decides what
// happened in a fight — it only decides how to SHOW a state the animation
// pipeline (animationController.js / animationStateMachine.js, both
// untouched by this phase) already resolved. Same rule Phase 3.95
// established for the rest of the renderer, extended down to the joint
// level: this file picks a pose, it never picks an outcome.
//
// Angle convention: every joint angle is degrees measured from "hanging
// straight down" (legs) or "straight up" (spine chain), rotating toward
// +x as the angle increases. `lower` segment angles (elbow/knee) are
// RELATIVE to their parent's absolute angle, not to world-vertical — i.e.
// a real 2-link forward-kinematics chain, so a bent knee swings correctly
// with the thigh instead of scissoring independently.

// ---------- small numeric helpers ----------
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function mix(a, b, t) {
  return a + (b - a) * t;
}

// ---------- rig proportions ----------
// Single source of truth for segment lengths — Stickman.jsx imports this
// same object for drawing, so the pose math here and the pixels it
// produces can never drift apart.
export const RIG = {
  HIP_Y: -55, // unchanged from the pre-4A stick figure's HIP_Y — same ground anchor
  CHEST_LEN: 29,
  NECK_LEN: 13,
  HEAD_R: 13,
  HEAD_GAP: 4,
  SHOULDER_SPAN: 13,
  HIP_SPAN: 9,
  UPPER_ARM: 22,
  LOWER_ARM: 20,
  HAND_R: 3.4,
  UPPER_LEG: 28,
  LOWER_LEG: 25,
  FOOT_LEN: 11,
};

// ---------- personality seed ----------
// Deterministic (same fighter -> same numbers every call, every session) —
// derived from the AI-generated character fields that already exist on
// every fighter (battleState.js's createFighter) but were never read by
// the renderer before this phase. Spec section 14: "different personas
// should visibly behave differently."
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededFloat(hash, salt) {
  const x = Math.sin(hash * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x); // deterministic pseudo-random, 0..1
}

export function personalitySeed(fighter) {
  const key = [fighter?.name, fighter?.combatStyle, fighter?.weapon, fighter?.personality, fighter?.aura]
    .filter(Boolean)
    .join("|") || "fighter";
  const h = hashString(key);
  const f = (salt) => seededFloat(h, salt);
  return {
    stanceWidth: 0.85 + f(1) * 0.3, // 0.85 - 1.15
    armCarry: -8 + f(2) * 16, // idle arm-away-from-body angle, deg
    lean: -4 + f(3) * 8, // idle torso lean, deg
    strideScale: 0.9 + f(4) * 0.25,
    guardHeight: -6 + f(5) * 12,
    auraSpikes: 3 + Math.floor(f(6) * 6), // 3-8
    auraPulseMs: 900 + f(7) * 700, // 900-1600ms, ambient aura/breathing period
    auraJitter: 0.4 + f(8) * 0.6,
    headTiltIdle: -3 + f(9) * 6,
    limpBias: f(10) > 0.5 ? 1 : -1, // which way a defeated fighter slumps
  };
}

// ---------- base pose ----------
function basePose() {
  return {
    waistLean: 0,
    chestLean: 0,
    chestBob: 0,
    neckTilt: 0,
    headTilt: 0,
    headBob: 0,
    armL: { upper: 10, lower: 12 },
    armR: { upper: 10, lower: 12 },
    legL: { upper: 0, lower: 8 },
    legR: { upper: 0, lower: 8 },
    footL: 0,
    footR: 0,
    stance: 1,
    crouch: 0,
    hop: 0,
  };
}

function setActingArm(p, facing, upper, lower, otherUpper = 8, otherLower = 12) {
  if (facing >= 0) {
    p.armR = { upper, lower };
    p.armL = { upper: otherUpper, lower: otherLower };
  } else {
    p.armL = { upper, lower };
    p.armR = { upper: otherUpper, lower: otherLower };
  }
}

// ---------- ambient / movement poses ----------
function poseIdle(seed, now) {
  const p = basePose();
  const phase = ((now / seed.auraPulseMs) % 1) * Math.PI * 2;
  const breathe = Math.sin(phase);
  p.chestBob = breathe * 1.4;
  p.headBob = breathe * 0.6;
  p.chestLean = seed.lean * 0.5 + breathe * 1.1;
  p.waistLean = seed.lean * 0.6;
  p.headTilt = seed.headTiltIdle + Math.sin(phase * 0.6 + 1.3) * 1.6;
  p.armL.upper = 9 + seed.armCarry + Math.sin(phase) * 2.2;
  p.armR.upper = 9 - seed.armCarry * 0.4 + Math.sin(phase + Math.PI) * 2.2;
  p.stance = seed.stanceWidth;
  return p;
}

/** Walk/run/dash share one continuous gait, phase-locked to world-x traveled
 * (not a timer) so the stride never desyncs from actual movement, and
 * `intensity` (derived in Stickman.jsx from real frame-to-frame speed)
 * scales it smoothly from an ambling walk up through a full dash-in sprint
 * instead of snapping between three hardcoded animations. */
function poseGait(worldX, facing, seed, intensity) {
  const p = basePose();
  const stride = 50 * seed.strideScale;
  const phase = (worldX / stride) * Math.PI;
  const swing = 22 * intensity;
  const legL = Math.sin(phase) * swing * facing;
  const legR = Math.sin(phase + Math.PI) * swing * facing;
  p.legL.upper = legL;
  p.legR.upper = legR;
  p.legL.lower = 6 + Math.abs(legL) * 0.5;
  p.legR.lower = 6 + Math.abs(legR) * 0.5;
  p.armL.upper = 10 - legR * 0.55;
  p.armR.upper = 10 - legL * 0.55;
  p.armL.lower = 16;
  p.armR.lower = 16;
  p.footL = -legL * 0.3;
  p.footR = -legR * 0.3;
  p.chestBob = -Math.abs(Math.sin(phase)) * 1.6 * intensity;
  p.headBob = p.chestBob * 0.5;
  p.chestLean = -3 * intensity;
  p.waistLean = seed.lean * 0.3;
  p.stance = seed.stanceWidth;
  return p;
}

function poseJumping(seed) {
  const p = basePose();
  p.legL.upper = -14;
  p.legR.upper = -14;
  p.legL.lower = 34;
  p.legR.lower = 34;
  p.armL.upper = -60;
  p.armR.upper = -60;
  p.armL.lower = 14;
  p.armR.lower = 14;
  p.chestLean = -4;
  p.stance = seed.stanceWidth * 0.9;
  return p;
}

function poseFalling(seed) {
  const p = basePose();
  p.legL.upper = 10;
  p.legR.upper = -6;
  p.legL.lower = 16;
  p.legR.lower = 10;
  p.armL.upper = -30;
  p.armR.upper = 30;
  p.armL.lower = 20;
  p.armR.lower = 20;
  p.chestLean = 6;
  p.stance = seed.stanceWidth;
  return p;
}

function poseFlying(seed, now, facing) {
  const p = basePose();
  const t = now / 1000;
  const bob = Math.sin(t * 3) * 2.2;
  p.waistLean = -34 * facing;
  p.chestLean = -18;
  p.headTilt = -10;
  p.legL.upper = 18 * facing;
  p.legR.upper = 22 * facing;
  p.legL.lower = 10;
  p.legR.lower = 10;
  p.armL.upper = -70 + bob;
  p.armR.upper = -70 - bob;
  p.armL.lower = 10;
  p.armR.lower = 10;
  p.chestBob = bob;
  p.headBob = bob * 0.6;
  return p;
}

function poseHovering(seed, now) {
  const p = basePose();
  const t = now / 1000;
  const bob = Math.sin(t * 2.1) * 3;
  p.legL.upper = Math.sin(t * 1.3) * 6;
  p.legR.upper = Math.sin(t * 1.3 + 1.2) * 6;
  p.legL.lower = 12;
  p.legR.lower = 12;
  p.armL.upper = 24 + bob * 0.5;
  p.armR.upper = 24 - bob * 0.5;
  p.armL.lower = 18;
  p.armR.lower = 18;
  p.chestBob = bob;
  p.headBob = bob * 0.5;
  p.waistLean = seed.lean * 0.4;
  p.stance = seed.stanceWidth;
  return p;
}

function poseBlocking(seed) {
  const p = basePose();
  const raise = -66 + seed.guardHeight;
  p.armL.upper = raise;
  p.armR.upper = raise;
  p.armL.lower = 42;
  p.armR.lower = 42;
  p.legL.lower = 16;
  p.legR.lower = 16;
  p.chestLean = 4;
  p.crouch = 0.3;
  p.stance = seed.stanceWidth * 1.1;
  return p;
}

// ---------- attack poses ----------
// Every variant plays anticipation (windup) -> execution (strike) ->
// recovery, keyframed and blended by `prog` (0-1 progress within whatever
// sub-phase animationController.js is currently in). The `t`/duration
// numbers below intentionally mirror animationController's own
// ATTACK_DURATIONS for smooth easing only — this file has no import on
// that module and never touches real attack timing, cooldowns, or damage.
const PHASE_DURATION_FOR_EASING = { windup: 0.16, strike: 0.12, recovery: 0.26 };

function phaseProgress(attackPhase) {
  const dur = PHASE_DURATION_FOR_EASING[attackPhase.phase] ?? 0.2;
  return clamp((attackPhase.t ?? 0) / dur, 0, 1);
}

function posePunch(phase, prog, f) {
  const p = basePose();
  let u, l, waist, chest;
  if (phase === "windup") { u = mix(10, -38, prog); l = mix(12, 26, prog); waist = mix(0, -9, prog); chest = mix(0, -3, prog); }
  else if (phase === "strike") { u = mix(-38, 88, prog); l = mix(26, -8, prog); waist = mix(-9, 11, prog); chest = mix(-3, 6, prog); }
  else { u = mix(88, 18, prog); l = mix(-8, 10, prog); waist = mix(11, 0, prog); chest = mix(6, 0, prog); }
  setActingArm(p, f, u, l);
  p.waistLean = waist * f;
  p.chestLean = chest;
  p.crouch = 0.1;
  return p;
}

function poseSlash(phase, prog, f) {
  const p = basePose();
  let u, l, waist, chest;
  if (phase === "windup") { u = mix(10, -55, prog); l = mix(12, 32, prog); waist = mix(0, -14, prog); chest = mix(0, -6, prog); }
  else if (phase === "strike") { u = mix(-55, 78, prog); l = mix(32, -16, prog); waist = mix(-14, 16, prog); chest = mix(-6, 10, prog); }
  else { u = mix(78, 26, prog); l = mix(-16, 12, prog); waist = mix(16, 0, prog); chest = mix(10, 0, prog); }
  setActingArm(p, f, u, l);
  p.waistLean = waist * f;
  p.chestLean = chest;
  p.crouch = 0.08;
  return p;
}

function poseUppercut(phase, prog, f) {
  const p = basePose();
  let u, l, crouch, hop;
  if (phase === "windup") { u = mix(10, -70, prog); l = mix(12, 40, prog); crouch = mix(0.05, 0.42, prog); hop = 0; }
  else if (phase === "strike") { u = mix(-70, 168, prog); l = mix(40, -6, prog); crouch = mix(0.42, 0, prog); hop = -Math.sin(prog * Math.PI) * 7; }
  else { u = mix(168, 20, prog); l = mix(-6, 10, prog); crouch = 0; hop = mix(-1, 0, prog); }
  setActingArm(p, f, u, l);
  p.crouch = crouch;
  p.hop = hop;
  p.chestLean = phase === "strike" ? -8 : 3;
  return p;
}

function poseRoundhouse(phase, prog, f) {
  const p = basePose();
  let legU, legL, waist, armSpread;
  if (phase === "windup") { legU = mix(0, -32, prog); legL = mix(8, 24, prog); waist = mix(0, -22, prog); armSpread = mix(8, 26, prog); }
  else if (phase === "strike") { legU = mix(-32, 96, prog); legL = mix(24, 8, prog); waist = mix(-22, 24, prog); armSpread = mix(26, 40, prog); }
  else { legU = mix(96, 8, prog); legL = mix(8, 10, prog); waist = mix(24, 0, prog); armSpread = mix(40, 10, prog); }
  const kickLeg = f >= 0 ? "legR" : "legL";
  const standLeg = f >= 0 ? "legL" : "legR";
  p[kickLeg] = { upper: legU * f, lower: legL };
  p[standLeg] = { upper: -6 * f, lower: 12 };
  p.armL.upper = -armSpread;
  p.armR.upper = armSpread;
  p.armL.lower = 20;
  p.armR.lower = 20;
  p.waistLean = waist * f;
  p.chestLean = -4;
  p.crouch = 0.12;
  return p;
}

function poseKick(phase, prog, f) {
  const p = basePose();
  let legU, legL, chest;
  if (phase === "windup") { legU = mix(0, 58, prog); legL = mix(8, -55, prog); chest = mix(0, -6, prog); }
  else if (phase === "strike") { legU = mix(58, 84, prog); legL = mix(-55, -4, prog); chest = mix(-6, -12, prog); }
  else { legU = mix(84, 6, prog); legL = mix(-4, 10, prog); chest = mix(-12, 0, prog); }
  const kickLeg = f >= 0 ? "legR" : "legL";
  const standLeg = f >= 0 ? "legL" : "legR";
  p[kickLeg] = { upper: legU * f, lower: legL };
  p[standLeg] = { upper: -4 * f, lower: 14 };
  p.armL.upper = 22;
  p.armR.upper = 22;
  p.chestLean = chest;
  p.crouch = 0.06;
  return p;
}

function poseCast(phase, prog, f) {
  // Ranged / self-directed abilities (beam, projectile, heal, shield,
  // transformation-flavored casts) — the engine tells the renderer THAT
  // an ability resolved this way (ability.range !== "melee" or no verdict
  // at all), never which pose looks best, so this is the cosmetic default
  // for "not a punch/kick/slash."
  const p = basePose();
  let u, chest;
  if (phase === "windup") { u = mix(10, -76, prog); chest = mix(0, -10, prog); }
  else if (phase === "strike") { u = mix(-76, 58, prog); chest = mix(-10, 8, prog); }
  else { u = mix(58, 14, prog); chest = mix(8, 0, prog); }
  p.armL.upper = u;
  p.armR.upper = u;
  p.armL.lower = phase === "strike" ? -6 : 16;
  p.armR.lower = phase === "strike" ? -6 : 16;
  p.chestLean = chest;
  p.crouch = 0.1;
  p.stance = 1.1;
  return p;
}

const MELEE_VARIANTS = { punch: posePunch, kick: poseKick, slash: poseSlash, uppercut: poseUppercut, roundhouse: poseRoundhouse };

function poseAttacking(attackPhase, facing, seed, now) {
  if (!attackPhase) return poseIdle(seed, now);
  const gen = MELEE_VARIANTS[attackPhase.variant] || poseCast;
  const prog = phaseProgress(attackPhase);
  return gen(attackPhase.phase, prog, facing >= 0 ? 1 : -1);
}

// ---------- reaction poses ----------
function poseHit(seed, hitMagnitude, facing, now) {
  const p = basePose();
  const t = clamp((hitMagnitude || 0) / 45, 0, 1); // continuous light -> heavy, spec section 7
  const away = facing >= 0 ? -1 : 1;
  p.chestLean = mix(-9, -30, t) * away * -1;
  p.headTilt = mix(6, 20, t) * away * -1;
  p.waistLean = mix(-4, -14, t) * away * -1;
  p.armL.upper = mix(20, 55, t);
  p.armR.upper = mix(-20, -55, t);
  p.legL.lower = mix(8, 20, t);
  p.legR.lower = mix(8, 14, t);
  p.chestBob = -mix(1, 3.5, t);
  return p;
}

function poseTransforming(seed, now) {
  const p = basePose();
  const t = now / 1000;
  const surge = 1 + Math.sin(t * 9) * 0.06;
  p.armL.upper = -132 * surge;
  p.armR.upper = 132 * surge;
  p.armL.lower = 8;
  p.armR.lower = 8;
  p.headTilt = -16;
  p.chestLean = -10;
  p.chestBob = -4;
  p.stance = 1.35;
  p.crouch = 0;
  return p;
}

function poseDead(seed, now) {
  const p = basePose();
  const s = seed.limpBias;
  p.armL.upper = 46 + seed.armCarry * 0.5;
  p.armR.upper = 42 - seed.armCarry * 0.5;
  p.armL.lower = 34;
  p.armR.lower = 30;
  p.legL.upper = 12 * s;
  p.legR.upper = -8 * s;
  p.legL.lower = 30;
  p.legR.lower = 26;
  p.headTilt = 26 * s;
  p.chestLean = 8 * s;
  p.waistLean = 4 * s;
  return p;
}

function poseVictory(seed, now) {
  const p = basePose();
  const t = now / 1000;
  const bounce = Math.max(0, Math.sin(t * 3.2)) * 3;
  p.armL.upper = -168;
  p.armR.upper = 168;
  p.armL.lower = 6;
  p.armR.lower = 6;
  p.headTilt = -8;
  p.chestLean = -4;
  p.chestBob = -bounce;
  p.headBob = -bounce * 0.7;
  p.hop = -bounce * 0.6;
  p.stance = seed.stanceWidth * 1.05;
  return p;
}

// ---------- top-level dispatch ----------
/**
 * ctx: {
 *   fighter,            // for personality seed (combatStyle/weapon/personality/aura/name)
 *   state,              // resolved animationStateMachine state string (unchanged module)
 *   attackPhase,        // anim.attackPhase | null (unchanged shape from animationController)
 *   facing,             // 1 | -1
 *   alive,
 *   hitMagnitude,       // last hit's entry.damage, 0 if none — optional, cosmetic only
 *   isWinner,           // optional
 *   now,                // Date.now() at render time, for continuous ambient motion
 *   worldX,              // pose.x — gait phase is locked to distance traveled, not a timer
 *   speed,              // px/s magnitude, derived in Stickman.jsx from frame-to-frame worldX delta
 *   landPulse,          // 0-1 decaying value from Stickman.jsx's own land-detection, or 0
 * }
 */
export function computeSkeletonPose(ctx) {
  const { fighter, state, attackPhase, facing = 1, alive = true, hitMagnitude = 0, isWinner = false, now = 0, worldX = 0, speed = 0, landPulse = 0 } = ctx;
  const seed = personalitySeed(fighter);

  let pose;
  if (!alive) {
    pose = poseDead(seed, now);
  } else if (isWinner && (state === "idle" || state === "walking")) {
    pose = poseVictory(seed, now);
  } else {
    switch (state) {
      case "transforming": pose = poseTransforming(seed, now); break;
      case "hit": pose = poseHit(seed, hitMagnitude, facing, now); break;
      case "attacking": pose = poseAttacking(attackPhase, facing, seed, now); break;
      case "blocking": pose = poseBlocking(seed); break;
      case "flying": pose = poseFlying(seed, now, facing >= 0 ? 1 : -1); break;
      case "hovering": pose = poseHovering(seed, now); break;
      case "jumping": pose = poseJumping(seed); break;
      case "falling": pose = poseFalling(seed); break;
      case "running": pose = poseGait(worldX, facing, seed, clamp(speed / 260, 1.05, 2.4)); break;
      case "walking": pose = poseGait(worldX, facing, seed, clamp(speed / 260, 0.5, 1.05)); break;
      case "idle":
      default: pose = poseIdle(seed, now); break;
    }
  }

  if (landPulse > 0 && alive) {
    pose = { ...pose, crouch: Math.max(pose.crouch, landPulse * 0.75) };
  }
  return pose;
}

// ---------- aura styling (spec sections 6 + 14, partial) ----------
// Wired to data every fighter already carries (hp/energy — Phase 1 fields)
// plus the same personality seed above. Mana/current-form/ultimate-charge/
// rage/reality-instability inputs from spec section 6 are NOT included:
// those resource pools exist server-side (Phase 3.9's worldState.js) but
// are never sent to the frontend fighter object today, so wiring them is a
// data-plumbing change, not a rendering one — see PHASE_4A_NOTES.md.
export function computeAuraStyle(fighter, seed) {
  const hpPct = clamp((fighter?.hp ?? 100) / (fighter?.maxHp || 100), 0, 1);
  const energyPct = clamp((fighter?.energy ?? 100) / (fighter?.maxEnergy || 100), 0, 1);
  return {
    scale: 0.88 + energyPct * 0.3,
    danger: 1 - hpPct, // 0 = healthy, 1 = critical — blend toward a warning tint
    pulseMs: seed.auraPulseMs,
    pulseOffsetMs: (hashString(fighter?.name || "") % 900),
    spikes: seed.auraSpikes,
    jitter: seed.auraJitter,
  };
}

export function lerpPose(a, b, t) {
  return {
    waistLean: mix(a.waistLean, b.waistLean, t),
    chestLean: mix(a.chestLean, b.chestLean, t),
    chestBob: mix(a.chestBob, b.chestBob, t),
    neckTilt: mix(a.neckTilt, b.neckTilt, t),
    headTilt: mix(a.headTilt, b.headTilt, t),
    headBob: mix(a.headBob, b.headBob, t),
    armL: { upper: mix(a.armL.upper, b.armL.upper, t), lower: mix(a.armL.lower, b.armL.lower, t) },
    armR: { upper: mix(a.armR.upper, b.armR.upper, t), lower: mix(a.armR.lower, b.armR.lower, t) },
    legL: { upper: mix(a.legL.upper, b.legL.upper, t), lower: mix(a.legL.lower, b.legL.lower, t) },
    legR: { upper: mix(a.legR.upper, b.legR.upper, t), lower: mix(a.legR.lower, b.legR.lower, t) },
    footL: mix(a.footL, b.footL, t),
    footR: mix(a.footR, b.footR, t),
    stance: mix(a.stance, b.stance, t),
    crouch: mix(a.crouch, b.crouch, t),
    hop: mix(a.hop, b.hop, t),
  };
}

export { clamp, mix };
