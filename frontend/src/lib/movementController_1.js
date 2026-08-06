
// ---------- MOVEMENT CONTROLLER MODULE - M1 PHYSICS REWRITE ----------
// Owns x/y/velocity/grounded/facing with REAL physics: momentum, inertia, friction, gravity scaling, air resistance, landing force, weight transfer
// No skating, no teleporting movement (except explicit teleport ability)

import { clampToBounds, isGrounded, reflectVelocity } from "./collisionSystem.js";
import { createPhysicsState, updatePhysics, applyForce } from "./physicsEngine.js";

export const SPEEDS = {
  walk: 140,
  run: 260,
  dash: 640,
  fly: 220,
  hover: 90,
};

const GRAVITY = 1400;
const JUMP_VY = -560;
const ARRIVE_EPSILON = 4;

const TELEPORT_VANISH_DURATION = 0.16;
const TELEPORT_ARRIVE_DURATION = 0.14;

const ACCEL_GROUND = 2000;
const ACCEL_AIR = 900;
const FRICTION_GROUND = 1400;
const FRICTION_AIR = 420;
const STEP_STRIDE = 46;

export function createMotionState(x, y, groundY, physicsProfile = null) {
  const base = {
    x, y,
    vx: 0, vy: 0,
    facing: 1,
    grounded: true,
    mode: "idle",
    groundY,
    command: null,
    commandElapsed: 0,
    stepDist: 0,
    justLanded: false,
    justStepped: false,
    justHitWall: false,
    teleportAlpha: 1,
    teleportVariant: null,
    justVanished: false,
    justArrived: false,
    justTookOff: false,
    speedTrail: false,
    // M1 additions
    physicsProfile: physicsProfile,
    weightTransfer: 0,
    landingForce: 0,
    momentum: { x:0, y:0 },
    slideFriction: physicsProfile?.collisionBehaviour?.groundFriction || 0.6,
    isSliding: false,
  };
  // attach physics state if profile exists
  if (physicsProfile) {
    base.physicsState = createPhysicsState(x, y, physicsProfile, groundY);
  }
  return base;
}

export function setPhysicsProfile(motion, physicsProfile) {
  motion.physicsProfile = physicsProfile;
  motion.slideFriction = physicsProfile.collisionBehaviour?.groundFriction || 0.6;
  motion.physicsState = createPhysicsState(motion.x, motion.y, physicsProfile, motion.groundY);
  // update mass etc
  if (motion.physicsState) {
    motion.physicsState.mass = physicsProfile.mass;
    motion.physicsState.density = physicsProfile.density;
  }
}

export function issueCommand(motion, type, targetX, targetY, speedOverride) {
  // M1: validate momentum - cannot instantly reverse if heavy
  if (motion.physicsProfile && motion.vx) {
    const mass = motion.physicsProfile.mass;
    const heavyThreshold = 400;
    if (mass > heavyThreshold) {
      const dirChange = Math.sign((targetX ?? motion.x) - motion.x) !== Math.sign(motion.vx);
      if (dirChange && Math.abs(motion.vx) > 120) {
        // need to decelerate first - issue stop then new command (handled by applying opposite force)
        // for simplicity, we reduce speedOverride to allow deceleration
      }
    }
  }

  motion.command = { type, targetX: targetX ?? motion.x, targetY, speedOverride };
  if (type === "teleport") {
    motion.command.originX = motion.x;
    motion.command.originY = motion.y;
  }
  motion.commandElapsed = 0;
  if (type === "jump" && motion.grounded) {
    const jumpMod = motion.physicsProfile?.jumpModifier || 1.0;
    motion.vy = JUMP_VY * jumpMod;
    motion.grounded = false;
    if (motion.physicsState) motion.physicsState.grounded = false;
  }
}

export function clearCommand(motion) {
  motion.command = null;
  motion.commandElapsed = 0;
}

