// ---------- ADVANCED STICKMAN SKELETON RENDERER ----------
// Phase 4. Every fighter is now a procedural joint skeleton (spec section
// 1) instead of two straight limb lines — head/neck/chest/waist/shoulders/
// upper+lower arms/hands/upper+lower legs/feet, each independently rotated
// by skeletonRig.computePose(), a pure function of already-decided state
// (never invents combat). Aura is similarly procedural (auraSystem.js,
// section 6), and personality variance (section 14) comes from a
// deterministic per-character seed, not randomness.

import { effectEmoji } from "../lib/battleEngine.js";
import { computePose } from "../lib/skeletonRig.js";
import { computeAura } from "../lib/auraSystem.js";
import { personalitySeed } from "../lib/personalitySeed.js";

// ---- Skeleton proportions (local space, feet at y=0) ----
const HEAD_R = 13;
const HEAD_CY = -122;
const NECK_Y = -106;
const CHEST_Y = -100;
const WAIST_Y = -60;
const HIP_Y = -55;
const KNEE_Y = -28;
const FOOT_Y = 0;
const SHOULDER_Y = -100;
const ELBOW_DROP = 24;
const HAND_DROP = 22;
const FOOT_SPAN = 16;

function deg2rad(d) { return (d * Math.PI) / 180; }

/** One limb segment (upper+lower), independently rotated at hip/shoulder then knee/elbow — a real 2-joint chain, not a single straight line. */
function Limb({ originY, originX = 0, upperLen, lowerLen, upperAngle, lowerAngle, stroke, width }) {
  const upperRad = deg2rad(upperAngle);
  const jointX = originX + Math.sin(upperRad) * upperLen;
  const jointY = originY + Math.cos(upperRad) * upperLen;
  const lowerRad = deg2rad(upperAngle + lowerAngle);
  const endX = jointX + Math.sin(lowerRad) * lowerLen;
  const endY = jointY + Math.cos(lowerRad) * lowerLen;
  return (
    <g>
      <line x1={originX} y1={originY} x2={jointX} y2={jointY} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
      <line x1={jointX} y1={jointY} x2={endX} y2={endY} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
      <circle cx={jointX} cy={jointY} r={width * 0.55} fill={stroke} />
    </g>
  );
}

