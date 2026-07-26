// ---------- PROJECTILE RENDERER ----------
// Purely presentational: given a projectile's live x/y/variant, draws a
// shape. New AI-invented power visuals just need a new case here (or a
// fallback to the default orb) — spawning logic in projectileManager.js
// never needs to change.

const VARIANT_STYLE = {
  laser: { fill: "#7DE8FF", glow: "#3AC7E8" },
  arrow: { fill: "#E8B94A", glow: "#E8B94A" },
  energy: { fill: "#B4E84A", glow: "#8FD62E" },
  fireball: { fill: "#FF7A45", glow: "#E4443B" },
  orb: { fill: "#B46BFF", glow: "#7C6BFF" },
};

export default function Projectile({ projectile }) {
  const style = VARIANT_STYLE[projectile.variant] || VARIANT_STYLE.orb;
  const angle = (Math.atan2(projectile.toY - projectile.fromY, projectile.toX - projectile.fromX) * 180) / Math.PI;

  if (projectile.variant === "laser" || projectile.variant === "arrow") {
    return (
      <g transform={`translate(${projectile.x}, ${projectile.y}) rotate(${angle})`}>
        <line x1={-22} y1={0} x2={22} y2={0} stroke={style.fill} strokeWidth={4} strokeLinecap="round" opacity={0.9} />
        <line x1={-22} y1={0} x2={22} y2={0} stroke={style.glow} strokeWidth={9} strokeLinecap="round" opacity={0.25} />
      </g>
    );
  }

  return (
    <g transform={`translate(${projectile.x}, ${projectile.y})`}>
      <circle r={12} fill={style.glow} opacity={0.3} />
      <circle r={6} fill={style.fill} />
    </g>
  );
}