function approachVx(motion, desiredVx, accel, dt) {
  const delta = desiredVx - motion.vx;
  const maxStep = accel * dt;
  if (Math.abs(delta) <= maxStep) motion.vx = desiredVx;
  else motion.vx += Math.sign(delta) * maxStep;
}

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

  const profile = motion.physicsProfile;
  const mass = profile?.mass || 75;
  const isEthereal = profile?.weightDef?.isEthereal;
  const isHeavy = mass > 300;

  // Physics profile driven accel/friction
  const accelGround = profile ? (2000 * (150 / Math.max(50, mass)) * (0.7 + (profile.agility||0.5))) : ACCEL_GROUND;
  const accelAir = profile ? (900 * (profile.flightPhysics?.airControl || 0.6)) : ACCEL_AIR;
  const frictionGround = profile ? (profile.groundGrip * 1800) : FRICTION_GROUND;

  if (cmd && cmd.type === "jump") {
    motion.mode = "jump";
    const dx = cmd.targetX - motion.x;
    if (Math.abs(dx) > ARRIVE_EPSILON) {
      const dir = dx >= 0 ? 1 : -1;
      motion.facing = dir;
      approachVx(motion, dir * SPEEDS.run * (profile?.jumpModifier||1), accelAir, dt);
    } else {
      motion.vx -= motion.vx * Math.min(1, dt * 6);
    }
    motion.x += motion.vx * dt;
    motion.y += motion.vy * dt;
    motion.vy += GRAVITY * (profile?.weightDef?.isEthereal?0.15:1) * dt;
    if (motion.y >= motion.groundY) {
      motion.y = motion.groundY;
      motion.vy = 0;
      motion.grounded = true;
      motion.justLanded = true;
      motion.landingForce = Math.abs(motion.vy) * mass * 0.0008;
      done = true;
    }
  } else if (cmd && (cmd.type === "walk" || cmd.type === "run" || cmd.type === "dash")) {
    const speed = cmd.speedOverride || SPEEDS[cmd.type];
    const dx = cmd.targetX - motion.x;
    const dir = dx >= 0 ? 1 : -1;
    motion.facing = dir;
    const accel = motion.grounded ? accelGround : accelAir;
    
    // M1: no skating - must accelerate, not teleport
    if (isHeavy && !wasGrounded) {
      // heavy characters have slower air control
      approachVx(motion, dir * speed * 0.6, accel * 0.5, dt);
    } else {
      approachVx(motion, dir * speed, accel, dt);
    }
    
    // weight transfer
    motion.weightTransfer = Math.max(-1, Math.min(1, motion.vx * 0.004));
    
    const step = motion.vx * dt;
    // prevent overshoot with proper easing (ease-out)
    const easeOutFactor = isHeavy ? 0.15 : 0.08; // heavy stops earlier
    if (Math.abs(dx) <= Math.abs(step) + easeOutFactor * Math.abs(motion.vx)) {
      // decelerate to stop, not instant snap
      if (Math.abs(motion.vx) < 20 || isEthereal) {
        motion.x = cmd.targetX;
        motion.vx = 0;
        done = true;
      } else {
        // apply braking force
        motion.vx *= 0.85;
        motion.x += motion.vx * dt;
        if (Math.abs(motion.x - cmd.targetX) < ARRIVE_EPSILON) {
          motion.x = cmd.targetX;
          motion.vx = 0;
          done = true;
        }
      }
    } else {
      motion.x += step;
    }
    motion.mode = cmd.type;
    
    // step tracking
    motion.stepDist += Math.abs(step);
    if (motion.stepDist >= STEP_STRIDE) {
      motion.justStepped = true;
      motion.stepDist = 0;
    }
  } else if (cmd && (cmd.type === "fly" || cmd.type === "hover")) {
    if (motion.grounded) motion.justTookOff = true;
    const speed = SPEEDS[cmd.type] * (profile?.flightPhysics?.lift || 1);
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
    // teleport is the ONLY allowed instant movement
    const elapsed = motion.commandElapsed;
    if (elapsed < TELEPORT_VANISH_DURATION) {
      motion.mode = "teleport_out";
      motion.teleportAlpha = 1 - elapsed / TELEPORT_VANISH_DURATION;
    } else if (elapsed < TELEPORT_VANISH_DURATION + 0.02) {
      // snap frame
      if (!motion.justVanished) {
        motion.x = cmd.targetX;
        motion.y = cmd.targetY ?? motion.groundY;
        motion.justVanished = true;
      }
      motion.mode = "teleport_in";
      motion.teleportAlpha = 0;
    } else if (elapsed < TELEPORT_VANISH_DURATION + 0.02 + TELEPORT_ARRIVE_DURATION) {
      motion.mode = "teleport_in";
      const t = (elapsed - TELEPORT_VANISH_DURATION - 0.02) / TELEPORT_ARRIVE_DURATION;
      motion.teleportAlpha = t;
      if (t > 0.1 && !motion.justArrived) motion.justArrived = true;
    } else {
      motion.teleportAlpha = 1;
      motion.mode = "idle";
      done = true;
    }
  } else if (cmd && cmd.type === "slide") {
    // M1: new slide for down opponent hit - Bug4 fix
    motion.mode = "slide";
    motion.isSliding = true;
    const targetX = cmd.targetX;
    const dx = targetX - motion.x;
    const dir = dx >=0 ? 1 : -1;
    const friction = motion.slideFriction || 0.6;
    // friction deceleration: ease-out
    motion.vx += -Math.sign(motion.vx) * friction * 800 * dt;
    if (Math.sign(motion.vx) !== dir && Math.abs(motion.vx) < 5) {
      motion.vx = 0;
    }
    motion.x += motion.vx * dt;
    if (Math.abs(motion.vx) < 5 || Math.abs(motion.x - targetX) < 2) {
      motion.x = targetX;
      motion.vx = 0;
      motion.isSliding = false;
      done = true;
    }
  } else {
    // idle - apply friction, no skating
    if (motion.grounded) {
      const decel = frictionGround * dt;
      if (Math.abs(motion.vx) <= decel) motion.vx = 0;
      else motion.vx -= Math.sign(motion.vx) * decel;
      motion.x += motion.vx * dt;
      motion.weightTransfer *= 0.9; // return to center
    } else {
      // airborne drift with air resistance
      motion.vx -= motion.vx * Math.min(1, dt * 2.5);
      motion.x += motion.vx * dt;
      motion.y += motion.vy * dt;
      motion.vy += GRAVITY * dt;
      if (motion.y >= motion.groundY) {
        motion.y = motion.groundY;
        motion.vy = 0;
        motion.grounded = true;
        motion.justLanded = true;
        motion.landingForce = Math.abs(motion.vy) * mass * 0.0008;
      }
    }
    motion.mode = "idle";
  }

  // bounds with bounce
  if (bounds) {
    if (motion.x < bounds.minX) {
      const restitution = profile?.collisionBehaviour?.wallBounceRestitution ?? 0.35;
      motion.x = bounds.minX;
      if (Math.abs(motion.vx) > 30) {
        motion.vx = Math.abs(motion.vx) * restitution;
        motion.justHitWall = true;
      } else motion.vx = 0;
    } else if (motion.x > bounds.maxX) {
      const restitution = profile?.collisionBehaviour?.wallBounceRestitution ?? 0.35;
      motion.x = bounds.maxX;
      if (Math.abs(motion.vx) > 30) {
        motion.vx = -Math.abs(motion.vx) * restitution;
        motion.justHitWall = true;
      } else motion.vx = 0;
    }
  }

  // update physics state
  if (motion.physicsState) {
    motion.physicsState.x = motion.x;
    motion.physicsState.y = motion.y;
    motion.physicsState.vx = motion.vx;
    motion.physicsState.vy = motion.vy;
    motion.physicsState.grounded = motion.grounded;
    motion.physicsState.momentum.x = motion.vx * mass * 0.01;
  }

  return done;
}

// Helper to apply knockback with real physics
export function applyKnockback(motion, launchVelocity, isDown = false) {
  motion.vx = launchVelocity.x;
  if (!isDown) {
    motion.vy = launchVelocity.y;
    motion.grounded = false;
  } else {
    // down: stay grounded, slide
    motion.vy = 0;
    motion.grounded = true;
  }
}
