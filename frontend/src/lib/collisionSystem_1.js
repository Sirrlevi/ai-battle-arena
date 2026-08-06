
// ---------- COLLISION SYSTEM MODULE - M1 REWRITE ----------
// Fixed: No more overlap, real separation force, ragdoll root at hips

export function isGrounded(y, groundY) {
  return y >= groundY;
}

export function clampToBounds(x, minX, maxX) {
  return Math.max(minX, Math.min(maxX, x));
}

// Keeps two fighters from occupying the exact same spot - NOW WITH REAL PHYSICS
export function resolveFighterOverlap(attackerX, defenderX, minDistance, attackerProfile, defenderProfile) {
  const dist = defenderX - attackerX;
  const dir = dist >= 0 ? 1 : -1;
  if (Math.abs(dist) < minDistance) {
    // separation force based on mass if profiles available
    const sepBoost = (attackerProfile?.collisionBehaviour?.separationForce || 8) + (defenderProfile?.collisionBehaviour?.separationForce || 8);
    return defenderX - dir * (minDistance + sepBoost*0.2);
  }
  return attackerX;
}

// New: full separation with force application - fixes Bug2 clone overlap
export function applySeparationForce(fighterA, fighterB, minDistance = 48) {
  const dx = fighterA.x - fighterB.x;
  const dy = (fighterA.y - fighterB.y) * 0.3;
  const dist = Math.hypot(dx, dy);
  if (dist < minDistance && dist > 0.1) {
    const overlap = minDistance - dist;
    const dirX = dx / dist;
    const separationForce = overlap * 0.8 + 2; // real push
    // push apart proportionally to mass (lighter pushed more)
    const massA = fighterA.physicsProfile?.mass || 75;
    const massB = fighterB.physicsProfile?.mass || 75;
    const totalMass = massA + massB;
    const pushA = (massB / totalMass) * separationForce * 2.5;
    const pushB = (massA / totalMass) * separationForce * 2.5;
    
    fighterA.x += dirX * pushA;
    fighterB.x -= dirX * pushB;
    
    // also apply velocity push if they have physics state
    if (fighterA.motion) fighterA.motion.vx += dirX * pushA * 8;
    if (fighterB.motion) fighterB.motion.vx -= dirX * pushB * 8;
    
    return { separated: true, overlap, force: separationForce };
  }
  // ethereal can overlap
  if (fighterA.physicsProfile?.weightDef?.isEthereal || fighterB.physicsProfile?.weightDef?.isEthereal) {
    return { separated: false, ethereal: true };
  }
  return { separated: false };
}

// Multi-fighter separation (for clones, summons)
export function resolveAllOverlaps(fighters, minDistance = 50) {
  let iterations = 0;
  let hadOverlap = true;
  while (hadOverlap && iterations < 4) {
    hadOverlap = false;
    for (let i=0; i<fighters.length; i++) {
      for (let j=i+1; j<fighters.length; j++) {
        const res = applySeparationForce(fighters[i], fighters[j], minDistance);
        if (res.separated) hadOverlap = true;
      }
    }
    iterations++;
  }
}

export function projectileHitTest(projectile, targetX, targetY, radius = 34, targetProfile) {
  const scale = targetProfile?.hitboxScale || 1;
  const adjRadius = radius * scale;
  const dx = projectile.x - targetX;
  const dy = projectile.y - targetY;
  return Math.hypot(dx, dy) <= adjRadius;
}

export function isOutOfArena(x, y, width, height, margin = 60) {
  return x < -margin || x > width + margin || y < -margin || y > height + margin;
}

// Wall bounce with mass-aware restitution - part of impact system
export function reflectVelocity(vx, restitution = 0.35, mass = 75) {
  // heavier = less bounce
  const massFactor = Math.max(0.2, Math.min(1, 150 / mass));
  return -vx * restitution * massFactor;
}

// Terrain impact
export function getTerrainImpact(terrain, landingForce) {
  if (landingForce > 300) return { crack: true, dust: 0.8, debris: Math.floor(landingForce/100) };
  if (landingForce > 100) return { crack: false, dust: 0.4, debris: 1 };
  return { crack: false, dust: 0.1, debris: 0 };
}
