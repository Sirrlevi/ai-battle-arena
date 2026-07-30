// ---------- ARENA MODULE ----------
// Renders the static backdrop, then a camera-transformed scene group
// containing every fighter's Stickman, in-flight projectiles, and floating
// damage numbers. The backdrop deliberately sits OUTSIDE the camera
// transform (so panning/zooming doesn't drag the arena walls with it) while
// everything that moves lives inside it. Still fully responsive: the SVG
// viewBox is fixed and CSS scales the whole thing to its container.
//
// Phase 4C (spec sections 11 + 16) additions: camera rotation folded into
// the same scene transform (pivoting around the viewport's own center, so
// it reads as a tilt rather than a swing around a corner); a real
// directional motion-blur filter (the field existed since Phase 3.95 but
// nothing ever rendered it — this finally does); a second, stronger bloom
// filter for transformation/victory moments, alongside the original aura
// filter which is completely unchanged; and a chromatic-pulse overlay for
// the biggest camera moments. Every one of these is opt-in on a >0 field
// already decaying in cameraController.js — with no active event, the
// Arena renders pixel-identical to before this phase.

import Stickman from "./Stickman.jsx";
import Projectile from "./Projectile.jsx";
import DamageNumber from "./DamageNumber.jsx";
import Particle from "./Particle.jsx";
import { ARENA_WIDTH, ARENA_HEIGHT, GROUND_Y } from "../lib/battleState.js";

export default function Arena({ fighters, poses = {}, activeEffects = {}, camera, projectiles = [], damageNumbers = [], particles = [], statusVisualsByFighter = {}, isWinnerByFighter = {} }) {
  const cam = camera || { x: ARENA_WIDTH / 2, zoom: 1, shakeOffsetX: 0, shakeOffsetY: 0 };
  const shakeX = cam.shakeOffsetX || 0;
  const shakeY = cam.shakeOffsetY || 0;
  const pivotX = ARENA_WIDTH / 2 + shakeX;
  const pivotY = ARENA_HEIGHT + shakeY;
  // Phase 4C: rotation sits between the pivot translate and the zoom scale
  // so a brief tilt pivots around the viewport's own center-bottom instead
  // of swinging around the SVG's (0,0) corner. Identical output to before
  // this phase whenever cam.rotation is 0 (the default/decayed-out state).
  const sceneTransform = `translate(${pivotX}, ${pivotY}) rotate(${cam.rotation || 0}) scale(${cam.zoom}) translate(${-cam.x}, ${-ARENA_HEIGHT})`;
  const motionBlurAmount = Math.max(0, cam.motionBlur || 0);

  return (
    <div className="w-full rounded-lg overflow-hidden" style={{ border: "1px solid #23282f", background: "#0A0C0F" }}>
      <svg viewBox={`0 0 ${ARENA_WIDTH} ${ARENA_HEIGHT}`} className="w-full h-auto block" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="arenaVoid" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#181b21" />
            <stop offset="100%" stopColor="#0A0C0F" />
          </radialGradient>
          <filter id="stickmanAuraBlur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          {/* Phase 4C, spec section 16 "Bloom" — a stronger, brightened
              glow reserved for transformation/victory moments. The
              original stickmanAuraBlur above is untouched, so every
              fighter's ordinary aura looks exactly as it did before. */}
          <filter id="bigBloomFilter" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="18" result="blurred" />
            <feComponentTransfer in="blurred" result="brightened">
              <feFuncA type="linear" slope="1.5" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="brightened" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Phase 4C, spec section 16 "Motion Blur" — a real directional
              blur, finally rendering the motionBlur field cameraController
              has decayed since 3.95 with nothing consuming it. Amount is
              bound live to the camera's current value, so it eases in/out
              with the same decay rather than snapping on/off. */}
          <filter id="motionBlurFilter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={`${motionBlurAmount * 7} 0.4`} />
          </filter>
          <linearGradient id="groundFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1e24" stopOpacity="0" />
            <stop offset="100%" stopColor="#1a1e24" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Static "Void Arena" backdrop — outside the camera transform */}
        <rect x={0} y={0} width={ARENA_WIDTH} height={ARENA_HEIGHT} fill="url(#arenaVoid)" />
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`v${i}`} x1={(ARENA_WIDTH / 8) * i} y1={0} x2={(ARENA_WIDTH / 8) * i} y2={GROUND_Y} stroke="#1c2027" strokeWidth={1} />
        ))}
        <rect x={0} y={GROUND_Y} width={ARENA_WIDTH} height={ARENA_HEIGHT - GROUND_Y} fill="url(#groundFade)" />
        <line x1={0} y1={GROUND_Y} x2={ARENA_WIDTH} y2={GROUND_Y} stroke="#2a2f38" strokeWidth={2} />
        <text x={ARENA_WIDTH / 2} y={26} textAnchor="middle" fontSize={11} fill="#4a5058" fontFamily="'IBM Plex Mono', monospace" letterSpacing={2}>
          THE VOID ARENA
        </text>

        {/* Camera-driven scene: fighters, projectiles, damage numbers */}
        <g transform={sceneTransform} filter={motionBlurAmount > 0.04 ? "url(#motionBlurFilter)" : undefined}>
          {projectiles.map((p) => (
            <Projectile key={p.id} projectile={p} />
          ))}

          {fighters.map((f) => (
            <Stickman
              key={f.key}
              fighter={f}
              pose={poses[f.key]}
              auraFilterId={poses[f.key]?.state === "transforming" || isWinnerByFighter[f.key] ? "bigBloomFilter" : "stickmanAuraBlur"}
              effectType={activeEffects[f.key] || null}
              statusVisuals={statusVisualsByFighter[f.key] || []}
              isWinner={isWinnerByFighter[f.key] || false}
            />
          ))}

          {damageNumbers.map((d) => (
            <DamageNumber key={d.id} x={d.x} y={d.y} text={d.text} color={d.color} />
          ))}

          {particles.map((p) => (
            <Particle key={p.id} particle={p} />
          ))}
        </g>

        {/* Phase 3.95 camera-snap flash (teleport events) — outside the scene transform so it reads as a full-screen cut, not a world-space effect. */}
        {cam.snapFlash > 0 && (
          <rect x={0} y={0} width={ARENA_WIDTH} height={ARENA_HEIGHT} fill="#FFFFFF" opacity={cam.snapFlash * 0.35} />
        )}

        {/* Phase 4C, spec section 16 "Chromatic Distortion" — a stylized
            approximation (two tinted, screen-blended, offset rects), not
            literal per-channel splitting: a real feColorMatrix-based split
            applied to this whole complex scene graph every frame would be
            meaningfully more expensive for a brief, subtle effect. Reserved
            for the biggest moments (ultimate-cam) via cam.chromaticPulse. */}
        {cam.chromaticPulse > 0.02 && (
          <>
            <rect x={-5} y={0} width={ARENA_WIDTH} height={ARENA_HEIGHT} fill="#FF3B5C" opacity={cam.chromaticPulse * 0.12} style={{ mixBlendMode: "screen" }} />
            <rect x={5} y={0} width={ARENA_WIDTH} height={ARENA_HEIGHT} fill="#3BE0FF" opacity={cam.chromaticPulse * 0.12} style={{ mixBlendMode: "screen" }} />
          </>
        )}
      </svg>
    </div>
  );
}
