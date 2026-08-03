# Cinematic Stickman Fighting Arena — Execution Plan

## Goal

Make the existing AI Battle Arena feel like a brutal, cinematic YouTube stickman fight video without changing core architecture (Vite + React, Express, Vercel + Render, API fight loop).

## Decision: Audio = Procedural-Only

No sample files, no `/public/audio/sfx/` directory, no toggle logic for missing assets. Web Audio API synthesizes all SFX + music. Keeps Vercel deploy simple, zero asset management, works offline.

## Non-Negotiable Constraints

- Do NOT change: Vite/React, Express, vercel.json, render.yaml
- Do NOT break: `/api/session`, `/api/battle-turn`, `/api/generate-character` response shapes
- Do NOT break: client-side deterministic game loop + server-side LLM call separation

## Execution Order

### Step 1: Frontend Visual Upgrade (no backend changes)
Files:
- `frontend/src/components/Stickman.jsx` — thicker tapered strokes, joint dots, impact stretch, fighting stance idle
- `frontend/src/lib/characterAnimation.js` — add anticipation, follow-through, combo, stun, air-combo poses
- `frontend/src/lib/animationController.js` — new phases for anticipation/follow-through, combo chaining
- `frontend/src/lib/animationStateMachine.js` — add states: `combo`, `stunned`, `finisher`
- `frontend/src/lib/particleSystem.js` — pool 220→500, add emitters: `shockwave`, `ground_crack`, `debris_cloud`, `blood_spray`, `spark_burst`, `afterimage`, `light_pillar`, `ember`
- `frontend/src/components/Particle.jsx` — glow, rotation, ring expansion, color fade
- `frontend/src/components/Projectile.jsx` — add shapes: `spiral`, `beam_wide`, `meteor`, `bone_spike`, `spirit_wave`

### Step 2: Camera + Environment
Files:
- `frontend/src/lib/cameraController.js` — slow-motion (0.3x, 1.5s) on ultimates, whip pan on teleport, dolly zoom on lethal, cinematic bars
- `frontend/src/components/Arena.jsx` — 3-layer parallax, arena themes (void, dojo, ruins, colosseum, cyber, forest), atmospheric particles, impact marks

### Step 3: Audio (new files only, no existing file breakage)
New:
- `frontend/src/lib/audioEngine.js` — Web Audio procedural SFX (punch, kick, block, beam, explosion, teleport, footstep, hit reaction, lethal). Spacial pan based on fighter X position.
- `frontend/src/lib/musicEngine.js` — 3-layer adaptive procedural music (ambient pad, percussion, lead synth). Per-fighter seeded themes. Victory/defeat themes.
Wiring:
- `frontend/src/lib/animationEventBus.js` — emit `audioEngine.play(cue)` on every existing `SOUND_CUE` event

### Step 4: Backend Combat Depth
Files:
- `backend/src/lib/combat/combatEngine.js` — add stance bonus, guardBreak detection, counterWindow, finisher eligibility, bleed status, stagger state
- `backend/src/lib/combat/abilityRegistry.js` — add `archetype`, `comboChain`, `ultimate` flag, `chargeTime`
- `backend/src/lib/combat/validation.js` — stance validation, guardBreak validation
- `backend/src/lib/promptManager.js` — cinematic mode prompt scaffolding (no LLM behavior change, just stronger instruction text)

### Step 5: HUD + Polish
Files:
- `frontend/src/components/HUD.jsx` — damage flash, energy surge, combo pop, status icons, round reveal, turn timer, hit log ticker
- `frontend/src/components/DamageNumber.jsx` — larger dramatic numbers, color-coded, gravity fall, pop-in scale, combo chain
- `frontend/src/App.jsx` — cinematic intro, round transition screen, victory screen

## Validation

1. `npm run build` succeeds in both `frontend/` and `backend/`
2. All existing API endpoints return identical JSON shapes
3. Frontend dev server loads without console errors
4. Battle loop runs 10+ turns without frame drops (60fps target)
5. Audio cues fire on every animation event (no null references)
6. Vercel + Render deploy succeeds with same `vercel.json` + `render.yaml`

## Risk Mitigation

- **Bundle size**: code-split `audioEngine.js` + `musicEngine.js` via dynamic import in `App.jsx`
- **Audio autoplay**: gate audio context initialization on first user click (Start Battle button)
- **Performance**: particle pool starts at 220, only expands to 500 if `deviceMemory > 4` or screen width > 1024px
- **Backend prompt quality**: prompt scaffolding is additive only; if LLM ignores it, engine still resolves deterministically
