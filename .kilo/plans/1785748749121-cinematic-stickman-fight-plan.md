# Cinematic Stickman Fighting Arena — Full Production Upgrade Plan

## Goal

Transform the existing AI Battle Arena into a **cinematic, action-packed, brutal stickman fighting game** with YouTube-style stickman fight aesthetics, while keeping the core architecture intact:
- Frontend (Vite + React) on Vercel
- Backend (Express) on Render
- API-driven AI fight engine (LLM providers)
- Deterministic combat engine

## Current State Assessment

The codebase already has a solid foundation (Phase 1–4D):
- **Frontend**: Vite + React, SVG-based rendering, jointed skeleton (Phase 4A), particle system, projectile manager, camera controller, animation event bus
- **Backend**: Express with session management, LLM provider proxying, deterministic combat engine (Phase 3.8), defense packets (Phase 3.9), combat profiles/tiers
- **100-power catalog** (`powerCatalog.js`) already exists with VFX mappings
- **Animation system**: characterAnimation.js has idle, walk, run, jump, fly, hover, block, hit, transform, dead, victory + melee poses (punch, kick, slash, uppercut, roundhouse) + cast poses

## What Needs Improvement

### 1. Stickman Rendering — More Realistic & Brutal
**Current**: Simple 2-3px SVG strokes, basic circles for joints
**Target**: YouTube stickman fight style (thicker strokes, tapered limbs, dynamic width, more joints)

Changes:
- **`frontend/src/lib/characterAnimation.js`**: Add more joint detail (elbow/knee caps, fist outlines, foot rotation, neck pivot, shoulder shrug)
- **`frontend/src/components/Stickman.jsx`**: 
  - Stroke width varies by segment (torso 4-6px, limbs 2.5-4px tapered)
  - Add joint dots/circles at elbows/knees/hands/feet
  - Add "impact distortion" — limbs stretch on heavy hits (scale factor based on `hitMagnitude`)
  - Add "windup distortion" — torso compresses during charge-ups
  - Fighting stance idle (slight crouch, guard up, weighted feel) instead of casual idle
- Add `skeletonRig.js` enhancements for more anatomical proportions

### 2. Animation — Cinematic & Action-Packed
**Current**: Basic windup/strike/recovery, smooth but simple
**Target**: More keyframes, anticipation, follow-through, impact freeze, screen shake sync

Changes:
- **`frontend/src/lib/characterAnimation.js`**:
  - Add **anticipation poses** (windup windup — pull back before strike)
  - Add **follow-through poses** (over-extension then recovery)
  - Add **impact stagger** (whole-body recoil with joint-specific flinch)
  - Add **ground pound** recovery (knee bend + fist on ground)
  - Add **air combo** poses (tucked, spread-eagle, spiral)
  - Add **block impact** pose (arms absorbed, body pushed back)
  - Add **dodge roll** / sidestep poses
  - Add **victory taunt** poses per personality
- **`frontend/src/lib/animationController.js`**:
  - Add `anticipationPhase` before windup for charged/ultimate moves
  - Add `followThroughPhase` after strike
  - Impact freeze timing tied to actual animation peak, not just a fixed timer
  - Combo chain animations (if fighter lands 3+ hits, transition to combo finisher pose)
  - Add `stun` animation state (dizzy stagger, X eyes)

### 3. VFX & Particles — Explosive, Layered, Screen-Filling
**Current**: Basic particle bursts, simple shapes
**Target**: YouTube fight VFX — shockwaves, debris clouds, afterimages, screen shake, light pillars, ground cracks

Changes:
- **`frontend/src/lib/particleSystem.js`**:
  - Increase pool size from 220 → 500
  - Add new emitter profiles: `shockwave`, `ground_crack`, `debris_cloud`, `afterimage`, `spark_burst`, `blood_spray`, `energy_ring`, `light_pillar`, `smoke_trail`, `ember`
  - Particle gravity per type (rocks fall, embers rise, smoke drifts)
  - Particle rotation for non-circular shapes
  - Add particle lifetime curves (fade-out with easing, not linear)
  - Particle color transition over lifetime (hot→cool, bright→dim)
- **`frontend/src/components/Particle.jsx`**:
  - Draw particles with glow, blur, trails
  - Ring particles animate their radius outward
  - Blood/slash particles orient along impact normal
- **`frontend/src/components/Projectile.jsx`**:
  - Add new projectile shapes: `spiral`, `beam_wide`, `meteor`, `spirit_wave`, `bone_spike`
  - Projectile trail rendering (not just particles — actual trail geometry)
  - Projectile distortion on death (splatter, shatter, dissipate)
