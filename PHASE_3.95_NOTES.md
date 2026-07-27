# Phase 3.95 — Animation Sync Engine

Entirely frontend. Nothing in `backend/` changed for this phase.

## The core problem this fixes

Before this phase, `lib/actionInterpreter.js` decided what animation to play
by keyword-matching the AI's flavor text ("laser" → beam, "punch" → punch,
etc.) — the renderer was, in the spec's words, inventing combat instead of
visualizing it. The resolved battle-log `entry` already carried the real
Combat Engine verdict (Phase 3.8/3.9's `entry.verdict`, `entry.statusApplied`,
`entry.defense`, `entry.counterDamage`...) but nothing downstream actually
read it for animation purposes.

## What's new

- **`lib/animationEventBus.js`** — the actual fix. `buildAnimationEvents(entry)`
  reads `entry.verdict.ability.element/range/areaOfEffect`, `eventType`,
  `statusApplied`, `defense.chosenResponse`, and `counterDamage` to produce
  a deterministic, ordered Animation Event queue. `actionInterpreter.js`'s
  keyword matching is now used only (a) to pick a *cosmetic* melee pose
  (punch/kick/slash — the engine has no opinion on which looks best) and
  (b) as the full fallback when no verdict exists at all (AI/Hybrid
  Authority, or an older session) — same fallback contract as every other
  Phase 3.8/3.9 integration point. A real pub/sub bus (`createEventBus`/
  `on`/`emit`) implements the Combat Engine → Bus → {camera, particles,
  transformation, timeline} pipeline from spec section 12 — `runLoop` emits
  one `"turn:resolved"` event; a single subscriber (registered once, in
  App.jsx) fans it out.
- **`lib/particleSystem.js`** — a fixed, reused pool (default 220 slots) for
  every particle type in the spec's catalog. No per-hit array growth.
- **`lib/statusVisuals.js`** — a 1:1 visual mapping for every status type in
  `backend/.../statusEffects.js`'s catalog (burn/freeze/shock/poison/
  bleed/fear/blind/silence/confusion/slow/root/gravity_lock/time_stop/
  reality_fracture/mana_drain/energy_drain/armor_break/shield_break/stun/
  healing_reduction). Newly-applied statuses now actually get pushed onto
  the fighter's status list for visual purposes — previously
  `entry.statusApplied` was computed server-side and never even displayed.
- **`lib/cameraController.js`** — extended (not replaced) with
  `triggerCameraEvent()`: small/medium/large shake, zoom-out, motion blur,
  camera-snap, dynamic-zoom, each decaying independently every frame so
  overlapping events blend. `createCamera`/`updateCamera`'s existing
  signatures are unchanged — every prior call site still works.
- **`lib/animationController.js` + `animationStateMachine.js`** — added a
  `transformTimer` / `"transforming"` pose state (spec section 7: pause
  briefly, play the transformation, resume) via `triggerTransformation()`.
- **`components/Particle.jsx`** — presentational particle renderer, same
  pattern as the existing `Projectile.jsx`.
- **`components/Stickman.jsx`** — additive props (`statusVisuals`, default
  `[]`): renders one dashed aura ring per active engine-applied status, and
  a distinct pulsing pose while `state === "transforming"`. Every existing
  caller without these props renders exactly as before.
- **`components/AnimationDebugPanel.jsx`** — Developer Mode (spec section
  14): the last turn's animation queue in order, each event's source
  (`engine` vs `fallback`) and category, physics sync (knockback/impact
  radius/terrain), live movement state per fighter, and current camera
  event levels. Wired in next to the existing Memory/Authority debug
  buttons — same pattern, not a redesign.
- **Timeline recording** — `animationTimelineRef` in App.jsx records the
  last 200 resolved turns' animation events. This is the *data* side of
  spec section 11; there's no dedicated Timeline UI component in the
  project to hang a "click to replay" affordance on (searched — none
  exists in any prior phase), so I didn't invent one. The recorded data is
  there and shaped for it (`{round, actorKey, defenderKey, animEvents,
  cameraEvent}`) if/when a Timeline component gets built.

## Scoping notes (please read)

- **No literal environment deformation.** Spec section 10 (ground cracks,
  walls breaking, craters) — the Combat Engine already tracks a
  `terrainDamage` running total (Phase 3.9's `arenaTracker.js`) and the
  verdict's `physics.terrainDamage` boolean fires correctly, but there's no
  existing arena-geometry system to deform, and building one is a
  significantly bigger scope item than an animation-sync pass. The Debug
  Panel shows when terrain damage *should* have occurred; there's no
  visual crack yet.
- **Timeline replay isn't wired to a click** for the reason above — the
  data is recorded and ready, but there's no Timeline UI to attach it to.
- Everything else in the spec (event-driven animation, the queue, movement
  sync, attack sync, hit reactions, status visuals, transformation pause,
  camera events, pooled particles, debug mode) is implemented and wired
  into the actual render loop, not stubbed.

## Try it

Start a battle in Engine Authority mode (default) and open the new 🎬
Animation button in the header — you'll see each turn's animation queue
tagged `engine` (reading straight off the Combat Engine verdict) versus
what it'd say in AI/Hybrid Authority mode (`fallback`, from the old
keyword interpreter). Land a few elemental/status-inflicting hits and
watch the aura rings appear on the defender; a heavy or critical hit
should visibly shake the camera.
