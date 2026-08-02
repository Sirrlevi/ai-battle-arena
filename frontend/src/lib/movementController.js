// ---------- MOVEMENT CONTROLLER MODULE ----------
// Owns x/y/velocity/grounded/facing for one fighter and advances it by dt
// every frame. Knows nothing about combat, AI, or rendering — it just
// integrates a `command` (or free-falls under gravity if there isn't one)
// and reports whether that command has completed, so a higher-level
// controller (animationController) can chain the next step.
//
// Phase 4D (spec section 8): horizontal motion is now genuinely
// acceleration-based (real momentum/air-control/friction) instead of an
// instant velocity snap, and arena-bound contact now reflects velocity
// (wall bounce) instead of just clamping position. The *arrival contract*
// every caller already depends on — a walk/run/dash command reliably
// reaches targetX and reports `done` — is unchanged: acceleration only
// changes how fast vx ramps up on the way there, never whether/when the
// command finishes, so animationController.js's approach -> windup
// handoff (which waits on `!anim.motion.command`) still fires exactly
// when it always did.

import { clampToBounds, isGrounded, reflectVelocity } from "./collisionSystem.js";

export const SPEEDS = {
  walk: 140,
  run: 260,
  dash: 640,
  fly: 220,
  hover: 90,
};

const GRAVITY = 1400; // px/s^2
const JUMP_VY = -560; // px/s, negative = up
const ARRIVE_EPSILON = 4;

// Teleport: a real cut, not a slide. Fighter fades out at the origin,
// position snaps instantly at the vanish/arrive boundary (while fully
// invisible, for exactly one frame), then fades back in at the
// destination — see the "teleport" branch in updateMotion below.
const TELEPORT_VANISH_DURATION = 0.16; // seconds fading 1 -> 0 at the origin
const TELEPORT_ARRIVE_DURATION = 0.14; // seconds fading 0 -> 1 at the destination

// Phase 4D physics constants (spec section 8).
const ACCEL_GROUND = 2000; // px/s^2 — how fast grounded horizontal speed ramps toward the target
const ACCEL_AIR = 900; // px/s^2 — reduced control while airborne ("Air Control")
const FRICTION_GROUND = 1400; // px/s^2 deceleration with no active command
const FRICTION_AIR = 420; // much less air resistance than ground friction
const STEP_STRIDE = 46; // px of ground travel between footstep cues (audio pipeline, section 17) — a separate, simpler accumulator from characterAnimation.js's visual gait phase on purpose: one drives a discrete cue trigger, the other a continuous pose, and coupling them isn't worth the added dependency for a cue layer with no audio assets behind it yet

export function createMotionState(x, y, groundY) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    mode: "idle", // idle | walk | run | dash | jump | fly | hover | teleport_out | teleport_in
    groundY,
    command: null, // { type, targetX, targetY?, duration? } or null
    commandElapsed: 0,
    stepDist: 0, // Phase 4D: accumulated ground travel since the last footstep cue
    justLanded: false, // Phase 4D: true for exactly the frame grounded flips false -> true
    justStepped: false, // Phase 4D: true for exactly the frame a footstep cue should fire
    justHitWall: false, // Phase 4D: true for exactly the frame an arena-bound bounce occurred
    teleportAlpha: 1, // 1 = fully visible, 0 = fully invisible; only ever <1 during a "teleport" command
    teleportVariant: null, // cosmetic flavor ("lightning" | "fire" | "ice" | "wind" | "shadow" | "arcane"), set by whoever issues the teleport command
    justVanished: false, // true for exactly the frame the fighter disappears at the origin (position already snapped to the destination this same frame)
    justArrived: false, // true for exactly the frame the reappear fade begins at the destination
    justTookOff: false, // true for exactly the frame a fly/hover command lifts off from standing on the ground
    speedTrail: false, // true while a speedster-tagged power's dash is active — Stickman.jsx draws a ghost-image trail while this is set
  };
}

