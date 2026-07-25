// ---------- STICKMAN RENDERER MODULE ----------
// Pure presentational component: given a fighter's current state, it draws
// head/body/arms/legs, an aura glow, mini HP/energy bars, a name label, and
// an optional effect-icon overlay. It knows nothing about the battle engine
// or the AI providers — it only reads plain numbers/strings off `fighter`.
//
// Rendered as a <g transform="translate(x,y)">. Everything is drawn in a
// local coordinate space with feet at (0,0) and the head near (0,-125).
// Future animation phases (walking, knockback, attack lunges, etc.) can
// simply animate the `x`/`y`/`rotate` fed into this transform, or add a
// second transform layer around individual limbs — the drawing itself never
// needs to change. See Arena.jsx for how instances are composed.

import { effectEmoji } from "../lib/battleEngine.js";

const HEAD_R = 14;
const HEAD_CY = -120;
const SHOULDER_Y = -100;
const HIP_Y = -55;
const FOOT_Y = 0;
const HAND_SPAN = 26;
const FOOT_SPAN = 18;

export default function Stickman({ fighter, auraFilterId, isActing = false, effectType = null, scale = 1 }) {
  const { name, hp, maxHp = 100, energy, maxEnergy = 100, color, alive, position } = fighter;
  const { x, y } = position || { x: 0, y: 0 };

  const hpPct = Math.max(0, Math.min(1, hp / maxHp));
  const energyPct = Math.max(0, Math.min(1, energy / maxEnergy));
  const emoji = effectEmoji(effectType);

  // A fallen fighter gets a static tipped-over pose — a fixed rotation, not
  // an animated one. No transitions are attached here on purpose (Phase 2
  // is visual state only, no movement).
  const rotation = alive ? 0 : 90;
  const opacity = alive ? 1 : 0.4;

  return (
    <g transform={`translate(${x}, ${y}) scale(${scale}) rotate(${rotation})`} opacity={opacity}>
      {/* Aura glow */}
      <ellipse cx={0} cy={HIP_Y} rx={46} ry={78} fill={color} opacity={alive ? 0.16 : 0.06} filter={auraFilterId ? `url(#${auraFilterId})` : undefined} />
      {isActing && alive && <ellipse cx={0} cy={HIP_Y} rx={54} ry={86} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />}

      {/* Body */}
      <circle cx={0} cy={HEAD_CY} r={HEAD_R} fill="none" stroke={color} strokeWidth={3} />
      <line x1={0} y1={HEAD_CY + HEAD_R} x2={0} y2={HIP_Y} stroke={color} strokeWidth={3} />
      <line x1={0} y1={SHOULDER_Y} x2={-HAND_SPAN} y2={SHOULDER_Y + 30} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <line x1={0} y1={SHOULDER_Y} x2={HAND_SPAN} y2={SHOULDER_Y + 30} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <line x1={0} y1={HIP_Y} x2={-FOOT_SPAN} y2={FOOT_Y} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <line x1={0} y1={HIP_Y} x2={FOOT_SPAN} y2={FOOT_Y} stroke={color} strokeWidth={3} strokeLinecap="round" />

      {/* Effect indicator */}
      {emoji && alive && (
        <text x={0} y={HEAD_CY - 26} textAnchor="middle" fontSize={26}>
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
