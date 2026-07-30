// ---------- STICKMAN RENDERER MODULE ----------
// Pure presentational component — still true after Phase 4A. Phase 2's
// promise ("motion is still just the outer translate/rotate/scale") still
// holds; what changed is everything INSIDE that outer `<g>`. Pre-4A this
// drew a fixed 6-line stick figure (head, one spine line, two single-
// segment arms where only one ever animated, two static legs) with zero
// limb motion during ordinary movement. Phase 4A (spec section 1) replaces
// that with a real jointed skeleton — neck/chest/waist/shoulders/elbows/
// hands/knees/feet, every joint independently posable — driven by the new
// `lib/characterAnimation.js`, a pure function module that has no access
// to game state and cannot invent combat: it only turns the same signals
// this component already received (state/attackPhase/facing/flashing) plus
// each fighter's own generated flavor text into a joint-angle pose.
//
// Rendering approach: forward kinematics computed directly in JS (down()/
// up() below), producing absolute joint coordinates, then drawn as plain
// SVG primitives — no nested rotate() composition to reason about, no new
// rendering technology (still pure SVG, same as every prior phase; no
// canvas/WebGL/animation library was introduced, so this stays a drop-in
// replacement for the DOM this component already produced).

import { useRef, useLayoutEffect } from "react";
import { effectEmoji } from "../lib/battleEngine.js";
import { RIG, computeSkeletonPose, computeAuraStyle, personalitySeed, lerpPose, clamp } from "../lib/characterAnimation.js";

const FOOT_Y = 0;

// ---------- forward-kinematics helpers ----------
// 0deg = straight down (down()) or straight up (up()); positive rotates
// toward +x. See characterAnimation.js's header comment for the full
// convention this mirrors.
function down(x, y, angleDeg, length) {
  const r = (angleDeg * Math.PI) / 180;
  return { x: x + Math.sin(r) * length, y: y + Math.cos(r) * length };
}
function up(x, y, angleDeg, length) {
  const r = (angleDeg * Math.PI) / 180;
  return { x: x + Math.sin(r) * length, y: y - Math.cos(r) * length };
}

