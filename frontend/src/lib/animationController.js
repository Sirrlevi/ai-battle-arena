// ---------- ANIMATION CONTROLLER MODULE ----------
// The orchestrator: one instance per fighter. Wraps a MovementController
// motion state, sequences melee windup/attack/recovery, tracks hit-reaction
// timers, and asks the state machine what the current pose state is. This
// is the module `App.jsx` actually talks to — it never touches motion or
// the state machine directly.

import { createMotionState, updateMotion, issueCommand } from "./movementController.js";
import { resolveAnimationState } from "./animationStateMachine.js";

const MELEE_RANGE = 92;
const ATTACK_DURATIONS = { windup: 0.16, strike: 0.12, recovery: 0.26 };
const HIT_REACT_DURATION = 0.25;
const FLASH_DURATION = 0.18;
const BLOCK_DURATION = 0.6;
const KNOCKBACK_SPEED = 260;

export function createAnimState(x, y, groundY) {
  return {
    motion: createMotionState(x, y, groundY),
    attackPhase: null, // { variant, phase: 'windup'|'strike'|'recovery', t }
    pendingImpact: null, // { targetKey, damage, result } fired at the start of 'strike'
    blockTimer: 0,
    hitTimer: 0,
    flashTimer: 0,
    homeX: x,
  };
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
    anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, projectileVariant: intent.variant, spawnProjectile: true };
    return;
  }

  if (intent.category === "movement") {
    // Pure repositioning flourish (dash/jump/fly/hover) that still resolves
    // as an attack in the battle engine — move with the requested style,
    // then land the hit at contact range just like melee.
    const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
    const approachX = opponentAnim.motion.x - dir * MELEE_RANGE;
    if (intent.variant === "jump") {
      issueCommand(anim.motion, "jump");
    } else if (intent.variant === "fly" || intent.variant === "hover") {
      issueCommand(anim.motion, intent.variant, approachX, anim.motion.y - 40);
    } else {
      issueCommand(anim.motion, "run", approachX);
    }
    anim.attackPhase = { variant: "punch", phase: "approach", t: 0 };
    anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result };
    return;
  }

  // melee (default)
  const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
  const approachX = opponentAnim.motion.x - dir * MELEE_RANGE;
  issueCommand(anim.motion, "dash", approachX);
  anim.attackPhase = { variant: intent.variant, phase: "approach", t: 0 };
  anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result };
}

export function applyHitReaction(anim, fromX) {
  anim.hitTimer = HIT_REACT_DURATION;
  anim.flashTimer = FLASH_DURATION;
  const dir = anim.motion.x >= fromX ? 1 : -1;
  anim.motion.vx = dir * KNOCKBACK_SPEED;
}

/**
 * Advances one fighter's animation by dt. Returns an "impact" event
 * ({targetKey, damage, result, spawnProjectileFrom}) at most once, exactly
 * when the strike phase begins — the caller (App.jsx) uses that to apply
 * the hit reaction to the defender and/or spawn a projectile.
 */
export function updateAnimation(anim, dt, bounds, homeReturnX, alive = true) {
  updateMotion(anim.motion, dt, bounds);

  if (anim.blockTimer > 0) anim.blockTimer = Math.max(0, anim.blockTimer - dt);
  if (anim.hitTimer > 0) anim.hitTimer = Math.max(0, anim.hitTimer - dt);
  if (anim.flashTimer > 0) anim.flashTimer = Math.max(0, anim.flashTimer - dt);

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
    attackPhase: anim.attackPhase?.phase === "approach" ? null : anim.attackPhase,
    blocking: anim.blockTimer > 0,
    mode: anim.motion.mode,
    grounded: anim.motion.grounded,
    vx: anim.motion.vx,
    vy: anim.motion.vy,
  });

  return { impact, state };
}
