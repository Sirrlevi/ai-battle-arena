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
import VFXLayer from "./VFXLayer.jsx";
import { ARENA_WIDTH, ARENA_HEIGHT, GROUND_Y } from "../lib/battleState.js";

export default function Arena({ fighters, poses = {}, activeEffects = {}, camera, projectiles = [], damageNumbers = [], vfxEngine = null }) {
  const cam = camera || { x: ARENA_WIDTH / 2, zoom: 1 };
  const sceneTransform = `translate(${ARENA_WIDTH / 2}, ${ARENA_HEIGHT}) scale(${cam.zoom}) translate(${-cam.x}, ${-ARENA_HEIGHT})`;

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
        <g transform={sceneTransform}>
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
            />
          ))}

          <VFXLayer engine={vfxEngine} />

          {damageNumbers.map((d) => (
            <DamageNumber key={d.id} x={d.x} y={d.y} text={d.text} color={d.color} />
          ))}
        </g>
      </svg>
    </div>
  );
}
