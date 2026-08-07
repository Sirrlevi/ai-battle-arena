
// ---------- COLLISION SYSTEM MODULE - M1 PATCHED (backward compatible) ----------
export function isGrounded(y, groundY) { return y >= groundY; }
export function clampToBounds(x, minX, maxX) { return Math.max(minX, Math.min(maxX, x)); }

export function resolveFighterOverlap(attackerX, defenderX, minDistance, attackerProfile, defenderProfile) {
  const dist = defenderX - attackerX;
  const dir = dist >= 0 ? 1 : -1;
  if (Math.abs(dist) < minDistance) {
    const sepBoost = (attackerProfile?.collisionBehaviour?.separationForce || 8) + (defenderProfile?.collisionBehaviour?.separationForce || 8);
    return defenderX - dir * (minDistance + sepBoost*0.15);
  }
  return attackerX;
}

// M1 new: separation force for clones - Bug2 fix
export function applySeparationForce(fighterA, fighterB, minDistance = 48) {
  const dx = fighterA.x - fighterB.x;
  const dy = (fighterA.y - fighterB.y) * 0.3;
  const dist = Math.hypot(dx, dy);
  if (dist < minDistance && dist > 0.1) {
    const overlap = minDistance - dist;
    const dirX = dx / dist;
    const separationForce = overlap * 0.8 + 2;
    const massA = fighterA.physicsProfile?.mass || fighterA.motion?.physicsProfile?.mass || 75;
    const massB = fighterB.physicsProfile?.mass || fighterB.motion?.physicsProfile?.mass || 75;
    const totalMass = massA + massB;
    const pushA = (massB / totalMass) * separationForce * 2.5;
    const pushB = (massA / totalMass) * separationForce * 2.5;
    fighterA.x += dirX * pushA;
    fighterB.x -= dirX * pushB;
    if (fighterA.motion) fighterA.motion.vx += dirX * pushA * 8;
    if (fighterB.motion) fighterB.motion.vx -= dirX * pushB * 8;
    return { separated: true, overlap, force: separationForce };
  }
  if (fighterA.physicsProfile?.weightDef?.isEthereal || fighterB.physicsProfile?.weightDef?.isEthereal) return { separated: false, ethereal: true };
  return { separated: false };
}

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

export function reflectVelocity(vx, restitution = 0.35, mass = 75) {
  const massFactor = Math.max(0.2, Math.min(1, 150 / (mass||75)));
  return -vx * restitution * massFactor;
}

export function getTerrainImpact(terrain, landingForce) {
  if (landingForce > 300) return { crack: true, dust: 0.8, debris: Math.floor(landingForce/100) };
  if (landingForce > 100) return { crack: false, dust: 0.4, debris: 1 };
  return { crack: false, dust: 0.1, debris: 0 };
}
