// ---------- PROJECTILE RENDERER ----------
// Purely presentational: given a projectile's live x/y/variant, draws a
// shape. New AI-invented power visuals just need a new case here (or a
// fallback to the default orb) — spawning logic in projectileManager.js
// never needs to change.
//
// Phase 4B: expanded from 2 silhouettes (a rotated line for laser/arrow,
// a 2-circle blob for everything else) to a distinct shape per variant in
// projectileManager.js's SPEEDS table, matching the Combat Engine's real
// element vocabulary (fire/ice/lightning/gravity/void) instead of only
// covering fire.

const VARIANT_STYLE = {
  laser: { fill: "#7DE8FF", glow: "#3AC7E8" },
  arrow: { fill: "#E8B94A", glow: "#C99A2E" },
  energy: { fill: "#B4E84A", glow: "#8FD62E" },
  fireball: { fill: "#FF7A45", glow: "#E4443B" },
  ice_shard: { fill: "#D8F5FF", glow: "#7DC8E8" },
  lightning_bolt: { fill: "#FFF6B0", glow: "#7DC8FF" },
  gravity_orb: { fill: "#9B7BFF", glow: "#4B2E8F" },
  void_sphere: { fill: "#1A1226", glow: "#B46BFF" },
  black_hole: { fill: "#050308", glow: "#FF9A45" },
  orb: { fill: "#B46BFF", glow: "#7C6BFF" },
};

export default function Projectile({ projectile }) {
  const style = VARIANT_STYLE[projectile.variant] || VARIANT_STYLE.orb;
  const angle = (Math.atan2(projectile.toY - projectile.fromY, projectile.toX - projectile.fromX) * 180) / Math.PI;
  const variant = projectile.variant;

  if (variant === "laser") {
    // A beam should read as connected light between the shooter and the
    // target, not a small object flying through the air — so this draws
    // the FULL path every frame (world coordinates, no per-frame
    // translate/rotate needed since the line itself doesn't move), with a
    // near-instant reveal from source to target rather than tracking
    // projectile.x/y like every other point-projectile variant below.
    const t = projectile.duration > 0 ? Math.min(1, projectile.elapsed / projectile.duration) : 1;
    const revealT = Math.min(1, t / 0.2); // reaches full length almost immediately, then holds
    const headX = projectile.fromX + (projectile.toX - projectile.fromX) * revealT;
    const headY = projectile.fromY + (projectile.toY - projectile.fromY) * revealT;
    return (
      <g>
        <line x1={projectile.fromX} y1={projectile.fromY} x2={headX} y2={headY} stroke={style.glow} strokeWidth={12} strokeLinecap="round" opacity={0.3} />
        <line x1={projectile.fromX} y1={projectile.fromY} x2={headX} y2={headY} stroke={style.glow} strokeWidth={6} strokeLinecap="round" opacity={0.55} />
        <line x1={projectile.fromX} y1={projectile.fromY} x2={headX} y2={headY} stroke={style.fill} strokeWidth={2.4} strokeLinecap="round" opacity={0.95} />
        <circle cx={headX} cy={headY} r={7} fill={style.fill} opacity={0.9} />
        <circle cx={headX} cy={headY} r={13} fill={style.glow} opacity={0.35} />
      </g>
    );
  }

  if (variant === "arrow") {
    return (
      <g transform={`translate(${projectile.x}, ${projectile.y}) rotate(${angle})`}>
        <line x1={-20} y1={0} x2={10} y2={0} stroke={style.fill} strokeWidth={2.4} strokeLinecap="round" />
        <polygon points="16,0 5,-5 5,5" fill={style.fill} />
      </g>
    );
  }

  if (variant === "lightning_bolt") {
    return (
      <g transform={`translate(${projectile.x}, ${projectile.y}) rotate(${angle})`}>
        <polyline points="-20,0 -9,-7 -2,3 9,-8 20,0" fill="none" stroke={style.glow} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />
        <polyline points="-20,0 -9,-7 -2,3 9,-8 20,0" fill="none" stroke={style.fill} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }

  if (variant === "ice_shard") {
    return (
      <g transform={`translate(${projectile.x}, ${projectile.y}) rotate(${angle})`}>
        <polygon points="14,0 2,-6 -12,0 2,6" fill={style.glow} opacity={0.3} transform="scale(1.4)" />
        <polygon points="14,0 2,-6 -12,0 2,6" fill={style.fill} stroke={style.glow} strokeWidth={1} />
      </g>
    );
  }

  if (variant === "fireball") {
    return (
      <g transform={`translate(${projectile.x}, ${projectile.y}) rotate(${angle})`}>
        <polygon points="6,0 -20,-8 -12,0 -20,8" fill={style.glow} opacity={0.55} />
        <circle r={11} fill={style.glow} opacity={0.35} />
        <circle r={6} fill={style.fill} />
      </g>
    );
  }

  if (variant === "gravity_orb") {
    return (
      <g transform={`translate(${projectile.x}, ${projectile.y})`}>
        <ellipse rx={16} ry={7} fill="none" stroke={style.glow} strokeWidth={1.4} opacity={0.6} transform="rotate(20)" />
        <ellipse rx={13} ry={5} fill="none" stroke={style.glow} strokeWidth={1.2} opacity={0.5} transform="rotate(-25)" />
        <circle r={7} fill={style.fill} />
      </g>
    );
  }

  if (variant === "black_hole") {
    return (
      <g transform={`translate(${projectile.x}, ${projectile.y})`}>
        <ellipse rx={18} ry={6} fill="none" stroke={style.glow} strokeWidth={2} opacity={0.75} transform="rotate(18)" />
        <circle r={9} fill={style.fill} />
        <circle r={9} fill="none" stroke={style.glow} strokeWidth={0.8} opacity={0.4} />
      </g>
    );
  }

  if (variant === "void_sphere") {
    return (
      <g transform={`translate(${projectile.x}, ${projectile.y})`}>
        <circle r={11} fill="none" stroke={style.glow} strokeWidth={1.5} opacity={0.55} />
        <circle r={7} fill={style.fill} />
      </g>
    );
  }

  // energy / orb / any future variant with no bespoke shape.
  return (
    <g transform={`translate(${projectile.x}, ${projectile.y})`}>
      <circle r={12} fill={style.glow} opacity={0.3} />
      <circle r={6} fill={style.fill} />
    </g>
  );
}
