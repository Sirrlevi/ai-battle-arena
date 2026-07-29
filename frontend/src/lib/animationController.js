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
const TRANSFORM_PAUSE_DURATION = 0.9; // spec section 7: "pause combat briefly"

export function createAnimState(x, y, groundY) {
  return {
    motion: createMotionState(x, y, groundY),
    attackPhase: null, // { variant, phase: 'windup'|'strike'|'recovery', t }
    pendingImpact: null, // { targetKey, damage, result } fired at the start of 'strike'
    blockTimer: 0,
    hitTimer: 0,
    flashTimer: 0,
    transformTimer: 0, // Phase 3.95: >0 while a transformation animation is playing
    statusVisuals: [], // Phase 3.95: active status-effect visuals (see statusVisuals.js), refreshed each turn
    lastHitDamage: 0, // Phase 4A: cosmetic only — read by characterAnimation.js to scale hit-reaction pose (light flinch vs heavy stagger). Never read by any damage/combat logic.
    comboCount: 0, // Phase 4D, spec section 13: consecutive-turn hit streak for THIS fighter's own actions, cosmetic only (badge + minor pose flourish) — never read by any damage/combat logic.
    homeX: x,
  };
}

/** Phase 3.95 section 7: called when an Animation Event Bus "Transformation" event fires — briefly freezes the fighter's pose (the state machine's "transforming" rule takes over) before combat resumes. */
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

export function applyHitReaction(anim, fromX, damage = 0) {
  anim.hitTimer = HIT_REACT_DURATION;
  anim.flashTimer = FLASH_DURATION;
  anim.lastHitDamage = damage; // Phase 4A: see field comment in createAnimState above
  const dir = anim.motion.x >= fromX ? 1 : -1;
  anim.motion.vx = dir * KNOCKBACK_SPEED;
}

/**
 * Phase 4D, spec section 13 ("combo system"). The spec's own example
 * ("Punch -> Kick -> Uppercut -> ... -> Ground Slam") describes chaining
 * within a single uninterrupted sequence — but this battle loop strictly
 * alternates the two fighters' turns (App.jsx's runLoop: `turn = 1 - turn`
 * every turn, with an API round-trip + ~900ms sleep between them), so by
 * the time a fighter gets to act again their own previous attackPhase has
 * already fully finished. There's no "mid-swing" moment to chain into.
 * What's real and trackable instead: a cross-turn hit streak — the same
 * fighter landing on consecutive turns of their own, opponent's replies in
 * between notwithstanding. That's what this tracks and what Stickman's
 * combo badge / the Debug Panel's combo readout both show. Purely
 * cosmetic — call this AFTER combat has already been resolved, never
 * before, and never let it feed back into damage/hit-chance.
 */
export function registerTurnOutcome(anim, landedHit) {
  anim.comboCount = landedHit ? (anim.comboCount || 0) + 1 : 0;
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
  if (anim.transformTimer > 0) anim.transformTimer = Math.max(0, anim.transformTimer - dt);

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