// ---------- color blend (aura HP tint, spec section 6) ----------
function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function blendHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(a.r, b.r)}, ${m(a.g, b.g)}, ${m(a.b, b.b)})`;
}

// ---------- render-time-only smoothing (spec section 12, partial) ----------
// Continuous exponential smoothing of joint angles between renders so
// state changes don't pop — not a full blend-tree/crossfade system, just
// enough to satisfy "avoid abrupt transitions" for the common case. Reads
// a ref (pure) and writes it back via useLayoutEffect so this stays
// correct under React StrictMode's dev-only double-render.
function useSmoothedPose(target, rate) {
  const ref = useRef(target);
  const blended = lerpPose(ref.current, target, rate);
  useLayoutEffect(() => {
    ref.current = blended;
  });
  return blended;
}

// Frame-to-frame world-x delta, used only to scale walk/run/dash gait
// intensity continuously instead of hard-switching three animations.
function useSpeed(worldX, now) {
  const ref = useRef({ x: worldX, t: now });
  const dt = Math.max(1, now - ref.current.t);
  const speed = Math.abs(worldX - ref.current.x) / (dt / 1000);
  useLayoutEffect(() => {
    ref.current = { x: worldX, t: now };
  });
  return speed;
}

// Detects the falling/jumping -> grounded transition purely from the
// state string (no new fields needed from animationController.js) and
// returns a short decaying 0-1 "just landed" pulse for a knee-bend squash.
function useLandPulse(state, now) {
  const prevStateRef = useRef(state);
  const landStartRef = useRef(-Infinity);
  useLayoutEffect(() => {
    const wasAirborne = prevStateRef.current === "jumping" || prevStateRef.current === "falling";
    const nowGrounded = state === "idle" || state === "walking" || state === "running";
    if (prevStateRef.current !== state && wasAirborne && nowGrounded) landStartRef.current = now;
    prevStateRef.current = state;
  }, [state, now]);
  const elapsed = now - landStartRef.current;
  const LAND_PULSE_MS = 260;
  return elapsed >= 0 && elapsed < LAND_PULSE_MS ? 1 - elapsed / LAND_PULSE_MS : 0;
}

// Phase 4C, spec section 16 "After Images" / "Trail Effects": a short
// rolling history of world positions while moving fast, rendered as a few
// faded simplified silhouettes behind the current figure — not duplicate
// skeletons (four full FK chains every frame for a purely decorative trail
// isn't worth the render cost, and visually four overlapping stick figures
// reads as clutter, not a clean motion trail). Same StrictMode-safe
// read/compute/write-via-effect shape as useSmoothedPose above.
function useAfterImages(x, y, speed, now) {
  const ref = useRef([]);
  const history = ref.current;
  let next = history;
  if (speed > 420) {
    const last = history[history.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > 16) {
      next = [...history, { x, y, t: now }].slice(-4);
    }
  }
  next = next.filter((h) => now - h.t < 220);
  useLayoutEffect(() => {
    ref.current = next;
  });
  return next;
}

export default function Stickman({ fighter, pose, auraFilterId, effectType = null, statusVisuals = [], isWinner = false }) {
  const { name, hp, maxHp = 100, energy, maxEnergy = 100, color, alive } = fighter;
  const { x = 0, y = 0, facing = 1, state = "idle", attackPhase = null, flashing = false, hitMagnitude = 0, combo = 0 } = pose || {};

  const now = Date.now();
  const hpPct = Math.max(0, Math.min(1, hp / maxHp));
  const energyPct = Math.max(0, Math.min(1, energy / maxEnergy));
  const emoji = effectEmoji(effectType) || (state === "blocking" ? "🛡️" : null);
  const transforming = state === "transforming";
  // Phase 4F: sustained full-body recolor for hit/block reactions, inspired
  // by a reference stick-fighter project's approach (it recolors the whole
  // figure red/blue for the reaction's duration rather than only flashing).
  // The brief white impact flash still takes priority for its own instant
  // — this adds a real read AFTER the flash fades, for the rest of the
  // reaction, scaled by actual damage rather than a flat color.
  const hitT = clamp(hitMagnitude / 45, 0, 1);
  const strokeColor = flashing
    ? "#FFFFFF"
    : state === "hit"
      ? blendHex(color, "#FF4A4A", 0.32 + hitT * 0.4)
      : state === "blocking"
        ? blendHex(color, "#4488FF", 0.38)
        : transforming
          ? "#F5E663"
          : color;

  const speed = useSpeed(x, now);
  const landPulse = useLandPulse(state, now);
  const afterImages = useAfterImages(x, y, speed, now); // gated on `alive` at the render site below, not here — hooks must always run unconditionally
  const targetPose = computeSkeletonPose({ fighter, state, attackPhase, facing, alive, hitMagnitude, isWinner, now, worldX: x, speed, landPulse });
  // BUGFIX (movement-animation root cause): a single low blend rate was
  // applied to every pose channel regardless of how fast that pose was
  // already changing on its own. poseGait's leg/arm angles are a sin() of
  // worldX, so their oscillation frequency scales directly with travel
  // speed — at "dash" speed (640px/s, what every melee approach actually
  // uses) the gait cycles roughly every ~150ms. The old flat 0.24 rate is
  // an exponential low-pass filter with a cutoff well below that
  // oscillation frequency, so it was smoothing the swing amplitude almost
  // all the way back to zero every frame: the skeleton kept translating
  // across the screen (the outer transform) while its limbs stayed near
  // their rest pose — exactly the "sliding without proper movement
  // animation" symptom. 0.24 is still correct for what it was tuned for —
  // suppressing pop when the pose SOURCE jumps discontinuously (idle <->
  // attack <-> hit state swaps). Locomotion doesn't jump like that;
  // poseGait is already continuous, so it needs a rate fast enough not to
  // filter out its own signal, not one tuned for hiding a different kind
  // of pop that was never present here.
  const blendRate =
    attackPhase?.phase === "strike" ? 0.7
    : state === "hit" ? 0.55
    : state === "running" ? 0.85
    : state === "walking" ? 0.6
    : 0.24;
  const skel = useSmoothedPose(targetPose, blendRate);

  const seed = personalitySeed(fighter);
  const aura = computeAuraStyle(fighter, seed);

  const rotation = alive ? 0 : 90;
  const opacity = alive ? 1 : 0.4;
  const transformScale = transforming ? 1.08 : 1;
  const hipY = RIG.HIP_Y + skel.crouch * 14;

  // ---------- forward kinematics ----------
  const waist = { x: 0, y: hipY };
  const chest = up(waist.x, waist.y, skel.waistLean, RIG.CHEST_LEN);
  const neckA = skel.waistLean + skel.chestLean;
  const neck = up(chest.x, chest.y, neckA, RIG.NECK_LEN);
  const headA = neckA + skel.neckTilt + skel.headTilt;
  const head = up(neck.x, neck.y, headA, RIG.HEAD_R + RIG.HEAD_GAP);
  head.y += skel.headBob;
  chest.y += skel.chestBob * 0.6;
  neck.y += skel.chestBob * 0.8;

  const shoulderL = { x: chest.x - RIG.SHOULDER_SPAN * skel.stance, y: chest.y };
  const shoulderR = { x: chest.x + RIG.SHOULDER_SPAN * skel.stance, y: chest.y };
  const elbowL = down(shoulderL.x, shoulderL.y, skel.armL.upper, RIG.UPPER_ARM);
  const handL = down(elbowL.x, elbowL.y, skel.armL.upper + skel.armL.lower, RIG.LOWER_ARM);
  const elbowR = down(shoulderR.x, shoulderR.y, skel.armR.upper, RIG.UPPER_ARM);
  const handR = down(elbowR.x, elbowR.y, skel.armR.upper + skel.armR.lower, RIG.LOWER_ARM);

  const hipL = { x: waist.x - RIG.HIP_SPAN * skel.stance, y: waist.y };
  const hipR = { x: waist.x + RIG.HIP_SPAN * skel.stance, y: waist.y };
  const kneeL = down(hipL.x, hipL.y, skel.legL.upper, RIG.UPPER_LEG);
  const ankleL = down(kneeL.x, kneeL.y, skel.legL.upper + skel.legL.lower, RIG.LOWER_LEG);
  const footTipL = down(ankleL.x, ankleL.y, 90 * (facing >= 0 ? 1 : -1) + skel.footL, RIG.FOOT_LEN);
  const kneeR = down(hipR.x, hipR.y, skel.legR.upper, RIG.UPPER_LEG);
  const ankleR = down(kneeR.x, kneeR.y, skel.legR.upper + skel.legR.lower, RIG.LOWER_LEG);
  const footTipR = down(ankleR.x, ankleR.y, 90 * (facing >= 0 ? 1 : -1) + skel.footR, RIG.FOOT_LEN);

  const auraColor = alive ? blendHex(color, "#E4443B", aura.danger * 0.6) : color;
  const auraRx = 46 * aura.scale;
  const auraRy = 78 * aura.scale;

  // Phase 4F: a bright dot at the exact striking limb during the active
  // strike window — inspired by the reference project's impact indicator,
  // timed to the same "strike" sub-phase animationController.js already
  // tracks (no new timer, no invented data).
  const MELEE_IMPACT_VARIANTS = new Set(["punch", "kick", "uppercut", "roundhouse", "slash"]);
  const KICK_VARIANTS = new Set(["kick", "roundhouse"]);
  const isStriking = alive && state === "attacking" && attackPhase?.phase === "strike" && MELEE_IMPACT_VARIANTS.has(attackPhase.variant);
  const impactPoint = isStriking
    ? KICK_VARIANTS.has(attackPhase.variant)
      ? (facing >= 0 ? footTipR : footTipL)
      : (facing >= 0 ? handR : handL)
    : null;

  return (
    <g transform={`translate(${x}, ${y + skel.hop}) rotate(${rotation}) scale(${transformScale})`} opacity={opacity}>
      {/* Aura glow — spec section 6 (partial): shape/spike-count/pulse-speed
          from each fighter's own generated flavor text (personalitySeed),
          size from energy%, tint from hp% (both Phase 1 fields, already on
          `fighter`). Mana/form/ultimate-charge/rage/reality-instability
          inputs aren't wired — see PHASE_4A_NOTES.md for why. */}
      <ellipse cx={0} cy={hipY} rx={auraRx} ry={auraRy} fill={auraColor} opacity={alive ? (transforming ? 0.32 : 0.16) : 0.06} filter={auraFilterId ? `url(#${auraFilterId})` : undefined}>
        {alive && (
          <animate attributeName="opacity" values={`${transforming ? 0.24 : 0.11};${transforming ? 0.4 : 0.22};${transforming ? 0.24 : 0.11}`} dur={`${aura.pulseMs}ms`} begin={`-${aura.pulseOffsetMs}ms`} repeatCount="indefinite" />
        )}
      </ellipse>
      {(state === "attacking" || state === "running" || state === "flying" || transforming) && alive && (
        <ellipse cx={0} cy={hipY} rx={auraRx + 8} ry={auraRy + 8} fill="none" stroke={transforming ? "#F5E663" : color} strokeWidth={transforming ? 3 : 2} opacity={0.5} />
      )}
      {/* Personality-driven aura spikes — spec section 14: a distinct
          silhouette per generated character, not just per-status rings. */}
      {alive && Array.from({ length: aura.spikes }).map((_, i) => {
        const ang = (i / aura.spikes) * Math.PI * 2 + seed.armCarry * 0.05;
        const r1 = auraRx * 0.72;
        const tip = { x: Math.cos(ang) * (auraRx + 14 * aura.jitter), y: hipY + Math.sin(ang) * (auraRy + 14 * aura.jitter) };
        const base = { x: Math.cos(ang) * r1, y: hipY + Math.sin(ang) * r1 * (auraRy / auraRx) };
        return <line key={`spike-${i}`} x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={1.2} opacity={0.28} strokeLinecap="round" />;
      })}

      {/* Phase 3.95: status-effect aura rings — one thin ring per active, engine-applied status (see statusVisuals.js), never invented by the renderer. Unchanged from 3.95 apart from re-centering on the crouch-adjusted hip. */}
      {alive && statusVisuals.map((v, i) => (
        <ellipse
          key={`${v.label}-${i}`}
          cx={0} cy={hipY}
          rx={58 + i * 8} ry={92 + i * 8}
          fill="none" stroke={v.color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55}
        />
      ))}

      {/* Phase 4C, spec section 16 "After Images" — simplified faded
          silhouettes at recent fast-movement positions, drawn behind the
          current figure. See useAfterImages' comment for why these are a
          simple shape, not duplicate skeletons. */}
      {alive && afterImages.slice(0, -1).map((h, i, arr) => {
        const ageT = Math.min(1, (now - h.t) / 220);
        const op = (1 - ageT) * 0.18 * ((i + 1) / (arr.length + 1));
        return (
          <g key={`ghost-${h.t}`} transform={`translate(${h.x - x}, ${h.y - y})`} opacity={op}>
            <ellipse cx={0} cy={hipY - 40} rx={17} ry={46} fill={color} />
            <circle cx={0} cy={hipY - 90} r={RIG.HEAD_R} fill={color} />
          </g>
        );
      })}

      {/* Phase 4C, spec section 16 "Speed Lines" — radiating opposite the
          travel direction, opacity/reach scaled by real speed. */}
      {alive && speed > 380 && (
        <g opacity={Math.min(1, (speed - 380) / 300)}>
          {[0, 1, 2].map((i) => {
            const yOff = hipY - 20 - i * 30;
            const len = 24 + i * 7;
            const xBase = -facing * 30;
            return <line key={i} x1={xBase} y1={yOff} x2={xBase - facing * len} y2={yOff} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.5 - i * 0.12} />;
          })}
        </g>
      )}

      {/* ---------- Skeleton (spec section 1) ---------- */}
      {/* Legs (drawn first so the torso/arms overlap them at the hip, as before) */}
      <line x1={hipL.x} y1={hipL.y} x2={kneeL.x} y2={kneeL.y} stroke={strokeColor} strokeWidth={3.2} strokeLinecap="round" />
      <line x1={kneeL.x} y1={kneeL.y} x2={ankleL.x} y2={ankleL.y} stroke={strokeColor} strokeWidth={2.7} strokeLinecap="round" />
      <line x1={ankleL.x} y1={ankleL.y} x2={footTipL.x} y2={footTipL.y} stroke={strokeColor} strokeWidth={2.6} strokeLinecap="round" />
      <line x1={hipR.x} y1={hipR.y} x2={kneeR.x} y2={kneeR.y} stroke={strokeColor} strokeWidth={3.2} strokeLinecap="round" />
      <line x1={kneeR.x} y1={kneeR.y} x2={ankleR.x} y2={ankleR.y} stroke={strokeColor} strokeWidth={2.7} strokeLinecap="round" />
      <line x1={ankleR.x} y1={ankleR.y} x2={footTipR.x} y2={footTipR.y} stroke={strokeColor} strokeWidth={2.6} strokeLinecap="round" />

      {/* Torso: waist -> chest -> neck, independently posable per spec section 1 */}
      <line x1={waist.x} y1={waist.y} x2={chest.x} y2={chest.y} stroke={strokeColor} strokeWidth={3.6} strokeLinecap="round" />
      <line x1={chest.x} y1={chest.y} x2={neck.x} y2={neck.y} stroke={strokeColor} strokeWidth={3} strokeLinecap="round" />

      {/* Arms: shoulder -> elbow -> hand, elbow bends relative to the upper arm */}
      <line x1={shoulderL.x} y1={shoulderL.y} x2={elbowL.x} y2={elbowL.y} stroke={strokeColor} strokeWidth={3} strokeLinecap="round" />
      <line x1={elbowL.x} y1={elbowL.y} x2={handL.x} y2={handL.y} stroke={strokeColor} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx={handL.x} cy={handL.y} r={RIG.HAND_R} fill={strokeColor} />
      <line x1={shoulderR.x} y1={shoulderR.y} x2={elbowR.x} y2={elbowR.y} stroke={strokeColor} strokeWidth={3} strokeLinecap="round" />
      <line x1={elbowR.x} y1={elbowR.y} x2={handR.x} y2={handR.y} stroke={strokeColor} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx={handR.x} cy={handR.y} r={RIG.HAND_R} fill={strokeColor} />

      {/* Head */}
      <circle cx={head.x} cy={head.y} r={RIG.HEAD_R} fill="none" stroke={strokeColor} strokeWidth={3} />

      {/* Phase 4F: impact-frame flash at the striking limb, active strike window only */}
      {impactPoint && (
        <>
          <circle cx={impactPoint.x} cy={impactPoint.y} r={9} fill="#FFFFFF" opacity={0.55} />
          <circle cx={impactPoint.x} cy={impactPoint.y} r={4} fill="#FFFFFF" />
        </>
      )}

      {/* Effect / status indicator */}
      {emoji && alive && (
        <text x={head.x} y={head.y - RIG.HEAD_R - 12} textAnchor="middle" fontSize={24}>
          {emoji}
        </text>
      )}
      {isWinner && alive && (
        <text x={head.x} y={head.y - RIG.HEAD_R - 12} textAnchor="middle" fontSize={22}>
          🏆
        </text>
      )}
      {/* Phase 4D, spec section 13: cross-turn hit-streak badge — see
          registerTurnOutcome()'s doc comment in animationController.js for
          why this is a streak counter rather than literal same-turn
          chaining in this strictly-alternating turn structure. */}
      {combo >= 2 && alive && (
        <text x={head.x + RIG.HEAD_R + 8} y={head.y - RIG.HEAD_R + 2} textAnchor="start" fontSize={13} fill="#E8B94A" fontFamily="'IBM Plex Mono', monospace" fontWeight="bold">
          ×{combo}
        </text>
      )}

      {/* Name label */}
      <text x={0} y={FOOT_Y + 18} textAnchor="middle" fontSize={12} fill="#EDEAE3" fontFamily="'IBM Plex Mono', monospace">
        {name}
      </text>

      {/* Mini HP / energy bars above the head */}
      <g transform={`translate(${-26}, ${head.y - RIG.HEAD_R - 22})`}>
        <rect x={0} y={0} width={52} height={5} rx={2.5} fill="#23282f" />
        <rect x={0} y={0} width={52 * hpPct} height={5} rx={2.5} fill={hpPct > 0.3 ? "#3ECF8E" : "#E4443B"} />
        <rect x={0} y={8} width={52} height={4} rx={2} fill="#23282f" />
        <rect x={0} y={8} width={52 * energyPct} height={4} rx={2} fill={color} />
      </g>

      {!alive && (
        <text x={0} y={hipY} textAnchor="middle" fontSize={20} transform={`rotate(-${rotation})`}>
          💀
        </text>
      )}
    </g>
  );
}