export default function Stickman({ fighter, pose, auraFilterId, effectType = null, statusVisuals = [], combatTierIndex = null }) {
  const { name, hp, maxHp = 100, energy, maxEnergy = 100, color, alive, personality } = fighter;
  const {
    x, y, facing = 1, state = "idle", attackPhase = null, flashing = false,
    hitReaction = null, transformProgress = 0, trail = [], clock = 0, vx = 0, vy = 0,
  } = pose || {};

  const hpPct = Math.max(0, Math.min(1, hp / maxHp));
  const energyPct = Math.max(0, Math.min(1, energy / maxEnergy));
  const emoji = effectEmoji(effectType) || (state === "blocking" ? "🛡️" : null);
  const transforming = state === "transforming";
  const strokeColor = flashing ? "#FFFFFF" : transforming ? "#F5E663" : color;

  const seed = personalitySeed(name, personality);
  const skeleton = computePose({
    state, facing,
    vx, vy,
    grounded: true,
    attackPhase,
    hitReaction,
    transformProgress,
    seed,
    t: clock,
  });

  const aura = computeAura({
    hpPct, energyPct, transformProgress, combatTierIndex,
    baseColor: color,
    isCharging: attackPhase?.phase === "windup" && (attackPhase?.variant === "energy_punch" || attackPhase?.t > 0.1),
    t: clock, pulseSpeed: seed.auraPulseSpeed,
  });

  const rotation = alive ? 0 : 90;
  const opacity = alive ? 1 : 0.4;
  const dir = facing >= 0 ? 1 : -1;
  const stanceX = skeleton.stanceWidth * FOOT_SPAN;

  return (
    <g transform={`translate(${x}, ${y + skeleton.bobY}) rotate(${rotation + skeleton.spinDeg}) scale(${skeleton.scaleX}, ${skeleton.scaleY})`} opacity={opacity}>
      {alive && trail.map((g, i) => (
        <g key={i} transform={`translate(${g.x - x}, ${g.y - y})`} opacity={Math.max(0, 0.22 * (1 - g.age / 0.35))}>
          <line x1={0} y1={HEAD_CY + HEAD_R} x2={0} y2={HIP_Y} stroke={color} strokeWidth={3} />
          <circle cx={0} cy={HEAD_CY} r={HEAD_R} fill="none" stroke={color} strokeWidth={2} />
        </g>
      ))}

      <ellipse cx={0} cy={HIP_Y} rx={aura.radius * 0.6} ry={aura.radius} fill={aura.color} opacity={alive ? aura.opacity : 0.06} filter={auraFilterId ? `url(#${auraFilterId})` : undefined} />
      {aura.ringVisible && alive && (
        <ellipse cx={0} cy={HIP_Y} rx={aura.radius * 0.68} ry={aura.radius * 1.05} fill="none" stroke={aura.color} strokeWidth={aura.ringWidth} opacity={0.5} />
      )}

      {alive && statusVisuals.map((v, i) => (
        <ellipse key={`${v.label}-${i}`} cx={0} cy={HIP_Y} rx={58 + i * 8} ry={92 + i * 8} fill="none" stroke={v.color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} />
      ))}

      {/* ---- Procedural skeleton (spec section 1) ---- */}
      <g transform={`translate(0, ${WAIST_Y}) rotate(${skeleton.waistTwist})`}>
        <line x1={0} y1={0} x2={0} y2={CHEST_Y - WAIST_Y} stroke={strokeColor} strokeWidth={3} strokeLinecap="round" />
        <g transform={`translate(0, ${CHEST_Y - WAIST_Y}) rotate(${skeleton.chestTilt})`}>
          <line x1={0} y1={0} x2={0} y2={NECK_Y - CHEST_Y} stroke={strokeColor} strokeWidth={4} strokeLinecap="round" />
          <g transform={`translate(0, ${NECK_Y - CHEST_Y}) rotate(${skeleton.neckTilt})`}>
            <line x1={0} y1={0} x2={0} y2={HEAD_CY - NECK_Y} stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" />
            <g transform={`rotate(${skeleton.headTilt})`}>
              <circle cx={0} cy={HEAD_CY - NECK_Y} r={HEAD_R} fill="none" stroke={strokeColor} strokeWidth={3} />
            </g>
          </g>
        </g>
      </g>

      <Limb originY={SHOULDER_Y} originX={dir > 0 ? -4 : 4} upperLen={ELBOW_DROP} lowerLen={HAND_DROP}
        upperAngle={skeleton.upperArmL + skeleton.shoulderL} lowerAngle={skeleton.lowerArmL}
        stroke={strokeColor} width={3} />
      <Limb originY={SHOULDER_Y} originX={dir > 0 ? 4 : -4} upperLen={ELBOW_DROP} lowerLen={HAND_DROP}
        upperAngle={skeleton.upperArmR + skeleton.shoulderR} lowerAngle={skeleton.lowerArmR}
        stroke={strokeColor} width={3} />

      <Limb originY={HIP_Y} originX={-stanceX * 0.4} upperLen={27} lowerLen={FOOT_Y - KNEE_Y}
        upperAngle={skeleton.upperLegL} lowerAngle={skeleton.lowerLegL}
        stroke={strokeColor} width={3.2} />
      <Limb originY={HIP_Y} originX={stanceX * 0.4} upperLen={27} lowerLen={FOOT_Y - KNEE_Y}
        upperAngle={skeleton.upperLegR} lowerAngle={skeleton.lowerLegR}
        stroke={strokeColor} width={3.2} />

      {emoji && alive && (
        <text x={0} y={HEAD_CY - 26} textAnchor="middle" fontSize={24}>
          {emoji}
        </text>
      )}

      <text x={0} y={FOOT_Y + 18} textAnchor="middle" fontSize={12} fill="#EDEAE3" fontFamily="'IBM Plex Mono', monospace">
        {name}
      </text>

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
