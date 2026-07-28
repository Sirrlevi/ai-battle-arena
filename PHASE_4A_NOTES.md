# Phase 4A — Procedural Skeleton & Motion

Entirely frontend. Nothing in `backend/` changed for this phase.

## Where this sits in the Phase 4 spec

The Phase 4 doc this phase is answering specs ~19 systems: skeleton,
procedural animation, attack anims, a full projectile system, beam clash,
dynamic aura, hit reactions, physics, environment destruction, a particle
engine, a 9-mode camera, animation blending, combos, per-character
personality visualization, transformation cinematics, an 11-effect VFX
suite, an audio event pipeline, performance work, and an extended debug
overlay. That's not a single-pass job — it's closer to what a small studio
spends months on — and building all of it shallowly in one sitting would
mean stub code that looks done but isn't, which is exactly what Phase
3.95's own scoping notes (below this file, still in this repo) declined to
do for environment destruction. So Phase 4 is being split into sub-phases,
same as 3.5/3.8/3.9/3.95 were.

**4A (this phase)** is spec section 1 (skeleton) plus real slices of
sections 2, 3, 6, 7, 12, and 14 — the pieces everything else in the spec
depends on cosmetically. Before this phase, `Stickman.jsx` was a 6-line
stick figure (head, one spine line, two single-segment arms where only one
ever animated, two static legs) with **zero limb motion during ordinary
walking or running**. Nothing else in the spec was going to look right
layered on top of that.

Proposed remaining split (not started, see "Scoping notes"):
- **4B** — full projectile system (spec section 4) + beam clash (section 5)
- **4C** — camera modes (section 11) + VFX suite (section 16)
- **4D** — physics/momentum/air-control (section 8) + combo chaining
  (section 13) + audio event pipeline (section 17) + extended debug overlay
  (section 19)
- **4E** — environment destruction (section 10) — the item Phase 3.95
  already flagged as the biggest standalone lift

## What actually changed

**1 new file:**
- **`lib/characterAnimation.js`** — pure functions, no React, no game-state
  imports, no access to any Combat Engine verdict. Turns `state` +
  `attackPhase` (both already produced by the untouched
  `animationStateMachine.js` / `animationController.js`) plus each
  fighter's own AI-generated `combatStyle`/`weapon`/`personality`/`aura`
  text (Phase 1 fields, never previously read by the renderer) into a full
  joint-angle pose. Same non-negotiable rule Phase 3.95 set for the rest of
  the renderer, extended to the joint level: this file picks a pose, never
  an outcome.

**6 edited files, all additive:**
- **`components/Stickman.jsx`** — near-total rewrite of what's *inside* the
  existing outer `translate/rotate/scale` group (that outer transform,
  and everything that fed it, is untouched). Draws an actual hierarchical
  skeleton — waist → chest → neck → head, shoulder → elbow → hand ×2,
  hip → knee → foot ×2 — computed via forward kinematics and rendered as
  plain SVG lines/circles. Still pure SVG; no canvas, WebGL, or animation
  library was introduced. Still a "pure presentational component" per its
  own header comment.
- **`lib/animationController.js`** — `applyHitReaction(anim, fromX)` became
  `applyHitReaction(anim, fromX, damage = 0)`; the new `damage` param is
  optional and only feeds `anim.lastHitDamage`, a new cosmetic-only field
  used to size the hit-reaction pose. Nothing that reads combat state
  changed.
- **`App.jsx`** — both `applyHitReaction` call sites now pass real
  `impact.damage` / `p.payload.damage` (previously computed, just not
  threaded through); the `poses` builder gained `hitMagnitude`; a new
  `isWinnerByFighter` map (`phase === "finished" && f.key === winnerKey`)
  is computed and passed to `Arena`.