- **`frontend/src/lib/powerCatalog.js`**:
  - Expand from ~100 to 200+ powers
  - Add new categories: `blood_magic`, `nature_growth`, `tech_weapon`, `void_dark`, `celestial`
  - Each power gets: `vfxTier` (light/medium/heavy/massive), `screenShake`, `particleCount`, `colorShift`, `trailLength`

### 4. Fighting Engine — More Powers, Realistic Physics, Brutal Combat
**Current**: Basic punch/kick/slash, standard damage, simple knockback
**Target**: Wider move set, stance system, guard break, counter windows, finishers

Changes:
- **`frontend/src/lib/battleEngine.js`**:
  - Add **stance system**: `aggressive` (more damage, less defense), `defensive` (more guard, less speed), `balanced`
  - Add **guard break** mechanic: after 3 blocked hits, guard breaks, stuns defender
  - Add **counter window**: defender can counter if they Defend within 0.3s of attack landing
  - Add **finisher** system: if HP < 20%, attacker can execute cinematic finisher
  - Add **environment interaction**: fighters can be knocked into walls, off ledges
  - Add **stamina** drain for sprinting/attacking; exhausted fighters move slower
  - Add **bleed** status (damage over time, visual blood drip)
  - Add **stagger** state (temporary inability to act)
- **`frontend/src/lib/powerCatalog.js`**:
  - Add power **archetypes**: `grappler` (throws, suplexes), `boxer` (jabs, combos, uppercuts), `swordsman` (slashes, flourishes, iaijutsu), `brawler` (wild punches, headbutts, elbows), `martial_artist` (precise strikes, pressure points, flips)
  - Add **combo chains**: predefined sequences that unlock if previous hit connected
  - Add **ultimate** classification with charged build-up + cinematic resolution
- **`backend/src/lib/combat/combatEngine.js`**:
  - Add `combatStyle` modifier to damage formula
  - Add `weapon` reach/damage modifiers
  - Add `stance` resource with mechanical effects
  - Add `guardBreak` detection and state
  - Add `counterWindow` timing

### 5. Background & Environment — Cinematic Arena
**Current**: Simple void with grid lines, flat gradient ground
**Target**: Multi-layered parallax, atmospheric effects, interactive environment

Changes:
- **`frontend/src/components/Arena.jsx`**:
  - Add **3 parallax layers**: far background (mountains/city skyline), mid (ruins/trees), near (arena walls/debris)
  - Add **atmospheric particles**: dust motes, rain, snow (configurable per arena theme)
  - Add **dynamic lighting**: light sources cast radial gradients that shift with action
  - Add **ground details**: texture pattern, impact marks that persist during fight
  - Add **arena themes**: `void`, `dojo`, `ruins`, `arena_colosseum`, `cyber_city`, `dark_forest`
  - Add **camera angle variants**: side view (default), low angle (epic), high angle (overview)
- Add `background` + `environment` fields to fighter objects (each AI-generated character suggests their preferred arena)

### 6. Camera — Cinematic, Dynamic, Reactive
**Current**: Simple follow + shake/zoom events
**Target**: Movie-like camera with dramatic angles, slow-motion, whip pans

Changes:
- **`frontend/src/lib/cameraController.js`**:
  - Add **slow-motion triggers** for finishers/ultimates (0.3x speed, 1.5s duration)
  - Add **whip pan** for teleport/behind strikes (fast horizontal snap)
  - Add **dolly zoom** for lethal hits (push in while zooming out slightly)
  - Add **rack focus** — blur background fighter, keep attacker sharp
  - Add **cinematic bars** (letterbox) for ultimates
  - Add **camera collision** — don't zoom past arena bounds

### 7. Sound Effects — Full Audio Feedback
**Current**: Audio cue names logged but no actual audio
**Target**: Procedural + sampled SFX for every action

Changes:
- **New**: `frontend/src/lib/audioEngine.js` (new file)
  - Web Audio API based (no external assets needed for core loop)
  - **Procedural SFX** (synthesized):
    - Punch: low thud + click (body + bone)
    - Kick: deeper thud + whoosh
    - Block: metallic ring + grunt
    - Beam: sustained synth tone + crackle
    - Explosion: noise burst + low boom
    - Teleport: zap + displacement
    - Footstep: soft thud (scaled by speed)
    - Hit reaction: grunt (pitch varies by damage)
    - Lethal: long low boom + silence
  - **Optional sample-based SFX** (user-configurable toggle):
    - Load short `.wav`/`.mp3` files from `/public/audio/sfx/`
    - Fallback to procedural if samples missing
  - Add **spatial audio** (pan based on fighter position relative to center)
  - Add **audio ducking** — music fades during intense moments
- **`frontend/src/lib/animationEventBus.js`**: Wire existing `SOUND_CUE` names to `audioEngine.play(cue)`

### 8. Music Composition — Dynamic Battle Soundtrack
**Current**: No music
**Target**: Adaptive music that shifts with fight intensity

