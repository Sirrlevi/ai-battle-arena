# Phase 4D — Physics, Combo Tracking, Audio Events, Extended Debug Overlay

Entirely frontend. Nothing in `backend/` changed for this phase, same as 4A.

## Where this sits

Continuation of the Phase 4 spec, following 4A's procedural skeleton (see
`PHASE_4A_NOTES.md` for the full sub-phase breakdown and why Phase 4 is
being split at all). This phase answers spec section 8 (physics), section
13 (combo system), section 17 (audio event pipeline), and section 19
(extended debug overlay) — the four sections 4A's own notes flagged as a
natural group, since the debug overlay is most useful once there's real
physics/combo state worth surfacing in it.

Still not started: 4B (full projectile system + beam clash), 4C (extra
camera modes + VFX suite), 4E (environment destruction).

## What actually changed

**5 edited files, all additive:**

- **`lib/collisionSystem.js`** — one new pure function, `reflectVelocity`,
  alongside the four already there.
- **`lib/movementController.js`** — the real substance of this phase.
  Horizontal motion (walk/run/dash) now ramps toward its target speed via
  real acceleration instead of snapping to it instantly; friction when no
  command is active is now constant deceleration (proper kinetic friction)
  instead of the old ad-hoc exponential damping, and is weaker in the air
  than on the ground; arena-bound contact now reflects velocity (a real,
  if modest, bounce) instead of just clamping position; jump gained actual
  air-control capability — its `targetX` parameter existed in the function
  signature since Phase 3 but was silently ignored by `updateMotion`, so a
  jump could never move horizontally no matter what was passed in. Three
  new one-frame flags (`justLanded`, `justStepped`, `justHitWall`) surface
  the moments those things happen, for the audio/debug work below.
- **`lib/animationController.js`** — new `comboCount` field (cosmetic
  only) and a new exported `registerTurnOutcome(anim, landedHit)`.
- **`lib/animationEventBus.js`** — every event `makeEvent()` produces now
  carries a `sound` cue name, via a new lookup table keyed by the event
  type strings that already existed (Punch, Beam, Explosion,
  Transformation, Death, ...). Status-effect events get a cue derived from
  their own status type instead. No audio assets — this is the event
  layer the spec asked for, nothing plays yet.
- **`components/Stickman.jsx`** — one small addition: a `×N` combo badge
  next to the head when a fighter's streak hits 2, reading the same
  `pose.combo` field the debug panel also reads. Everything from 4A is
  otherwise untouched.
- **`components/AnimationDebugPanel.jsx`** — three new blocks (Physics
  State, Active Effects, Particles/Audio Cues) and velocity added to the
  existing Movement State block; the existing event queue list now shows
  each event's sound cue inline. New props all default to empty/zero, so
  the panel still renders exactly as before for any caller that doesn't
  pass them.
- **`App.jsx`** — calls `registerTurnOutcome` right after `queueAction`;
  the `poses` builder now carries `vx`/`vy`/`grounded`/`mode`/
  `justHitWall`/`combo`; a new `audioCuesRef` ring buffer (last 40) is fed
  from two places — per-turn event sounds in the existing
  `"turn:resolved"` subscriber, and footstep/landing cues per-frame from
  the new motion flags, since those two don't belong to any resolved turn;
  the Debug Panel call gained `particleCount` (reusing the exact
  `livingParticles()` call already made for `Arena`, not a new particle
  count mechanism), `statusVisualsByFighter` (already computed, just not
  previously passed there), and `audioCues`.

## What's real vs. partial

- **Physics (section 8):** velocity, momentum/acceleration, ground
  friction, air control, and wall collision/bounce are all real, driven by
  actual numbers in `movementController.js`, not decorative. The one thing
  I deliberately did NOT touch: the arrival guarantee every existing
  caller depends on (a walk/run/dash command reliably reaches `targetX`
  and reports `done`, which is what lets `animationController.js`'s
  approach → windup handoff fire correctly). Acceleration only changes how
  fast velocity ramps up on the way there — verified with a frame-by-frame
  simulation across walk/run/dash/reversal/jump/fly before this shipped,
  not just eyeballed.
