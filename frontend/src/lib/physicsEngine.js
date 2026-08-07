
// ---------- PHYSICS ENGINE - M1 REWRITE ----------
// Believable: momentum, inertia, friction, gravity scaling, air resistance, landing force, weight transfer
// No skating, no teleporting movement (except explicit teleport abilities)

import { WEIGHT_CLASSES } from "./physicsProfile.js";

const BASE_GRAVITY = 1400; // px/s^2

export function createPhysicsState(x, y, physicsProfile, groundY) {
  return {
    x, y,
    vx: 0, vy: 0,
    ax: 0, ay: 0,
    mass: physicsProfile.mass,
    density: physicsProfile.density,
    groundY,
    grounded: true,
    momentum: { x:0, y:0 },
    weightTransfer: 0, // -1 to 1 lean
    landingForce: 0,
    airTime: 0,
    lastGroundX: x,
    friction: physicsProfile.collisionBehaviour.groundFriction,
  };
}

function computeFriction(state, profile, dt) {
  if (!state.grounded) {
    // air resistance: drag proportional to v^2
    const dragCoeff = profile.flightPhysics.drag;
    const speed = Math.hypot(state.vx, state.vy);
    if (speed > 0) {
      const dragForce = dragCoeff * speed * speed * dt;
      const dragX = - (state.vx / speed) * dragForce;
      const dragY = - (state.vy / speed) * dragForce;
      return { x: dragX, y: dragY };
    }
    return { x:0, y:0 };
  }
  // ground friction
  const grip = profile.groundGrip;
  const frictionForce = grip * BASE_GRAVITY * profile.mass * 0.001 * dt;
  const sign = Math.sign(state.vx);
  const frictionX = -sign * Math.min(Math.abs(state.vx), frictionForce * 60);
  return { x: frictionX, y: 0 };
}

export function applyForce(state, fx, fy) {
  // F=ma -> a=F/m
  state.ax += fx / state.mass;
  state.ay += fy / state.mass;
}

export function updatePhysics(state, profile, dt, bounds) {
  const gravityScale = profile.weightDef.isEthereal ? 0.15 : profile.weightDef.isEnergy ? 0.6 : 0.8 + (profile.mass/10000);
  const gravity = BASE_GRAVITY * gravityScale;
  
  if (!state.grounded) {
    state.ay += gravity;
    state.airTime += dt;
  } else {
    state.airTime = 0;
  }

  // integrate acceleration -> velocity
  state.vx += state.ax * dt;
  state.vy += state.ay * dt;

  // friction / air resistance
  const friction = computeFriction(state, profile, dt);
  state.vx += friction.x;
  state.vy += friction.y * 0.3; // less vertical friction

  // inertia / damping based on mass
  const inertiaDamping = Math.max(0.92, Math.min(0.995, 1 - profile.mass/80000));
  // don't damp if grounded and trying to move intentionally (handled by movement controller)
  // this is for natural decay

  // clamp max velocity by weight class
  const maxV = profile.weightDef.isEthereal ? 520 : profile.weightDef.isEnergy ? 680 : 420 + (profile.mobility*200) - (profile.mass/100);
  const speed = Math.hypot(state.vx, state.vy);
  if (speed > maxV) {
    const ratio = maxV / speed;
    state.vx *= ratio;
    state.vy *= ratio;
  }

  // update position
  const prevX = state.x;
  const prevY = state.y;
  state.x += state.vx * dt;
  state.y += state.vy * dt;

  // weight transfer based on acceleration
  state.weightTransfer = Math.max(-1, Math.min(1, state.vx * 0.003));

  // ground collision with landing force
  if (state.y >= state.groundY) {
    const impactVelocity = state.vy;
    if (impactVelocity > 80) {
      state.landingForce = impactVelocity * profile.mass * 0.0008;
    } else {
      state.landingForce = 0;
    }
    state.y = state.groundY;
    if (state.vy > 0) state.vy = 0;
    if (!state.grounded) {
      // just landed
      state.grounded = true;
      // bounce based on restitution
      const restitution = profile.collisionBehaviour.wallBounceRestitution * 0.3;
      if (impactVelocity > 400) {
        state.vy = -impactVelocity * restitution * 0.2;
        state.grounded = false;
      }
    }
    state.ay = 0;
  } else {
    if (state.grounded) state.grounded = false;
  }

  // wall bounds with bounce
  if (bounds) {
    if (state.x < bounds.minX) {
      state.x = bounds.minX;
      state.vx = Math.abs(state.vx) * profile.collisionBehaviour.wallBounceRestitution;
    } else if (state.x > bounds.maxX) {
      state.x = bounds.maxX;
      state.vx = -Math.abs(state.vx) * profile.collisionBehaviour.wallBounceRestitution;
    }
  }

  // momentum
  state.momentum.x = state.vx * state.mass * 0.01;
  state.momentum.y = state.vy * state.mass * 0.01;

  // reset accel for next frame
  state.ax = 0;
  state.ay = 0;

  const moved = Math.hypot(state.x - prevX, state.y - prevY);
  return { moved, landed: state.grounded && state.landingForce>0, landingForce: state.landingForce };
}

export function computeLandingForce(velocityY, mass) {
  return Math.max(0, velocityY * mass * 0.0008);
}

// Weight transfer for animation: leaning into movement
export function getWeightTransfer(state) {
  return state.weightTransfer;
}