Changes:
- **New**: `frontend/src/lib/musicEngine.js` (new file)
  - Web Audio API oscillators + noise for procedural music (no external files required)
  - **3 intensity layers**:
    - Layer 1 (ambient): slow bass pulse + atmospheric pad
    - Layer 2 (mid): rhythmic percussion + melody
    - Layer 3 (intense): full drums + lead synth
  - Layers fade in/out based on:
    - Damage dealt per second
    - Distance between fighters
    - Current HP %
    - Ultimate charging
  - **Per-fighter theme seeds**: each fighter's `name` + `personality` + `aura` seeds the key/mode/instrument (deterministic, so same fighter = same theme)
  - **Victory theme**: triumphant fanfare on win
  - **Defeat theme**: descending, somber
  - Music toggle button in HUD (mute/unmute)

### 9. UI/HUD — Brutal, Cinematic, Production-Ready
**Current**: Clean minimal HUD with IBM Plex Mono
**Target**: Aggressive HUD with damage indicators, combo counters, cinematic text

Changes:
- **`frontend/src/components/HUD.jsx`**:
  - Add **damage flash** on HP bar (red pulse when taking damage)
  - Add **energy surge** glow when energy is high
  - Add **combo counter** with cinematic pop animation (scale + glow)
  - Add **status effect icons** on HUD (not just on character)
  - Add **round indicator** with dramatic reveal animation
  - Add **turn timer** bar (shows AI "thinking" time)
  - Add **hit log** ticker at bottom (scrolling recent hits)
- **`frontend/src/components/DamageNumber.jsx`**:
  - Larger, more dramatic numbers
  - Color-coded: white (normal), red (critical), gold (lethal), blue (heal)
  - Numbers "fall" and fade with gravity
  - Add **damage pop** — number scales up then settles
  - Add **combo chain** — consecutive hit numbers chain together
- **`frontend/src/App.jsx`**:
  - Add **cinematic intro** animation when battle starts
  - Add **round transition** screen (brief pause + "ROUND X" text)
  - Add **victory screen** with winner portrait + stats
  - Add **skip/replay** controls for recorded fights

### 10. Physics & Motion — More Realistic
**Current**: Basic velocity, simple knockback, wall clamp
**Target**: Momentum preservation, ground friction, impact reactions, ragdoll-ish death

Changes:
- **`frontend/src/lib/movementController.js`**:
  - Add **momentum carry-over** — attacks launched while dashing inherit velocity
  - Add **air resistance** — fighters slow down in air
  - Add **ground friction** — fighters slide to stop on impact
  - Add **wall bounce** with energy loss
  - Add **recoil** — firing heavy projectiles pushes attacker back
- **`frontend/src/lib/collisionSystem.js`**:
  - Add **fighter-to-fighter collision** — fighters cannot pass through each other (push apart)
  - Add **fighter-to-projectile collision** (projectiles can be knocked aside)
- **`frontend/src/lib/battleState.js`**:
  - Add `momentumX`, `momentumY` to fighter state
  - Add `stance` field (aggressive/defensive/balanced)

### 11. Backend — Expanded Combat & Profiles
**Current**: Basic combat profiles, 5 ability tiers, standard damage
**Target**: Richer profiles, more abilities, stance mechanics, guard break

Changes:
- **`backend/src/lib/combat/combatEngine.js`**:
  - Add `stance` to CombatProfile with mechanical bonuses
  - Add `combatStyle` damage modifiers
  - Add `weapon` properties (reach, speed, damage type)
  - Add `guardBreak` detection (track consecutive blocks)
  - Add `counterWindow` timing
  - Add `finisher` eligibility check
- **`backend/src/lib/combat/abilityRegistry.js`**:
  - Add `archetype` field (boxer/swordsman/brawler/etc.)
  - Add `comboChain` linking abilities
  - Add `ultimate` flag + `chargeTime`
  - Expand ability auto-derivation from AI flavor text
- **`backend/src/lib/combat/validation.js`**:
  - Add stance validation
  - Add guard break validation
  - Add combo chain validation

### 12. Backend AI Prompting — Cinematic Narration
**Current**: Basic combat prompts
**Target**: Prompts that encourage cinematic, brutal, creative descriptions

Changes:
- **`backend/src/lib/promptManager.js`**:
  - Add "cinematic mode" instruction to prompts
  - Encourage vivid action descriptions, impact details, environment use
  - Encourage creative ability naming and combo chaining
  - Add personality-driven combat style instructions

## Implementation Order

### Phase 1: Visual Foundation (Stickman + Animations + VFX)
1. Enhance stickman rendering (`Stickman.jsx`, `characterAnimation.js`)
2. Add new animation poses (anticipation, follow-through, combo, stun)
3. Expand particle system (new emitters, better visuals)
4. Add new projectile shapes

