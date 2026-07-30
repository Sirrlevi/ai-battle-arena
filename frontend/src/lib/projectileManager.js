// ---------- PROJECTILE MANAGER MODULE ----------
// Generic enough to carry any AI-invented ranged power: it only needs a
// visual `variant` string (used by the renderer to pick a shape/color) and
// start/target coordinates. Nothing here is specific to "laser" or
// "fireball" — those are just variant labels attached at spawn time by the
// action interpreter (or, since Phase 4B, the Combat Engine's own element
// classification when a verdict is available — see
// animationController.js's resolveProjectileVariant).
//
// Phase 4B (spec sections 4 + 5) additions, all opt-in via new fields on
// the spawn call so the original single-target travel-and-arrive behavior
// is completely unchanged for any caller that doesn't use them:
//   - a wider variant/speed catalog matching the Combat Engine's real
//     element vocabulary (see the SPEEDS table)
//   - a light homing bow on a few variants (spec: "Homing (optional)")
//   - wall-bounce on a missed shot, reusing collisionSystem's
//     reflectVelocity — the same primitive Phase 4D gave fighter knockback
//   - a defensive MAX_LIFETIME cap (spec: "Lifetime")
//   - spawnBeamClashPair: a two-stage spawn for the one scenario this
//     strictly turn-alternating battle loop can actually produce two
//     projectiles closing on each other — see its own doc comment below

import { clampToBounds, reflectVelocity } from "./collisionSystem.js";

const SPEEDS = {
  laser: 1100,
  arrow: 900,
  energy: 750,
  fireball: 620,
  ice_shard: 780,
  lightning_bolt: 1300,
  gravity_orb: 480,
  void_sphere: 520,
  black_hole: 380,
  orb: 560,
};

// A light, purely-cosmetic bow applied to a few variants so they don't all
// travel in perfectly straight lines (spec section 4, "Homing (optional)")
// — the target point itself never changes, only how the path gets there.
const HOMING_BOW = { orb: 22, void_sphere: 30, gravity_orb: 18, energy: 14 };

const MAX_LIFETIME = 2.2; // seconds — safety net (spec "Lifetime"), not a normal expiry path at these speeds/arena size
const TRAIL_INTERVAL = 0.07; // seconds between trail-particle cues per projectile (spec "Particle Trail") — throttled so 1-2 simultaneous shots can't flood the particle pool

let nextId = 1;

export function createProjectileManager() {
  return { items: [] };
}

function baseProjectile({ variant, fromX, fromY, toX, toY, speed }) {
  const dist = Math.hypot(toX - fromX, toY - fromY) || 1;
  return {
    id: nextId++,
    variant,
    x: fromX, y: fromY,
    fromX, fromY, toX, toY,
    speed,
    duration: Math.min(MAX_LIFETIME, dist / speed),
    elapsed: 0,
    bow: HOMING_BOW[variant] || 0,
    trailTimer: 0,
    alive: true,
  };
}

export function spawnProjectile(manager, { variant = "energy", fromX, fromY, toX, toY, ownerKey, targetKey, payload, bounds }) {
  const speed = SPEEDS[variant] || SPEEDS.energy;
  const p = baseProjectile({ variant, fromX, fromY, toX, toY, speed });
  Object.assign(p, { ownerKey, targetKey, payload, bounds, stage: "final" });
  manager.items.push(p);
  return p;
}

/**
 * Phase 4B, spec section 5. The only scenario in this turn-based, strictly
 * alternating battle loop (App.jsx's runLoop: `turn = 1 - turn` every
 * turn, with an API round-trip between them) where two ranged effects are
 * genuinely part of the same exchange: a beam/projectile-classified
 * attack met with a "counter" defense response, both resolved in the SAME
 * entry. Both payloads are real damage the Combat Engine already applied
 * — counterDamage is additive, not competing — so this doesn't invent or
 * adjudicate a winner; it stages that one entry's two real effects as a
 * beam meeting in the middle instead of two disconnected shots. Each
 * projectile in the pair travels to a shared clash point first (`stage:
 * "toClash"`), then — once BOTH have arrived there — continues on to its
 * own real final target (`stage: "final"`), exactly like a normal
 * spawnProjectile from that point on, including its own onArrive.
 */
