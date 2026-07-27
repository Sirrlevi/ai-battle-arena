// ---------- STICKMAN RENDERER MODULE ----------
// Pure presentational component. In Phase 2 this only read a fixed
// `fighter.position`; it now reads a live `pose` object driven every frame
// by the Animation Controller (x/y/facing/state/attackPhase/flashing).
// The drawing code itself hasn't changed shape — motion is still just the
// `<g transform="translate(x,y) ...">` on the outside, exactly as the
// Phase 2 architecture note promised, plus one small inner `<g>` around the
// acting arm so melee swings can rotate without touching anything else.

import { effectEmoji } from "../lib/battleEngine.js";

const HEAD_R = 14;
const HEAD_CY = -120;
const SHOULDER_Y = -100;
const HIP_Y = -55;
const FOOT_Y = 0;
const HAND_SPAN = 26;
const FOOT_SPAN = 18;

function armAngleFor(attackPhase, facing) {
  if (!attackPhase) return 0;
  const dir = facing >= 0 ? 1 : -1;
  if (attackPhase.phase === "windup") return -30 * dir;
  if (attackPhase.phase === "strike") return 70 * dir;
  if (attackPhase.phase === "recovery") return 10 * dir;
  return 0;
}

export default function Stickman({ fighter, pose, auraFilterId, effectType = null, statusVisuals = [] }) {
  const { name, hp, maxHp = 100, energy, maxEnergy = 100, color, alive } = fighter;
  const { x, y, facing = 1, state = "idle", attackPhase = null, flashing = false } = pose || {};

  const hpPct = Math.max(0, Math.min(1, hp / maxHp));
  const energyPct = Math.max(0, Math.min(1, energy / maxEnergy));
  const emoji = effectEmoji(effectType) || (state === "blocking" ? "🛡️" : null);
  const transforming = state === "transforming";
  const strokeColor = flashing ? "#FFFFFF" : transforming ? "#F5E663" : color;

  const rotation = alive ? 0 : 90;
  const opacity = alive ? 1 : 0.4;
  const armAngle = armAngleFor(attackPhase, facing);
  const actingArmIsRight = facing >= 0;
  const transformScale = transforming ? 1.08 : 1;

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotation}) scale(${transformScale})`} opacity={opacity}>
      {/* Aura glow */}
      <ellipse cx={0} cy={HIP_Y} rx={46} ry={78} fill={color} opacity={alive ? (transforming ? 0.32 : 0.16) : 0.06} filter={auraFilterId ? `url(#${auraFilterId})` : undefined} />
      {(state === "attacking" || state === "running" || state === "flying" || transforming) && alive && (
        <ellipse cx={0} cy={HIP_Y} rx={54} ry={86} fill="none" stroke={transforming ? "#F5E663" : color} strokeWidth={transforming ? 3 : 2} opacity={0.5} />
      )}

      {/* Phase 3.95: status-effect aura rings — one thin ring per active, engine-applied status (see statusVisuals.js), never invented by the renderer. */}
      {alive && statusVisuals.map((v, i) => (
        <ellipse
          key={`${v.label}-${i}`}
          cx={0} cy={HIP_Y}
          rx={58 + i * 8} ry={92 + i * 8}
          fill="none" stroke={v.color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55}
        />
      ))}

      {/* Body */}
      <circle cx={0} cy={HEAD_CY} r={HEAD_R} fill="none" stroke={strokeColor} strokeWidth={3} />
      <line x1={0} y1={HEAD_CY + HEAD_R} x2={0} y2={HIP_Y} stroke={strokeColor} strokeWidth={3} />

      {/* Non-acting arm stays neutral */}
      <line
        x1={0} y1={SHOULDER_Y}
        x2={actingArmIsRight ? -HAND_SPAN : HAND_SPAN} y2={SHOULDER_Y + 30}
        stroke={strokeColor} strokeWidth={3} strokeLinecap="round"
      />
      {/* Acting arm rotates through windup/strike/recovery */}
      <g transform={`rotate(${armAngle} 0 ${SHOULDER_Y})`}>
        <line
          x1={0} y1={SHOULDER_Y}
          x2={actingArmIsRight ? HAND_SPAN : -HAND_SPAN} y2={SHOULDER_Y + 30}
          stroke={strokeColor} strokeWidth={3} strokeLinecap="round"
        />
      </g>

      <line x1={0} y1={HIP_Y} x2={-FOOT_SPAN} y2={FOOT_Y} stroke={strokeColor} strokeWidth={3} strokeLinecap="round" />
      <line x1={0} y1={HIP_Y} x2={FOOT_SPAN} y2={FOOT_Y} stroke={strokeColor} strokeWidth={3} strokeLinecap="round" />

      {/* Effect / status indicator */}
      {emoji && alive && (
        <text x={0} y={HEAD_CY - 26} textAnchor="middle" fontSize={24}>
          {emoji}
        </text>
      )}

      {/* Name label */}
      <text x={0} y={FOOT_Y + 18} textAnchor="middle" fontSize={12} fill="#EDEAE3" fontFamily="'IBM Plex Mono', monospace">
        {name}
      </text>

      {/* Mini HP / energy bars above the head */}
      <g transform={`translate(${-26}, ${HEAD_CY - HEAD_R - 22})`}>
        <rect x={0} y={0} width={52} height={5} rx={2.5} fill="#23282f" />
        <rect x={0} y={0} width={52 * hpPct} height={5} rx={2.5} fill={hpPct > 0.3 ? "#3ECF8E" : "#E4443B"} />
        <rect x={0} y={8} width={52} height={4} rx={2} fill="#23282f" />
        <rect x={0} y={8} width={52 * energyPct} height={4} rx={2} fill={color} />
      </g>

      {!alive && (
        <text x={0} y={HIP_Y} textAnchor="middle" fontSize={20} transform={`rotate(-${rotation})`}>
          💀
        </text>
      )}
    </g>
  );
}
