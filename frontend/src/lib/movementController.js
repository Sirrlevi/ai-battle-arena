// ---------- MOVEMENT CONTROLLER MODULE ----------
// Owns x/y/velocity/grounded/facing for one fighter and advances it by dt
// every frame. Knows nothing about combat, AI, or rendering — it just
// integrates a `command` (or free-falls under gravity if there isn't one)
// and reports whether that command has completed, so a higher-level
// controller (animationController) can chain the next step.

import { clampToBounds, isGrounded } from "./collisionSystem.js";

export const SPEEDS = {
  walk: 140,
  run: 260,
  dash: 640,
  fly: 220,
  hover: 90,
  // Phase 4 additions (spec section 2):
  roll: 420,
  slide: 520,
  backDash: 600,
  sideDash: 600,
};

const GRAVITY = 1400; // px/s^2
const JUMP_VY = -560; // px/s, negative = up
const DOUBLE_JUMP_VY = -480;
const WALL_JUMP_KICK = 380; // horizontal push imparted by a wall jump
const MAX_AIR_JUMPS = 1;
const ARRIVE_EPSILON = 4;
const GROUND_LIKE_TYPES = new Set(["walk", "run", "dash", "roll", "slide", "backDash", "sideDash"]);

export function createMotionState(x, y, groundY) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    mode: "idle", // idle | walk | run | dash | jump | fly | hover | roll | slide | crouch
    groundY,
    command: null, // { type, targetX, targetY?, duration? } or null
    commandElapsed: 0,
    crouching: false, // Phase 4: a state toggle, not a positional command
    airJumpsUsed: 0, // Phase 4: double jump tracking
  };
}

/**
 * Starts a new movement command. `type` is one of walk/run/dash/jump/hover/
 * fly/roll/slide/backDash/sideDash/wallJump. For jump/wallJump, targetX is
 * optional (in-place hop); for the rest, targetX is where the fighter is
 * trying to get to.
 */
export function issueCommand(motion, type, targetX, targetY) {
  motion.command = { type, targetX: targetX ?? motion.x, targetY };
  motion.commandElapsed = 0;

  if (type === "jump") {
    if (motion.grounded) {
      motion.vy = JUMP_VY;
      motion.grounded = false;
      motion.airJumpsUsed = 0;
    } else if (motion.airJumpsUsed < MAX_AIR_JUMPS) {
      // Double jump (spec section 2): a second upward impulse mid-air.
      motion.vy = DOUBLE_JUMP_VY;
      motion.airJumpsUsed += 1;
    }
  } else if (type === "wallJump" && !motion.grounded) {
    motion.vy = JUMP_VY * 0.9;
    motion.vx = -motion.facing * WALL_JUMP_KICK;
    motion.facing = -motion.facing;
    motion.airJumpsUsed = 0;
  }
}

export function setCrouch(motion, crouching) {
  motion.crouching = !!crouching && motion.grounded && !motion.command;
}

export function clearCommand(motion) {
  motion.command = null;
  motion.commandElapsed = 0;
}

/**
 * Advances the motion by dt seconds. Returns true once the active command
 * has finished (arrived / landed / duration elapsed) so the caller can
 * chain to the next step of a sequence (e.g. dash-in -> attack -> dash-out).
 */
export function updateMotion(motion, dt, bounds) {
  motion.commandElapsed += dt;
  const cmd = motion.command;
  let done = false;

  if (cmd && (cmd.type === "jump" || cmd.type === "wallJump")) {
    motion.mode = "jump";
    motion.crouching = false;
  } else if (cmd && GROUND_LIKE_TYPES.has(cmd.type)) {
    const speed = SPEEDS[cmd.type];
    const dx = cmd.targetX - motion.x;
    const dir = dx >= 0 ? 1 : -1;
    motion.facing = dir;
    const step = speed * dt;
    if (Math.abs(dx) <= step || Math.abs(dx) <= ARRIVE_EPSILON) {
      motion.x = cmd.targetX;
      motion.vx = 0;
      done = true;
    } else {
      motion.x += dir * step;
      motion.vx = dir * speed;
    }
    motion.mode = cmd.type;
    motion.crouching = false;
  } else if (cmd && (cmd.type === "fly" || cmd.type === "hover")) {
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
  } else if (!motion.crouching) {
    // No active command: decelerate horizontally, apply gravity if airborne.
    motion.vx *= Math.max(0, 1 - dt * 10);
    if (Math.abs(motion.vx) < 2) motion.vx = 0;
    motion.x += motion.vx * dt;
    motion.mode = motion.grounded ? "idle" : motion.mode;
  } else {
    motion.mode = "crouch";
    motion.vx = 0;
  }

  // Gravity always applies unless actively flying/hovering this frame.
  if (!(cmd && (cmd.type === "fly" || cmd.type === "hover"))) {
    if (!motion.grounded || (cmd && (cmd.type === "jump" || cmd.type === "wallJump"))) {
      motion.vy += GRAVITY * dt;
      motion.y += motion.vy * dt;
      if (isGrounded(motion.y, motion.groundY)) {
        motion.y = motion.groundY;
        motion.vy = 0;
        motion.grounded = true;
        motion.airJumpsUsed = 0;
        if (cmd && (cmd.type === "jump" || cmd.type === "wallJump")) done = true;
      } else {
        motion.grounded = false;
      }
    }
  }

  if (bounds) {
    motion.x = clampToBounds(motion.x, bounds.minX, bounds.maxX);
  }

  if (done) {
    clearCommand(motion);
  }
  return done;
}