/**
 * Starts a new movement command. `type` is one of walk/run/dash/jump/hover/fly.
 * For jump, targetX is optional (in-place hop); for the rest, targetX is
 * where the fighter is trying to get to.
 */
export function issueCommand(motion, type, targetX, targetY, speedOverride) {
  motion.command = { type, targetX: targetX ?? motion.x, targetY, speedOverride };
  if (type === "teleport") {
    // The vanish-phase VFX needs to play at where the fighter WAS, but by
    // the time it fires, motion.x has already snapped to the destination
    // (see the teleport branch below) — so the origin is captured here,
    // up front, and read back off the command object.
    motion.command.originX = motion.x;
    motion.command.originY = motion.y;
  }
  motion.commandElapsed = 0;
  if (type === "jump" && motion.grounded) {
    motion.vy = JUMP_VY;
    motion.grounded = false;
  }
}

export function clearCommand(motion) {
  motion.command = null;
  motion.commandElapsed = 0;
}

// Eases vx toward desiredVx at `accel` px/s^2 — the shared "momentum" ramp
// used by every horizontal-motion branch below.
function approachVx(motion, desiredVx, accel, dt) {
  const delta = desiredVx - motion.vx;
  const maxStep = accel * dt;
  if (Math.abs(delta) <= maxStep) motion.vx = desiredVx;
  else motion.vx += Math.sign(delta) * maxStep;
}

/**
 * Advances the motion by dt seconds. Returns true once the active command
 * has finished (arrived / landed / duration elapsed) so the caller can
 * chain to the next step of a sequence (e.g. dash-in -> attack -> dash-out).
 */
