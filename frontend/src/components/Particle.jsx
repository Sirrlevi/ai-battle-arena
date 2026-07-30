// ---------- PARTICLE RENDERER ----------
// Phase 3.95. Purely presentational, same pattern as Projectile.jsx: given
// one live slot from particleSystem.js's pool, draw it. New particle types
// just need a new fallback color here — spawn/pooling logic never changes.

const TYPE_COLOR = {
  dust: "#7C8590",
  smoke: "#8A8F98",
  fire: "#FF7A45",
  lightning: "#F5E663",
  energy: "#7DE8FF",
  debris: "#4A4E58",
  rock_fragment: "#5A5E68",
  magic_circle: "#B46BFF",
  reality_fragment: "#B46BFF",
  stars: "#F5E663",
  galaxy: "#7C6BFF",
  blood: "#C23B3B",
  healing: "#3ECF8E",
  aura_trail: "#8FD62E",
  explosion_ring: "#E8B94A",
};

export default function Particle({ particle }) {
  const color = particle.color || TYPE_COLOR[particle.type] || "#7C8590";
  const lifeRatio = 1 - particle.age / particle.life;
  const opacity = Math.max(0, Math.min(1, lifeRatio));

  if (particle.ring) {
    const radius = particle.expand ? particle.size * (1 - lifeRatio) : particle.size * (1 - lifeRatio * 0.4);
    const strokeWidth = particle.expand ? 1.5 + lifeRatio * 4 : 3;
    return <circle cx={particle.x} cy={particle.y} r={Math.max(1, radius)} fill="none" stroke={color} strokeWidth={strokeWidth} opacity={opacity * 0.8} />;
  }

  return <circle cx={particle.x} cy={particle.y} r={particle.size * Math.max(0.2, lifeRatio)} fill={color} opacity={opacity * 0.85} />;
}
