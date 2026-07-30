// ---------- PARTICLE SYSTEM ----------
// Phase 3.95, spec section 9 + 13 ("reuse particle systems", "object
// pooling for effects", "do not recreate sprites every frame"). A fixed
// pool of particle slots gets reused: emitting just claims free slots
// (or steals the oldest ones if the pool is saturated) and writes into
// them, instead of pushing new objects onto a growing array every hit.

const POOL_SIZE = 220;

const EMITTER_PROFILES = {
  dust: { count: 6, speed: 60, life: 0.4, size: 3 },
  smoke: { count: 8, speed: 30, life: 1.1, size: 6 },
  fire: { count: 10, speed: 90, life: 0.55, size: 5 },
  ice: { count: 7, speed: 70, life: 0.6, size: 4 }, // Phase 4B: ice_shard projectile trail/impact — same shape as fire's profile, different feel via color
  lightning: { count: 5, speed: 260, life: 0.2, size: 3 },
  energy: { count: 8, speed: 120, life: 0.5, size: 4 },
  debris: { count: 10, speed: 140, life: 0.7, size: 5 },
  rock_fragment: { count: 8, speed: 100, life: 0.8, size: 6 },
  magic_circle: { count: 1, speed: 0, life: 0.9, size: 60, ring: true },
  reality_fragment: { count: 9, speed: 80, life: 0.9, size: 5 },
  stars: { count: 7, speed: 50, life: 0.6, size: 3 },
  galaxy: { count: 12, speed: 40, life: 1.4, size: 3 },
  blood: { count: 6, speed: 90, life: 0.4, size: 3 },
  healing: { count: 8, speed: -50, life: 0.8, size: 4 }, // negative speed = drifts upward
  aura_trail: { count: 6, speed: 20, life: 0.7, size: 5 },
  explosion_ring: { count: 1, speed: 0, life: 0.5, size: 90, ring: true },
  // Phase 4C, spec section 16: "Shock Rings" and "Energy Waves" — a real
  // 0-to-full expansion (see the `expand` flag below), distinct from
  // explosion_ring/magic_circle's subtler ~0.6x-to-1x pulse, which stays
  // exactly as it already was so nothing already using those looks different.
  shockwave: { count: 1, speed: 0, life: 0.42, size: 130, ring: true, expand: true },
  energy_wave: { count: 1, speed: 0, life: 0.75, size: 105, ring: true, expand: true },
};

let nextId = 1;

export function createParticleSystem(poolSize = POOL_SIZE) {
  const pool = new Array(poolSize).fill(null).map(() => ({ id: 0, alive: false }));
  return { pool, cursor: 0 };
}

function claimSlot(system) {
  // Round-robin through the fixed pool — a saturated pool just reuses (and
  // visually cuts off) its oldest slot rather than growing unbounded.
  const slot = system.pool[system.cursor];
  system.cursor = (system.cursor + 1) % system.pool.length;
  return slot;
}

/**
 * Spawns one burst from a named emitter profile (spec section 9's
 * catalog) at (x, y). `intensity` scales count/size without needing a
 * different profile per magnitude.
 */
export function emitParticles(system, type, x, y, { intensity = "medium", color } = {}) {
  const profile = EMITTER_PROFILES[type] || EMITTER_PROFILES.dust;
  const scale = intensity === "high" ? 1.6 : intensity === "low" ? 0.6 : 1;
  const count = Math.max(1, Math.round(profile.count * scale));

  for (let i = 0; i < count; i++) {
    const slot = claimSlot(system);
    const angle = profile.ring ? (i / count) * Math.PI * 2 : Math.random() * Math.PI * 2;
    const speed = profile.speed * (0.6 + Math.random() * 0.8);
    slot.id = nextId++;
    slot.alive = true;
    slot.type = type;
    slot.ring = !!profile.ring;
    slot.expand = !!profile.expand; // Phase 4C: true 0->full ring growth, see Particle.jsx
    slot.x = x;
    slot.y = y;
    slot.vx = Math.cos(angle) * speed;
    slot.vy = Math.sin(angle) * speed;
    slot.size = profile.size * scale;
    slot.life = profile.life;
    slot.age = 0;
    slot.color = color || null;
  }
}

/** Advances every live particle by dt; retires anything past its lifetime back into the pool (no array churn). */
export function updateParticles(system, dt) {
  for (const p of system.pool) {
    if (!p.alive) continue;
    p.age += dt;
    if (p.age >= p.life) {
      p.alive = false;
      continue;
    }
    if (!p.ring) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt; // light drift/gravity so bursts settle instead of flying forever
    }
  }
}

export function livingParticles(system) {
  return system.pool.filter((p) => p.alive);
}