export function spawnBeamClashPair(manager, {
  variantA, fromAX, fromAY, toAX, toAY, ownerAKey, targetAKey, payloadA,
  variantB, fromBX, fromBY, toBX, toBY, ownerBKey, targetBKey, payloadB,
  onClash,
}) {
  const clashX = (fromAX + fromBX) / 2;
  const clashY = (fromAY + fromBY) / 2;
  const pairId = `clash-${nextId}`;

  const a = baseProjectile({ variant: variantA, fromX: fromAX, fromY: fromAY, toX: clashX, toY: clashY, speed: SPEEDS[variantA] || SPEEDS.energy });
  const b = baseProjectile({ variant: variantB, fromX: fromBX, fromY: fromBY, toX: clashX, toY: clashY, speed: SPEEDS[variantB] || SPEEDS.energy });
  Object.assign(a, { ownerKey: ownerAKey, targetKey: targetAKey, payload: payloadA, stage: "toClash", pairId, finalX: toAX, finalY: toAY, partnerReached: false, clashFired: false });
  Object.assign(b, { ownerKey: ownerBKey, targetKey: targetBKey, payload: payloadB, stage: "toClash", pairId, finalX: toBX, finalY: toBY, partnerReached: false, clashFired: false });
  a.partner = b;
  b.partner = a;
  a.onClash = b.onClash = onClash;
  manager.items.push(a, b);
}

// Advances one projectile's x/y along its current (fromX,fromY)->(toX,toY)
// leg, applying its homing bow if it has one. Returns true once t reaches 1.
function advance(p, dt) {
  p.elapsed += dt;
  const t = p.duration > 0 ? Math.min(1, p.elapsed / p.duration) : 1;
  const straightX = p.fromX + (p.toX - p.fromX) * t;
  const straightY = p.fromY + (p.toY - p.fromY) * t;
  if (p.bow) {
    const dx = p.toX - p.fromX, dy = p.toY - p.fromY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // perpendicular to travel direction
    const bowAmount = Math.sin(t * Math.PI) * p.bow; // 0 at both ends, peak at midpoint
    p.x = straightX + nx * bowAmount;
    p.y = straightY + ny * bowAmount;
  } else {
    p.x = straightX;
    p.y = straightY;
  }
  return t >= 1;
}

/**
 * Advances every projectile by dt. Calls onArrive(projectile) exactly once
 * per projectile when it reaches its FINAL target, then removes it.
 * Calls onTrail(projectile) at a throttled interval while a projectile is
 * still travelling, for a caller to spawn trail particles — kept as a
 * callback (same pattern as onArrive) so this module never needs to import
 * particleSystem.js directly. Clash-pair projectiles pass through an extra
 * mid-flight "toClash" stage first (see spawnBeamClashPair) — invisible to
 * any caller that only ever uses spawnProjectile, which always starts at
 * "final".
 */
export function updateProjectiles(manager, dt, onArrive, onTrail) {
  for (const p of manager.items) {
    if (!p.alive) continue;

    p.trailTimer += dt;
    if (p.trailTimer >= TRAIL_INTERVAL) {
      p.trailTimer = 0;
      onTrail?.(p);
    }

    if (p.stage === "toClash") {
      const reachedClash = advance(p, dt);
      if (reachedClash) {
        p.partnerReached = true;
        if (!p.clashFired && p.partner?.partnerReached) {
          p.clashFired = p.partner.clashFired = true;
          p.onClash?.(p.x, p.y);
        }
        // Second leg: clash point -> the real final target.
        const dist = Math.hypot(p.finalX - p.x, p.finalY - p.y) || 1;
        p.fromX = p.x; p.fromY = p.y;
        p.toX = p.finalX; p.toY = p.finalY;
        p.duration = Math.min(MAX_LIFETIME, dist / p.speed);
        p.elapsed = 0;
        p.bow = 0; // the bow only applies to the approach, not the clash follow-through
        p.stage = "final";
      }
      continue;
    }

    const arrived = advance(p, dt);

    // Spec section 4 "Bounce": a shot that missed continues past its
    // original target and can rebound off the arena edge instead of just
    // vanishing — reuses the exact reflectVelocity primitive Phase 4D gave
    // fighter knockback. Never re-checks a hit/lethal result: a shot that
    // actually connected has nothing left to bounce.
    if (!arrived && p.bounds && p.payload?.result === "miss") {
      const clamped = clampToBounds(p.x, p.bounds.minX, p.bounds.maxX);
      if (clamped !== p.x) {
        const remainingDx = p.toX - p.x;
        p.x = clamped;
        p.fromX = p.x;
        p.fromY = p.y;
        p.toX = p.x + reflectVelocity(remainingDx);
        p.toY = p.y;
        p.elapsed = 0;
        const dist = Math.hypot(p.toX - p.fromX, p.toY - p.fromY) || 1;
        p.duration = Math.min(0.35, dist / p.speed);
        p.bow = 0;
      }
    }

    if (arrived) {
      p.alive = false;
      onArrive?.(p);
    }
  }
  manager.items = manager.items.filter((p) => p.alive);
}
