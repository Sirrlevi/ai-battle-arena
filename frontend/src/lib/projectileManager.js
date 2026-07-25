// ---------- PROJECTILE MANAGER MODULE ----------
// Generic enough to carry any AI-invented ranged power: it only needs a
// visual `variant` string (used by the renderer to pick a shape/color) and
// start/target coordinates. Nothing here is specific to "laser" or
// "fireball" — those are just variant labels attached at spawn time by the
// action interpreter.

const SPEEDS = {
  laser: 1100,
  arrow: 900,
  energy: 750,
  fireball: 620,
  orb: 560,
};

let nextId = 1;

export function createProjectileManager() {
  return { items: [] };
}

export function spawnProjectile(manager, { variant = "energy", fromX, fromY, toX, toY, ownerKey, targetKey, payload }) {
  const speed = SPEEDS[variant] || SPEEDS.energy;
  const dist = Math.hypot(toX - fromX, toY - fromY) || 1;
  manager.items.push({
    id: nextId++,
    variant,
    x: fromX,
    y: fromY,
    fromX,
    fromY,
    toX,
    toY,
    speed,
    duration: dist / speed,
    elapsed: 0,
    ownerKey,
    targetKey,
    payload, // { damage, result } — carried through so the visual hit can react correctly
    alive: true,
  });
}

/**
 * Advances every projectile by dt. Calls onArrive(projectile) exactly once
 * per projectile when it reaches its target, then removes it.
 */
export function updateProjectiles(manager, dt, onArrive) {
  for (const p of manager.items) {
    if (!p.alive) continue;
    p.elapsed += dt;
    const t = Math.min(1, p.elapsed / p.duration);
    p.x = p.fromX + (p.toX - p.fromX) * t;
    p.y = p.fromY + (p.toY - p.fromY) * t;
    if (t >= 1) {
      p.alive = false;
      onArrive?.(p);
    }
  }
  manager.items = manager.items.filter((p) => p.alive);
}