- **Combo system (section 13):** the spec's own example implies chaining
  *within* one continuous sequence (Punch → Kick → Uppercut → ... →
  Ground Slam). That can't happen here: `App.jsx`'s battle loop strictly
  alternates the two fighters' turns with an API round-trip and a ~900ms
  sleep between them, so a fighter's own previous attack has always fully
  finished before they act again — there's no mid-swing moment to chain
  into. What's real instead is a cross-turn hit streak (this fighter
  landing on consecutive turns of their own), shown as a badge and in the
  debug panel. Full reasoning is in `registerTurnOutcome`'s doc comment in
  `animationController.js` — I'd rather the honest version live in the
  code, not just this file.
- **Audio event pipeline (section 17):** every animation event already
  built by `animationEventBus.js` (Punch, Kick, Beam, Explosion,
  Transformation, Charge Energy, Death, status effects, ...) now carries a
  stable cue name. Footstep and Landing — the two the spec lists that
  aren't tied to a resolved turn — are detected directly off real
  movement (`justStepped`/`justLanded`) and fed into the same rolling
  cue log. "Aura" from the spec's example list isn't included: everything
  else here is a discrete, one-shot event, and a continuous ambient loop
  cue doesn't fit that model without inventing a design for something
  that has no asset behind it yet anyway — better to leave it out than
  fake the shape of it.
- **Debug overlay (section 19):** Velocity, Physics State, Active Effects,
  and Particle Count are now all there, alongside what 3.95/4A already
  had (Animation Queue, Movement State, Camera State, Animation Event
  IDs — the last of those was already satisfied before this phase, it
  just wasn't called out). Particle count is the exact same
  `livingParticles()` array `Arena` already renders from, just measured,
  not a parallel counting mechanism that could drift from what's on
  screen.

## What every existing system keeps doing exactly as before

`animationStateMachine.js`, `projectileManager.js`, `particleSystem.js`,
`cameraController.js`, `characterAnimation.js`, everything 4A built in
`Stickman.jsx` apart from the one badge addition, `animationEventBus.js`'s
actual event-queue construction logic, the Combat Engine, and every
backend file are unchanged. Every new prop on `AnimationDebugPanel`
defaults to something that reproduces the pre-4D panel exactly. The one
behavior change that reaches actual gameplay feel (not just cosmetics) is
movement now ramping up to speed and bouncing off walls instead of
snapping/clamping — deliberate, in-scope for a physics section, and it
does not change who wins a fight, only how getting there looks and feels.

## Scoping notes (please read)

- 4B (projectiles + beam clash), 4C (camera modes + VFX suite), and 4E
  (environment destruction) are still exactly where 4A's notes left them.
- The new wall-bounce is reachable in real play (knockback from a hit can
  carry a fighter into the arena edge) but is easiest to see by watching
  for a hard knockback near either edge of the arena — it won't show up
  in a fight that stays centered.
- Verification for this phase: a frame-by-frame simulation of
  `movementController.js` covering walk/run/dash arrival timing, direction
  reversal mid-command, in-place vs. targeted jumps, wall bounce, and
  footstep cadence; a sweep of `animationEventBus.js` confirming every
  event type carries a sound cue; server-rendered and live-browser checks
  of the combo badge at multiple streak lengths; and a full regression
  pass of every 4A pose state to confirm nothing there moved.

## Try it

Same `npm install && npm run dev` as before. Open Developer Mode
(Animation Sync debug panel) — Physics State/Active Effects/Particles-
Audio Cues are new blocks there. Watch velocity actually ramp up at the
start of a dash instead of snapping to full speed. Let the same fighter
land a few hits in a row across their own turns — a gold `×N` badge
should appear by their head, growing each time, resetting the moment they
miss or get blocked. A hard-knockback hit landing near the arena edge
should bounce the loser back rather than just stopping them at the wall.
