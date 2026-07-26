// ---------- PHASE 3.95 PARTICLE LAYER ----------
// Lightweight SVG particles sourced from Animation Events. No combat logic is
// decided here; particles are visual echoes of engine-authored events.

const COLORS = {
  dust: "#B8A27A",
  smoke: "#77808A",
  fire: "#FF6A2A",
  lightning: "#8EDBFF",
  energy: "#8F7BFF",
  debris: "#8A6A45",
  healing: "#3ECF8E",
  barrier: "#8EDBFF",
  ice: "#A8E7FF",
  poison: "#79D45E",
  "reality-fragments": "#D68CFF",
  aura: "#E8B94A",
};

export default function ParticleLayer({ particles = [] }) {
  return (
    <g pointerEvents="none">
      {particles.map((p) => {
        const color = COLORS[p.kind] || COLORS.energy;
        const opacity = Math.max(0, 1 - p.age / p.life);
        const r = p.radius || 4;
        if (p.kind === "barrier") {
          return <circle key={p.id} cx={p.x} cy={p.y - 72} r={36 + p.age * 24} fill="none" stroke={color} strokeWidth={2} opacity={opacity * 0.8} />;
        }
        if (p.kind === "debris" || p.kind === "reality-fragments") {
          return <rect key={p.id} x={p.x - r / 2} y={p.y - r / 2} width={r} height={r} fill={color} opacity={opacity} transform={`rotate(${p.spin || 0} ${p.x} ${p.y})`} />;
        }
        return <circle key={p.id} cx={p.x} cy={p.y} r={r} fill={color} opacity={opacity} />;
      })}
    </g>
  );
}