export function updateMotion(motion, dt, bounds) {
  motion.commandElapsed += dt;
  const cmd = motion.command;
  const wasGrounded = motion.grounded;
  motion.justLanded = false;
  motion.justStepped = false;
  motion.justHitWall = false;
  motion.justVanished = false;
  motion.justArrived = false;
  motion.justTookOff = false;
  let done = false;

  if (cmd && cmd.type === "jump") {
    motion.mode = "jump";
    // Phase 4D: jump's targetX was always accepted (see issueCommand) but
    // silently unused — a jump with no explicit targetX defaults to the
    // takeoff position (motion.x), so this is a pure capability add, not a
    // behavior change, for every current caller (none pass one today).
    const dx = cmd.targetX - motion.x;
    if (Math.abs(dx) > ARRIVE_EPSILON) {
      const dir = dx >= 0 ? 1 : -1;
      motion.facing = dir;
      approachVx(motion, dir * SPEEDS.run, ACCEL_AIR, dt);
    } else {
      motion.vx -= motion.vx * Math.min(1, dt * 6); // gentle air drag once near the target
    }
    motion.x += motion.vx * dt;
  } else if (cmd && (cmd.type === "walk" || cmd.type === "run" || cmd.type === "dash")) {
    const speed = cmd.speedOverride || SPEEDS[cmd.type];
    const dx = cmd.targetX - motion.x;
    const dir = dx >= 0 ? 1 : -1;
    motion.facing = dir;
    const accel = motion.grounded ? ACCEL_GROUND : ACCEL_AIR;
    approachVx(motion, dir * speed, accel, dt);
    const step = motion.vx * dt;
    if (Math.abs(dx) <= Math.abs(step) || Math.abs(dx) <= ARRIVE_EPSILON) {
      motion.x = cmd.targetX;
      motion.vx = 0;
      done = true;
    } else {
      motion.x += step;
    }
    motion.mode = cmd.type;
  } else if (cmd && (cmd.type === "fly" || cmd.type === "hover")) {
    if (motion.grounded) motion.justTookOff = true; // fires once — the frame this command lifts off from standing
    const speed = SPEEDS[cmd.type];
    const dx = cmd.targetX - motion.x;
    const dy = (cmd.targetY ?? motion.y) - motion.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = speed * dt;
    if (dist <= step) {
      motion.x = cmd.targetX;
      motion.y = cmd.targetY ?? motion.y;
      motion.vx = 0;
      motion.vy = 0;
      done = true;
    } else {
      motion.x += (dx / dist) * step;
      motion.y += (dy / dist) * step;
      motion.vx = (dx / dist) * speed;
      motion.vy = (dy / dist) * speed;
    }
    motion.grounded = false;
    motion.mode = cmd.type;
  } else if (cmd && cmd.type === "teleport") {
    // A true cut, not a slide: no interpolated travel between origin and
    // destination at all. Fade out in place, snap position the instant
    // full invisibility is reached, fade back in at the destination.
    const elapsed = motion.commandElapsed;
    const prevElapsed = elapsed - dt;
    const total = TELEPORT_VANISH_DURATION + TELEPORT_ARRIVE_DURATION;
    motion.vx = 0;
    motion.vy = 0;

    if (elapsed < TELEPORT_VANISH_DURATION) {
      motion.mode = "teleport_out";
      motion.teleportAlpha = Math.max(0, 1 - elapsed / TELEPORT_VANISH_DURATION);
    } else {
      motion.mode = "teleport_in";
      if (prevElapsed < TELEPORT_VANISH_DURATION) {
        // The instant cut: position snaps while alpha is at its lowest.
        motion.x = cmd.targetX;
        motion.y = cmd.targetY ?? motion.y;
        motion.justVanished = true;
        motion.justArrived = true;
      }
      const arriveElapsed = elapsed - TELEPORT_VANISH_DURATION;
      motion.teleportAlpha = Math.min(1, arriveElapsed / TELEPORT_ARRIVE_DURATION);
    }

    if (elapsed >= total) {
      motion.teleportAlpha = 1;
      done = true;
    }
  } else {
    // No active command: real friction (constant deceleration, not the old
    // ad-hoc exponential damping) brings horizontal motion to rest —
    // faster on the ground than in the air, per spec section 8.
    const friction = motion.grounded ? FRICTION_GROUND : FRICTION_AIR;
    if (motion.vx > 0) motion.vx = Math.max(0, motion.vx - friction * dt);
    else if (motion.vx < 0) motion.vx = Math.min(0, motion.vx + friction * dt);
    motion.x += motion.vx * dt;
    motion.mode = motion.grounded ? "idle" : motion.mode;
  }

  // Gravity always applies unless actively flying/hovering/teleporting this frame.
  if (!(cmd && (cmd.type === "fly" || cmd.type === "hover" || cmd.type === "teleport"))) {
    if (!motion.grounded || (cmd && cmd.type === "jump")) {
      motion.vy += GRAVITY * dt;
      motion.y += motion.vy * dt;
      if (isGrounded(motion.y, motion.groundY)) {
        motion.y = motion.groundY;
        motion.vy = 0;
        motion.grounded = true;
        if (cmd && cmd.type === "jump") done = true;
      } else {
        motion.grounded = false;
      }
    }
  }
  if (!wasGrounded && motion.grounded) motion.justLanded = true;

  if (bounds) {
    const clamped = clampToBounds(motion.x, bounds.minX, bounds.maxX);
    if (clamped !== motion.x) {
      motion.x = clamped;
      motion.vx = reflectVelocity(motion.vx);
      motion.justHitWall = true;
    }
  }

  // Phase 4D, spec section 17: footstep cue timing — accumulate real
  // ground travel and flag a cue every STEP_STRIDE px, purely an event
  // trigger (no audio asset exists yet, see lib/animationEventBus.js).
  if (motion.grounded && Math.abs(motion.vx) > 20) {
    motion.stepDist += Math.abs(motion.vx) * dt;
    if (motion.stepDist >= STEP_STRIDE) {
      motion.stepDist -= STEP_STRIDE;
      motion.justStepped = true;
    }
  } else {
    motion.stepDist = 0;
  }

  if (done) {
    clearCommand(motion);
  }
  return done;
}
