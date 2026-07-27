// ---------- ANIMATION CONTROLLER MODULE ----------
// The orchestrator: one instance per fighter. Wraps a MovementController
// motion state, sequences melee anticipation/execution/followThrough/
// recovery, tracks hit-reaction timers, and asks the state machine what the
// current pose state is. This is the module `App.jsx` actually talks to —
// it never touches motion or the state machine directly. Phase 4 adds:
// tiered hit reactions, a brief hitstop ("impact frames", spec section 16)
// on heavy hits, and an after-image trail buffer for fast movement.

import { createMotionState, updateMotion, issueCommand, setCrouch } from "./movementController.js";
import { resolveAnimationState } from "./animationStateMachine.js";

const MELEE_RANGE = 92;
const ATTACK_DURATIONS = { windup: 0.16, strike: 0.12, followthrough: 0.14, recovery: 0.22 };
const HIT_REACT_DURATION = 0.4; // matches skeletonRig's hit-reaction fade window
const FLASH_DURATION = 0.18;
const BLOCK_DURATION = 0.6;
const KNOCKBACK_SPEED = 260;
const TRANSFORM_PAUSE_DURATION = 0.9; // spec section 15: "pause combat briefly"
const TRAIL_MAX_LENGTH = 6;
const TRAIL_SPEED_THRESHOLD = 320; // px/s — after-images only trail fast movement (dash/knockback/sprint)
const HITSTOP_HEAVY = 0.08; // spec section 16 "Impact Frames" — brief freeze on a heavy hit
const HITSTOP_LETHAL = 0.16;

export function createAnimState(x, y, groundY) {
  return {
    motion: createMotionState(x, y, groundY),
    attackPhase: null, // { variant, phase: 'windup'|'strike'|'followthrough'|'recovery', t }
    pendingImpact: null, // { targetKey, damage, result } fired at the start of 'strike'
    blockTimer: 0,
    hitTimer: 0,
    flashTimer: 0,
    hitReaction: null, // Phase 4: { level, t } — see HIT_REACTION_POSE in skeletonRig.js
    hitstopTimer: 0, // Phase 4: >0 briefly freezes motion/attack advancement on a heavy/lethal hit
    transformTimer: 0, // >0 while a transformation animation is playing
    transformProgress: 0, // 0..1, derived from transformTimer — what skeletonRig actually reads
    statusVisuals: [], // active status-effect visuals (see statusVisuals.js), refreshed each turn
    trail: [], // Phase 4: after-image ring buffer, [{x,y,facing,age}], newest last
    clock: 0, // Phase 4: monotonically increasing per-fighter clock for procedural idle motion
    homeX: x,
  };
}

/** Called when an Animation Event Bus "Transformation" event fires — briefly freezes the fighter's pose (the state machine's "transforming" rule takes over) before combat resumes. */
export function triggerTransformation(anim) {
  anim.transformTimer = TRANSFORM_PAUSE_DURATION;
}

/**
 * Kicks off the visual sequence for a resolved turn. `intent` comes from
 * actionInterpreter; `opponentAnim` is the other fighter's live anim state
 * (read for positioning, never mutated here).
 */
export function queueAction(anim, intent, opponentAnim, entry) {
  if (intent.category === "block") {
    anim.blockTimer = BLOCK_DURATION;
    return;
  }

  if (intent.category === "projectile") {
    anim.attackPhase = { variant: intent.variant, phase: "windup", t: 0 };
    anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, knockback: entry.knockback || 0, projectileVariant: intent.variant, spawnProjectile: true };
    return;
  }

  if (intent.category === "movement") {
    // Pure repositioning flourish (dash/jump/fly/hover/roll/slide/...) that
    // still resolves as an attack in the battle engine — move with the
    // requested style, then land the hit at contact range just like melee.
    const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
    const approachX = opponentAnim.motion.x - dir * MELEE_RANGE;
    if (intent.variant === "jump" || intent.variant === "doubleJump") {
      issueCommand(anim.motion, "jump");
    } else if (intent.variant === "fly" || intent.variant === "hover") {
      issueCommand(anim.motion, intent.variant, approachX, anim.motion.y - 40);
    } else if (intent.variant === "roll" || intent.variant === "slide" || intent.variant === "backDash" || intent.variant === "sideDash") {
      issueCommand(anim.motion, intent.variant, approachX);
    } else {
      issueCommand(anim.motion, "run", approachX);
    }
    anim.attackPhase = { variant: intent.attackVariant || "punch", phase: "approach", t: 0 };
    anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, knockback: entry.knockback || 0 };
    return;
  }

  // melee (default)
  const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
  const approachX = opponentAnim.motion.x - dir * MELEE_RANGE;
  issueCommand(anim.motion, "dash", approachX);
  anim.attackPhase = { variant: intent.variant, phase: "approach", t: 0 };
  anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, knockback: entry.knockback || 0 };
}

/**
 * Phase 4: hit reactions are now tiered (spec section 7) instead of one
 * fixed knockback pose. `opts.damage`/`opts.knockback` come straight off
 * the Combat Engine verdict (Phase 3.8's damage + physics.knockback) when
 * available; a plain-old dodge-roll fallback hit (no verdict) still works
 * with sane defaults.
 */
