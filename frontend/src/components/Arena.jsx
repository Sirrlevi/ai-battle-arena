// ---------- ARENA MODULE ----------
// Renders the static backdrop and lays out every fighter's Stickman at its
// stored spawn position. Fully responsive: the SVG's viewBox is fixed, and
// CSS scales the whole thing to its container, so the exact same markup
// works on a phone or a desktop without extra breakpoints. Works for any
// roster size — it just maps over whatever `fighters` array it's given.

import Stickman from "./Stickman.jsx";
import { ARENA_WIDTH, ARENA_HEIGHT, GROUND_Y } from "../lib/battleState.js";

export default function Arena({ fighters, activeActorKey = null, activeEffects = {} }) {
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

        {/* Static "Void Arena" backdrop */}
        <rect x={0} y={0} width={ARENA_WIDTH} height={ARENA_HEIGHT} fill="url(#arenaVoid)" />
        {Array.from({ length: 9 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={(ARENA_WIDTH / 8) * i}
            y1={0}
            x2={(ARENA_WIDTH / 8) * i}
            y2={GROUND_Y}
            stroke="#1c2027"
            strokeWidth={1}
          />
        ))}
        <rect x={0} y={GROUND_Y} width={ARENA_WIDTH} height={ARENA_HEIGHT - GROUND_Y} fill="url(#groundFade)" />
        <line x1={0} y1={GROUND_Y} x2={ARENA_WIDTH} y2={GROUND_Y} stroke="#2a2f38" strokeWidth={2} />
        <text x={ARENA_WIDTH / 2} y={26} textAnchor="middle" fontSize={11} fill="#4a5058" fontFamily="'IBM Plex Mono', monospace" letterSpacing={2}>
          THE VOID ARENA
        </text>

        {/* Fighters — any roster size, positions come from battleState */}
        {fighters.map((f) => (
          <Stickman
            key={f.key}
            fighter={f}
            auraFilterId="stickmanAuraBlur"
            isActing={activeActorKey === f.key}
            effectType={activeEffects[f.key] || null}
          />
        ))}
      </svg>
    </div>
  );
}
