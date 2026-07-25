function Beam({ command }) {
  const { from, to, kind = "energy", width = 14 } = command.metadata || {};
  if (!from || !to) return null;
  const t = Math.min(1, (command.elapsed || 0) / (command.duration || 1));
  const colors = kind === "void" ? ["#05030a", "#7c6bff"] : kind === "fire" ? ["#ff7a45", "#e4443b"] : ["#7de8ff", "#b4e84a"];
  return <g opacity={Math.max(0, 1 - t * 0.35)}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={colors[1]} strokeWidth={width * 2.4} strokeLinecap="round" opacity="0.22"/><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={colors[0]} strokeWidth={width} strokeLinecap="round" opacity="0.95"/><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#fff" strokeWidth={Math.max(2, width * 0.22)} strokeLinecap="round" opacity="0.75"/></g>;
}
function Ring({ command, stroke = "#7de8ff" }) { const t = Math.min(1, (command.elapsed || 0) / (command.duration || 1)); const r = (command.metadata?.radius || 70) * (0.2 + t); return <circle cx={command.position?.x} cy={command.position?.y} r={r} fill="none" stroke={stroke} strokeWidth={Math.max(1, 8 * (1 - t))} opacity={1 - t} />; }
function Aura({ command }) { const t = Math.min(1, (command.elapsed || 0) / (command.duration || 1)); return <circle cx={command.position?.x} cy={command.position?.y} r={42 * (command.scale || 1) * (1 + Math.sin(t * Math.PI) * 0.35)} fill={command.metadata?.kind === "void" ? "#7c6bff" : "#7de8ff"} opacity={0.18 * (1 - t * 0.5)} />; }
function Particle({ p }) { return <circle cx={p.x} cy={p.y} r={p.r} fill={p.color} opacity={p.opacity} />; }
export default function VFXLayer({ engine }) {
  if (!engine) return null;
  const commands = engine.activeCommands || [];
  return <g>{commands.map((c) => c.type === "Beam" || c.type === "Projectile" ? <Beam key={c.id} command={c}/> : c.type === "Explosion" ? <Ring key={c.id} command={c} stroke="#ffb15f"/> : c.type === "Shockwave" ? <Ring key={c.id} command={c} stroke="#ffffff"/> : c.type === "Aura" ? <Aura key={c.id} command={c}/> : c.type === "Screen Flash" ? <rect key={c.id} x="0" y="0" width="1000" height="420" fill={c.metadata?.color || "#fff"} opacity={(c.opacity || 0.3) * Math.max(0, 1 - (c.elapsed || 0) / (c.duration || 1))}/> : null)}{engine.particles.pool.active.map((p, i) => <Particle key={i} p={p}/>)}</g>;
}