export function applyHitReaction(anim, fromX, opts = {}) {
  const { damage = 0, knockback = 0, lethal = false } = opts;
  anim.hitTimer = HIT_REACT_DURATION;
  anim.flashTimer = FLASH_DURATION;

  let level = "light";
  if (lethal) level = "death";
  else if (damage > 45 || knockback > 45) level = "launch";
  else if (damage > 28 || knockback > 30) level = "wallcrash";
  else if (damage > 15 || knockback > 15) level = "knockback";
  else if (damage > 6) level = "heavy";
  anim.hitReaction = { level, t: 0 };

  const dir = anim.motion.x >= fromX ? 1 : -1;
  const speedScale = level === "launch" ? 1.6 : level === "wallcrash" ? 1.35 : level === "knockback" ? 1.1 : 0.75;
  anim.motion.vx = dir * KNOCKBACK_SPEED * speedScale;
  if (level === "launch") anim.motion.vy = -260; // knocked airborne

  // Impact frames (spec section 16): a brief global freeze on hard hits so
  // the strike reads as having real weight.
  if (level === "launch" || lethal) anim.hitstopTimer = HITSTOP_LETHAL;
  else if (level === "wallcrash" || level === "knockback") anim.hitstopTimer = HITSTOP_HEAVY;
}

/**
 * Advances one fighter's animation by dt. Returns an "impact" event
 * ({targetKey, damage, result, spawnProjectileFrom}) at most once, exactly
 * when the strike phase begins — the caller (App.jsx) uses that to apply
 * the hit reaction to the defender and/or spawn a projectile.
 */
export function updateAnimation(anim, dt, bounds, homeReturnX, alive = true) {
  // Hitstop: a heavy/lethal hit briefly freezes everything except its own
  // countdown and the fade-out timers, so the impact reads as weighty
  // instead of the fighters sliding straight through it.
  if (anim.hitstopTimer > 0) {
    anim.hitstopTimer = Math.max(0, anim.hitstopTimer - dt);
    if (anim.flashTimer > 0) anim.flashTimer = Math.max(0, anim.flashTimer - dt);
    return { impact: null, state: resolveAnimationState({ alive, hitTimer: anim.hitTimer, transformTimer: anim.transformTimer, attackPhase: null, blocking: false, mode: anim.motion.mode, grounded: anim.motion.grounded, vx: anim.motion.vx, vy: anim.motion.vy }) };
  }

  updateMotion(anim.motion, dt, bounds);
  anim.clock += dt;

  if (anim.blockTimer > 0) anim.blockTimer = Math.max(0, anim.blockTimer - dt);
  if (anim.hitTimer > 0) anim.hitTimer = Math.max(0, anim.hitTimer - dt);
  if (anim.flashTimer > 0) anim.flashTimer = Math.max(0, anim.flashTimer - dt);
  if (anim.transformTimer > 0) anim.transformTimer = Math.max(0, anim.transformTimer - dt);
  anim.transformProgress = anim.transformTimer > 0 ? 1 - anim.transformTimer / TRANSFORM_PAUSE_DURATION : 0;

  if (anim.hitReaction) {
    anim.hitReaction.t += dt;
    if (anim.hitReaction.t > 0.4) anim.hitReaction = null;
  }

  // After-image trail (spec section 16) — only recorded while actually
  // moving fast, so idle/walk never accumulate ghost frames.
  const speed = Math.hypot(anim.motion.vx, anim.motion.vy);
  if (speed > TRAIL_SPEED_THRESHOLD) {
    anim.trail.push({ x: anim.motion.x, y: anim.motion.y, facing: anim.motion.facing, age: 0 });
    if (anim.trail.length > TRAIL_MAX_LENGTH) anim.trail.shift();
  }
  for (const g of anim.trail) g.age += dt;
  anim.trail = anim.trail.filter((g) => g.age < 0.35);

  let impact = null;

  if (anim.attackPhase) {
    const ap = anim.attackPhase;
    if (ap.phase === "approach") {
      if (!anim.motion.command) {
        ap.phase = "windup";
        ap.t = 0;
      }
    } else {
      ap.t += dt;
      const dur = ATTACK_DURATIONS[ap.phase] ?? 0.2;
      if (ap.t >= dur) {
        if (ap.phase === "windup") {
          ap.phase = "strike";
          ap.t = 0;
          if (anim.pendingImpact) {
            impact = anim.pendingImpact;
            anim.pendingImpact = null;
          }
        } else if (ap.phase === "strike") {
          ap.phase = "followthrough";
          ap.t = 0;
        } else if (ap.phase === "followthrough") {
          ap.phase = "recovery";
          ap.t = 0;
          // Return to spawn position after the exchange.
          issueCommand(anim.motion, "walk", homeReturnX ?? anim.homeX);
        } else {
          anim.attackPhase = null;
        }
      }
    }
  }

  const state = resolveAnimationState({
    alive,
    hitTimer: anim.hitTimer,
    transformTimer: anim.transformTimer,
    attackPhase: anim.attackPhase?.phase === "approach" ? null : anim.attackPhase,
    blocking: anim.blockTimer > 0,
    mode: anim.motion.mode,
    grounded: anim.motion.grounded,
    vx: anim.motion.vx,
    vy: anim.motion.vy,
  });

  return { impact, state };
}

export { setCrouch };
