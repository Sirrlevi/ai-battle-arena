import { acquire, createObjectPool, releaseInactive } from "./objectPool.js";
const COLORS = { fire: ["#ff7a45", "#e4443b"], smoke: ["#7c8590", "#23282f"], dust: ["#b08a5b", "#6f5537"], ice: ["#9fe8ff", "#ffffff"], snow: ["#ffffff", "#bdefff"], rain: ["#6bbcff", "#3a7bd5"], lightning: ["#fff27a", "#7de8ff"], magic: ["#b46bff", "#7c6bff"], void: ["#7c6bff", "#05030a"], cosmic: ["#e84ac0", "#7de8ff"], energy: ["#b4e84a", "#7de8ff"], stars: ["#ffffff", "#e8b94a"], ash: ["#c6c6c6", "#333333"], leaves: ["#7fbf4d", "#d6a044"], debris: ["#7a5f42", "#3b3229"], blood: ["#b00020", "#e4443b"] };
function makeParticle() { return { alive: false }; }
function resetParticle(p, init) { Object.assign(p, { alive: true, age: 0, life: init.life ?? 0.7, x: init.x, y: init.y, vx: init.vx ?? 0, vy: init.vy ?? 0, r: init.r ?? 3, color: init.color, opacity: init.opacity ?? 1, kind: init.kind ?? "energy" }); }
export function createParticleEngine() { return { pool: createObjectPool(makeParticle, resetParticle, 600), enabled: true }; }
export function emitParticles(engine, { x, y, kind = "energy", count = 24, spread = 180, speed = 120, life = 0.7, radius = 3 } = {}) {
  if (!engine.enabled) return;
  const colors = COLORS[kind] || COLORS.energy;
  for (let i = 0; i < count; i++) {
    const a = (Math.random() * spread - spread / 2) * Math.PI / 180 - Math.PI / 2;
    const s = speed * (0.35 + Math.random() * 0.9);
    acquire(engine.pool, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: radius * (0.5 + Math.random()), color: colors[i % colors.length], life: life * (0.7 + Math.random() * 0.6), kind });
  }
}
export function updateParticleEngine(engine, dt) {
  for (const p of engine.pool.active) {
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt; p.opacity = Math.max(0, 1 - p.age / p.life); p.alive = p.age < p.life;
  }
  releaseInactive(engine.pool);
}