### Phase 2: Camera & Environment
5. Expand camera system (slow-mo, whip pan, dolly zoom, cinematic bars)
6. Add parallax backgrounds + arena themes
7. Add atmospheric effects

### Phase 3: Audio
8. Create `audioEngine.js` with procedural SFX
9. Wire SFX to animation events
10. Create `musicEngine.js` with adaptive soundtrack

### Phase 4: Combat Depth
11. Expand backend combat engine (stances, guard break, counters, finishers)
12. Expand `powerCatalog.js` to 200+ powers
13. Add combo system
14. Add environment interaction

### Phase 5: Polish & Production
15. Enhance HUD with brutal/cinematic styling
16. Add cinematic intro/round transitions/victory screen
17. Add fight recording improvements
18. Performance optimization (particle pooling, render batching)
19. Test on Vercel + Render
20. Final polish pass

## Technical Constraints (Do Not Break)

- **Frontend**: Vite + React, no framework changes
- **Backend**: Express, no framework changes
- **Deployment**: Vercel (frontend) + Render (backend) — preserve `vercel.json` + `render.yaml`
- **API contract**: Preserve `/api/session`, `/api/battle-turn`, `/api/generate-character` endpoints and their response shapes
- **State management**: Keep client-side deterministic game loop + server-side LLM calls separation

## Key Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/components/Stickman.jsx` | Realistic rendering, joint dots, impact distortion |
| `frontend/src/lib/characterAnimation.js` | +anticipation, follow-through, combo, stun poses |
| `frontend/src/lib/animationController.js` | New animation phases, combo logic |
| `frontend/src/lib/animationStateMachine.js` | New states (combo, stunned, finisher) |
| `frontend/src/lib/particleSystem.js` | +emitters, pool size, lifetime curves |
| `frontend/src/components/Particle.jsx` | Glow, rotation, trails |
| `frontend/src/components/Projectile.jsx` | +shapes, trails, distortion |
| `frontend/src/lib/powerCatalog.js` | 200+ powers, new categories |
| `frontend/src/lib/battleEngine.js` | Stances, guard break, counters, finishers |
| `frontend/src/lib/battleState.js` | Momentum, stance fields |
| `frontend/src/lib/movementController.js` | Momentum, friction, air resistance |
| `frontend/src/lib/collisionSystem.js` | Fighter collision |
| `frontend/src/lib/cameraController.js` | Slow-mo, whip pan, dolly zoom |
| `frontend/src/components/Arena.jsx` | Parallax, themes, lighting |
| `frontend/src/components/HUD.jsx` | Brutal styling, damage flash |
| `frontend/src/components/DamageNumber.jsx` | Dramatic numbers with physics |
| `frontend/src/lib/audioEngine.js` | NEW: procedural SFX |
| `frontend/src/lib/musicEngine.js` | NEW: adaptive soundtrack |
| `backend/src/lib/combat/combatEngine.js` | Stances, guard break, finishers |
| `backend/src/lib/combat/abilityRegistry.js` | Archetypes, combos, ultimates |
| `backend/src/lib/combat/validation.js` | Stance + guard break validation |
| `backend/src/lib/promptManager.js` | Cinematic prompt instructions |

## New Files

| Path | Purpose |
|------|---------|
| `frontend/src/lib/audioEngine.js` | Web Audio SFX engine |
| `frontend/src/lib/musicEngine.js` | Adaptive procedural music |
| `frontend/public/audio/sfx/` | Optional sample SFX directory |
| `frontend/src/lib/screenEffects.js` | Vignette, chromatic aberration, letterbox |
| `frontend/src/lib/comboSystem.js` | Combo tracking + chain resolution |
| `backend/src/lib/combat/stanceSystem.js` | Stance definitions + bonuses |
| `backend/src/lib/combat/finisherEngine.js` | Finisher eligibility + cinematic resolution |

## Validation Plan

1. **Unit tests**: battleEngine resolveAction, animationController state transitions, particle system pool
2. **Visual regression**: Screenshot comparison at key moments (idle, punch, explosion, death)
3. **Audio regression**: Verify SFX fires on every animation event, no missing cues
4. **Performance**: 60fps target with 500 particles + 2 fighters + 3 projectiles on screen
5. **API contract**: All existing endpoints return same JSON shape
6. **Deployment**: Vercel + Render deploy succeeds with same config

## Risks

1. **Performance**: Adding 500 particles + new effects may drop frames on mobile — mitigate with quality scaling
2. **Audio autoplay**: Browsers block audio until user interaction — add "Click to enable audio" gate
3. **Bundle size**: New assets + engines may exceed Vercel limits — code-split audio engine
4. **Backend prompt quality**: AI-generated fight descriptions vary — add stronger prompt scaffolding
