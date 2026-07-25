// ---------- COLLISION SYSTEM MODULE ----------
// Deliberately simple: no broad/narrow-phase physics engine, just the four
// checks Phase 3 needs. Every function is pure (state in, boolean/number
// out) so the movement/projectile controllers can call them without caring
// how collisions are actually detected.

export function isGrounded(y, groundY) {
  return y >= groundY;
}

export function clampToBounds(x, minX, maxX) {
  return Math.max(minX, Math.min(maxX, x));
}

// Keeps two fighters from occupying the exact same spot (used to stop a
// melee dash-in short of the opponent instead of overlapping them).
export function resolveFighterOverlap(attackerX, defenderX, minDistance) {
  const dist = defenderX - attackerX;
  const dir = dist >= 0 ? 1 : -1;
  if (Math.abs(dist) < minDistance) {
    return defenderX - dir * minDistance;
  }
  return attackerX;
}

export function projectileHitTest(projectile, targetX, targetY, radius = 34) {
  const dx = projectile.x - targetX;
  const dy = projectile.y - targetY;
  return Math.hypot(dx, dy) <= radius;
}

export function isOutOfArena(x, y, width, height, margin = 60) {
  return x < -margin || x > width + margin || y < -margin || y > height + margin;
}
