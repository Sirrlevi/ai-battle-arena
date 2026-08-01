// ---------- ARENA MODULE ----------
// Renders the static backdrop, then a camera-transformed scene group
// containing every fighter's Stickman, in-flight projectiles, and floating
// damage numbers. The backdrop deliberately sits OUTSIDE the camera
// transform (so panning/zooming doesn't drag the arena walls with it) while
// everything that moves lives inside it. Still fully responsive: the SVG
// viewBox is fixed and CSS scales the whole thing to its container.

import Stickman from "./Stickman.jsx";
import Projectile from "./Projectile.jsx";
import DamageNumber from "./DamageNumber.jsx";
import Particle from "./Particle.jsx";
import { ARENA_WIDTH, ARENA_HEIGHT, GROUND_Y } from "../lib/battleState.js";

export default function Arena({ fighters, poses = {}, activeEffects = {}, camera, projectiles = [], damageNumbers = [], particles = [], statusVisualsByFighter = {}, isWinnerByFighter = {} }) {
  const cam = camera || { x: ARENA_WIDTH / 2, zoom: 1, shakeOffsetX: 0, shakeOffsetY: 0 };
  const shakeX = cam.shakeOffsetX || 0;
  const shakeY = cam.shakeOffsetY || 0;
  // A brief directed "punch" toward a recent impact point, additive on top
  // of the normal follow/zoom (see triggerCameraEvent's "impact-zoom" case
  // in cameraController.js) — punchX pulls the view a little further
  // toward where the hit landed, punchZoom pushes in slightly.
  const punchX = (cam.punchInIntensity || 0) * (cam.punchInDir || 0);
  const zoom = cam.zoom + (cam.punchInZoom || 0);
  const sceneTransform = `translate(${ARENA_WIDTH / 2 + shakeX}, ${ARENA_HEIGHT + shakeY}) scale(${zoom}) translate(${-cam.x - punchX}, ${-ARENA_HEIGHT})`;
  // motionBlur has existed on the camera object since Phase 3.95 but was
  // never actually applied to anything — wired up here as a horizontal
  // Gaussian blur on the whole scene (horizontal-only since the camera
  // itself only ever pans/shakes horizontally), intensity tied directly to
  // cam.motionBlur so it reads as a quick streak-blur, not a held filter.
  const motionBlurAmount = (cam.motionBlur || 0) * 6;

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
          <filter id="cameraMotionBlur" x="-30%" y="-10%" width="160%" height="120%">
            <feGaussianBlur stdDeviation={`${motionBlurAmount} 0`} />
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
        <g transform={sceneTransform} filter={motionBlurAmount > 0.15 ? "url(#cameraMotionBlur)" : undefined}>
          {projectiles.map((p) => (
            <Projectile key={p.id} projectile={p} />
          ))}

          {fighters.map((f) => (
            <Stickman
              key={f.key}
              fighter={f}
              pose={poses[f.key]}
              auraFilterId="stickmanAuraBlur"
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
        {/* Impact-frame flash — a warmer, snappier hit-scaled flash for
            heavy/critical/lethal strikes, distinct from the teleport-only
            snapFlash above so the two read as different events. */}
        {cam.impactFlash > 0 && (
          <rect x={0} y={0} width={ARENA_WIDTH} height={ARENA_HEIGHT} fill="#FFD9B0" opacity={cam.impactFlash * 0.3} />
        )}
      </svg>
    </div>
  );
}
