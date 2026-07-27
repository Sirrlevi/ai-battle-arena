# Phase 4 — Advanced Stickman Combat Renderer

Entirely frontend, built on top of Phase 3.95's Animation Event Bus —
nothing in `backend/` changed, and nothing pre-4 was rewritten (extended
in place, same pattern as every prior phase).

## The centerpiece: a real procedural skeleton (section 1)

`lib/skeletonRig.js` + a rewritten `components/Stickman.jsx`. Every fighter
is now head/neck/chest/waist/shoulders/upper+lower arms/hands/upper+lower
legs/feet, each an independently-rotated joint computed fresh every frame
from `computePose(ctx)` — a pure function of state, facing, velocity, the
current attack phase, hit reaction, and transform progress. No sprite
sheets; blending between poses (section 12) is just interpolating angles,
which is why transitions read as smooth instead of snapping between fixed
frames.

## What's real and wired in

- **4-phase attacks** (section 3): anticipation → execution → follow-
  through → recovery, up to 16 attack variants (`ATTACK_VARIANTS` in
  skeletonRig.js — punch/kick/uppercut/roundhouse/grab/throw/slash/hammer/
  spear/staff/claws/tail/energy_punch/ground_slam/air_combo/dive_attack).
  The *choice* of variant is still cosmetic pose-selection from the
  ability's text (same as Phase 3.95's melee-variant picking) — the engine
  has no opinion on which melee pose looks best; it only ever validates
  whether the ability lands.
- **Procedural movement** (section 2): `movementController.js` gained
  double jump, wall jump, roll, slide, back-dash, side-dash, and crouch —
  all real physics-driven commands (velocity/gravity/bounds), not new
  sprite states.
- **Tiered hit reactions** (section 7): `applyHitReaction()` now reads the
  Combat Engine's actual damage/knockback/lethal from the verdict and picks
  light/heavy/knockback/launch/wallcrash/spin/collapse/death — each with
  its own skeleton pose in `HIT_REACTION_POSE`.
- **Dynamic aura** (section 6): `lib/auraSystem.js` — radius/opacity/color
  driven by live hp%, energy%, transform progress, and (best-effort) power
  tier, fetched once via the existing Phase 3.8 `/api/session/:id/combat`
  endpoint. Falls back gracefully to hp/energy-only in AI/Hybrid Authority
  or if the fetch hasn't resolved yet.
- **Character personality visualization** (section 14):
  `lib/personalitySeed.js` — a deterministic hash of the (already AI-
  generated) name + personality string drives idle-bob speed/amplitude,
  stance width, aura pulse speed, and lean bias. Same character always
  looks the same; different characters usually look visibly different;
  nothing here is randomized per-frame or invented by the renderer.
- **Camera system** (section 11): `cameraController.js` extended with
  impact-zoom, slow-motion (a real `timeScale` that slows gameplay dt while
  the camera's own decay still runs on real time so it recovers), ultimate-
  camera, death-camera, beam-clash-camera — each a distinct preset, not a
  reskin of shake.
- **Persistent environment destruction** (section 9): terrain marks
  (cracks) now actually accumulate and stay on the ground for the rest of
  the battle, added only when the Combat Engine's own
  `verdict.physics.terrainDamage` flag fires — capped at 40 so a very long
  fight doesn't grow this unbounded.
- **After-images / impact frames** (section 16): a short ghost trail while
  moving fast (dash/knockback/sprint), and a brief hitstop freeze on
  heavy/lethal hits so they read with weight.
- **Beam Clash** (section 5) — see the honest scoping note below.
- **Audio event pipeline** (section 17): every animation event now carries
  an `audioTag` (punch/kick/beam/explosion/charge/transformation/aura/
  landing/death...) via `AUDIO_TAG` in `animationEventBus.js`. No playback,
  exactly as the spec asked — a future sound layer just subscribes to the
  bus.
- **Debug overlay** (section 19): the 🎬 Animation panel now also shows
  live velocity/grounded/mode per fighter, particle count, active status
  effects, and the full camera-event state (impact zoom, time scale, death
  desaturation).
- **Particle catalog additions** (section 10): ice, shockwave,
  shield_sparks, magic added to the existing pooled emitter system.

## Honest scoping (please read before assuming full spec coverage)

- **Beam Clash (section 5) is a turn-based approximation, not literal
  simultaneous beams.** This project's battle loop is strictly one-
  action-per-turn — there's no moment where two projectiles are both
  actually in flight at once for the engine to arbitrate a winner between.
  `lib/beamClash.js` detects the closest real analogue the Combat Engine
  *does* produce: a ranged/beam ability the defender answered with its own
  validated "counter" Defense Packet (Phase 3.9) — a genuine engine-
  validated clash of forces, just sequenced through the turn structure
  instead of literally simultaneous. Full section 5 ("push mechanic",
  true dual-beam struggle) would need the underlying turn model to support
  simultaneous actions, which is a battle-engine change, not a renderer
  one — out of scope for a renderer-only phase per the "DO NOT redesign
  the architecture" instruction.
- **Bloom / heat distortion / chromatic aberration (section 16) were not
  implemented.** This renderer is plain SVG (no WebGL/shader layer). Glow
  (existing `feGaussianBlur` aura filter), screen flash, speed-adjacent
  after-images, and shock rings are all real; true bloom/heat-shimmer/
  chromatic-aberration need per-pixel post-processing that plain SVG
  filters do this weakly and expensively — a proper implementation belongs
  behind a canvas/WebGL rendering path as its own follow-up, not bolted
  onto the SVG renderer.
- **Combo chaining (section 13) is inherent to the existing per-turn
  animation queue (Phase 3.95), not a new input-chaining system.** Since
  one turn is one validated action, "Punch → Kick → Uppercut" as literal
  chained *player inputs* doesn't apply here — what does apply, and is
  wired, is that a single turn's animation queue already sequences
  multiple beats smoothly (e.g. Charge Energy → Beam → Knockback → status
  visuals), which is the queue described in Phase 3.95 section 2, now with
  smoother per-joint blending underneath it via skeletonRig.
- **Rotation / split-focus camera (section 11)** weren't implemented — a
  2D side-view arena has little use for camera rotation, and split-focus
  (two simultaneous viewports) is a bigger UI change than this pass's
  scope; flagging rather than silently dropping.
- **Crouch is fully wired end-to-end at the physics/pose level** but no
  current AI action maps to it (no "crouch" keyword in the interpreter) —
  infrastructure is there for a future hook, not surfaced yet.

## Try it

Start a battle, open 🎬 Animation. Land a few different attack types
(melee, ranged, an AoE) and watch the aura react to HP dropping; a
low-energy or near-critical hit should read as a heavier skeleton pose.
Trigger a transformation and watch the brief pose freeze. If Engine
Authority + Negotiation Protocol produces a "counter" against a ranged
ability, watch for the beam-clash camera event and shockwave particles.