- **`components/Arena.jsx`** — new `isWinnerByFighter = {}` prop (defaults
  to empty, so any caller that doesn't pass it renders exactly as before),
  forwarded to `Stickman` as `isWinner`.
- **`lib/actionInterpreter.js`** — `roundhouse` used to be lumped into the
  `kick` keyword row; it now gets its own row, alongside a new `uppercut`
  row, so those two named attacks from spec section 3 get their own poses
  instead of falling back to a generic punch/kick. Purely a cosmetic
  reclassification — this table has never had any influence on damage or
  verdict resolution, only on which animation plays.
- **`lib/animationEventBus.js`** — `MELEE_VARIANT_ANIMATION` gained
  `uppercut`/`roundhouse` entries (event-log/debug-panel labels only).

## What's actually in the skeleton (spec section 1)

Every joint the spec lists — head, neck, chest, waist, shoulders, upper/
lower arms, hands, upper/lower legs, feet — is independently posable.
Elbows and knees are real two-link chains (the lower segment bends
*relative to* the upper segment, not independently), so a bent arm swings
correctly with the shoulder instead of scissoring on its own.

## What's real vs. partial in the rest

- **Procedural animation (section 2):** idle now breathes, walks/run/dash
  now swing all four limbs with counter-swinging arms, phase-locked to
  actual distance traveled (not a timer, so it can't drift out of sync
  with movement) and scaled continuously by real frame-to-frame speed —
  meaning a run and a dash-in read as different intensities of the same
  gait rather than a hard 3-way switch. Jump/fall/fly/hover/block/land all
  get real distinct poses. **Not added:** roll, slide, wall jump, double
  jump, teleport-as-movement, back/side dash — none of those have an
  actual movement *command* anywhere in `movementController.js` today, and
  I didn't want to invent poses for commands that can't be issued.
- **Attack animations (section 3):** punch, kick, uppercut, roundhouse,
  and slash each get a distinct anticipation → execution → recovery arc
  (uppercut also gets a small decorative hop; none of it touches the real
  attack timers in `animationController.js`, which this file deliberately
  never imports). Ranged/self abilities (beam, projectile, heal, shield —
  anything that isn't one of the five melee variants) get a "cast" pose
  instead of defaulting to punch. **Not added:** grab/throw — a real
  version needs the attacker's pose to temporarily drive the defender's
  position, which is a bigger interaction change than a cosmetic pose
  swap, so I left it out rather than fake a grab that doesn't grab
  anything.
- **Hit reactions (section 7):** continuous light → heavy scaling from
  real damage (using the same 15/40 thresholds the event bus already
  displays as "Small Flinch"/"Knockback"/"Heavy Hit", so what you see
  matches what the debug panel says). Death is a limp, per-fighter-
  consistent ragdoll layered under the existing rotate-90-and-fade — that
  mechanic itself wasn't touched.
- **Aura (section 6):** shape, spike count, and pulse speed come from each
  character's own personality/combat-style/weapon text; size responds to
  energy%, tint shifts toward warning-red as hp% drops. Hp/energy were
  already on the fighter object — no new plumbing needed. **Not wired:**
  mana/current-form/ultimate-charge/rage/reality-instability — those
  exist server-side (Phase 3.9's `worldState.js`/`forms.js`) but are never
  sent to the frontend fighter object today. That's a data-plumbing change
  to `battleState.js`/the API response shape, not a rendering one — good
  candidate for 4B or 4C.
- **Animation blending (section 12):** continuous exponential smoothing
  between rendered joint angles, fast during strikes/hits (so impact stays
  crisp) and slower for ordinary movement (so state changes don't pop).
  This is not a full blend-tree/crossfade system — just enough to satisfy
  "avoid abrupt transitions" for the common case.
- **Character personality visualization (section 14):** idle stance width,
  arm carry, torso lean, stride length, and aura shape are all derived
  (deterministically — same fighter always produces the same numbers) from
  each AI-generated character's own flavor text. A shared (not
  per-character-unique) victory pose plays for the winner once a battle
  finishes. **Not added:** unique flight style and unique defeat pose
  *per character* — flight currently uses one shared pose, and the death
  pose only varies by a personality-seeded "which way they slump," not a
  fully distinct animation per persona.

## What every existing system keeps doing exactly as before

`animationStateMachine.js`, the attack-phase timers and cooldowns in
`animationController.js`, `movementController.js`, `collisionSystem.js`,
`projectileManager.js`, `particleSystem.js`, `cameraController.js`,
`animationEventBus.js`'s event-queue construction, the Combat Engine, and
every backend file are all byte-for-byte unchanged apart from the two
listed lookup-table additions. `Stickman.jsx`'s prop signature is
unchanged except for the new optional `isWinner` (defaults `false`).
Nothing in this phase reads a verdict, decides an outcome, or changes what
any battle *does* — only how it looks.

## Scoping notes (please read)

- **Update:** 4D shipped — see `PHASE_4D_NOTES.md`. 4B, 4C, and 4E are
  still proposed/not started: projectiles, beam clash, extra camera modes,
  and the VFX suite are all still exactly where Phase 3.95 left them.
- The Debug Panel was intentionally left untouched this phase — the new
  pose/hit-magnitude data isn't surfaced there yet. Natural fit for
  whichever sub-phase adds the "physics state"/"particle count" fields
  spec section 19 wants, since it's more useful to add those together.
- Everything described above as "real" is wired into the actual render
  path, not stubbed — verified by running the new pose logic through every
  state/variant/phase combination, server-rendering the new component
  across representative cases, and mounting it in an actual browser to
  confirm nothing throws across a live animated sequence.

## Try it

`npm install && npm run dev` in `frontend/` (unchanged from before this
phase). Start a battle and just watch — walking/running fighters now swing
their limbs, and closing the distance before a hit lands should read as
visibly faster than a idle-distance repositioning. Land a few different
attack types (or check the Animation Debug Panel's event log for which
variant fired) to see punch/kick/uppercut/roundhouse/slash read as
distinct silhouettes rather than the same swinging line. Two different
generated characters standing idle next to each other should visibly hold
themselves differently. Let a battle finish — the winner should raise
their arms.
