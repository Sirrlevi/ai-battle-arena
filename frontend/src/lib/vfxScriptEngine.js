import { createTimeline } from "./renderCommands.js";
function pointFor(key, poses, fallback) { const p = poses?.[key]; return p ? { x: p.x, y: p.y - 80 } : fallback; }
export function buildVfxTimeline(entry, poses = {}) {
  const source = pointFor(entry.actorKey, poses, { x: 180, y: 260 });
  const target = pointFor(entry.defenderKey, poses, { x: 820, y: 260 });
  const interp = entry.interpreterOutput || {};
  const kind = (interp.rendererHints?.effect || entry.effect || "energy").toLowerCase();
  const scale = interp.scale === "Cosmic" ? 1.8 : interp.scale === "Extreme" ? 1.35 : 1;
  const projectileLike = ["Beam", "Projectile", "Reality Rewrite", "Time Stop"].includes(interp.translatedType) || entry.action === "Special";
  const commands = [
    { type: "Aura", target: entry.actorKey, position: source, startTime: 0, duration: 500, layer: "aura", priority: 2, scale, metadata: { kind, pulse: true } },
    { type: "Particle", target: entry.actorKey, position: source, startTime: 120, duration: 700, layer: "particles", priority: 3, metadata: { kind, count: Math.round(24 * scale), speed: 150 * scale } },
    { type: "Camera", target: entry.defenderKey, startTime: 220, duration: 420, layer: "debug", priority: 8, metadata: { zoom: 1.08, shake: entry.damage > 0 ? 0.45 : 0.18 } },
  ];
  if (projectileLike) commands.push({ type: interp.translatedType === "Beam" || interp.translatedType === "Reality Rewrite" ? "Beam" : "Projectile", target: entry.defenderKey, position: source, startTime: 430, duration: 420, layer: "effects", priority: 5, metadata: { kind, from: source, to: target, width: 16 * scale } });
  if (["hit", "lethal", "ai_claim"].includes(entry.result)) commands.push(
    { type: "Screen Flash", position: target, startTime: 850, duration: 160, layer: "lighting", priority: 10, opacity: 0.35, metadata: { color: kind === "void" ? "#7c6bff" : "#ffffff" } },
    { type: "Explosion", position: target, startTime: 880, duration: 650, layer: "effects", priority: 6, scale, metadata: { kind, radius: 55 * scale } },
    { type: "Shockwave", position: target, startTime: 930, duration: 620, layer: "effects", priority: 4, scale, metadata: { kind, radius: 130 * scale } },
    { type: "Particle", position: target, startTime: 900, duration: 900, layer: "particles", priority: 5, metadata: { kind, count: Math.round(38 * scale), speed: 220 * scale } }
  );
  return createTimeline(commands, { id: `vfx_${entry.round}_${entry.actorKey}_${Date.now()}` });
}
