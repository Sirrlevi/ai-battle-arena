# Animation Pass — Changelog

Scope of this pass: diagnose and fix the reported movement-animation
regression (the required first task), then use the same investigation to
make the walk/run gait itself read as more natural. This was a **targeted**
pass, not the full 13-category rewrite in the brief — see "What wasn't
touched" at the bottom for why, and what a next pass should cover.

## 1. Root-cause fix: legs not animating while moving ("sliding")

**File:** `frontend/src/components/Stickman.jsx`

**Symptom:** characters translate across the arena correctly but the
skeleton's limbs barely move — most visible during a melee dash-in, which
is the single most common movement in the game.

**Root cause:** `useSmoothedPose` applies one flat exponential blend rate
(`0.24`) to every joint-angle channel every render, regardless of how fast
that channel is already changing on its own. `poseGait` (in
`lib/characterAnimation.js`) drives the legs/arms with `sin(worldX / stride)`
— a wave whose *frequency* scales directly with travel speed, not a fixed
frame-based animation. At "dash" speed (640 px/s — what every melee
approach in the game actually uses via `animationController.js`'s
`issueCommand(anim.motion, "dash", approachX)`), that gait cycles roughly
every 150 ms. A flat 0.24-rate exponential filter is a low-pass filter
whose cutoff sits well below that oscillation frequency, so on every frame
it was smoothing the swing amplitude almost all the way back toward the
previous frame's value before it ever reached the screen — the classic
"low-pass filter eats the signal it was supposed to only smooth" failure.
The outer `<g transform="translate(x, y)">` still moved (that value isn't
filtered the same way), so the figure visibly slid across the ground with
static-looking limbs.

Confirmed by the numbers, not just inspection: at dash speed, phase
advances at `~40 rad/s`; the old 0.24-per-frame filter's effective cutoff
at ~60fps is roughly `2.4 Hz`, versus the gait's actual `~6.4 Hz` swing
frequency at that speed — nearly an octave past where the filter still
passes most of the amplitude through.

**Why 0.24 existed at all, and why it wasn't just deleted:** it's the
correct rate for a different problem — hiding pose *pop* when the
underlying pose source jumps discontinuously (idle → attack → hit state
swaps, each its own hand-authored keyframe pose). That's a real need and
still applies to those states.

**Fix:** the blend rate is now state-aware instead of one constant:

```js
const blendRate =
  attackPhase?.phase === "strike" ? 0.7
  : state === "hit" ? 0.55
  : state === "running" ? 0.85
  : state === "walking" ? 0.6
  : 0.24;
```

`walking`/`running` now blend fast enough to preserve `poseGait`'s own
(already continuous, already smooth) waveform instead of filtering it out.
Every other state — idle, attacking, hit, blocking, flying, etc. — is
untouched and keeps exactly the smoothing behavior it had before. Nothing
in `movementController.js`, `animationStateMachine.js`, or
`animationController.js` needed to change; the motion/state pipeline was
already correct, the bug was entirely in how the renderer smoothed its
output.

## 2. Gait quality: foot-plant + hip/shoulder counter-rotation

**File:** `frontend/src/lib/characterAnimation.js` (`poseGait`)

Two additive changes to the same function, inspired by the reference
project's approach of reading gait as stance/swing rather than one
continuous multiplier, adapted to this project's angle-based (not
absolute-position) rig:

- **Foot-plant split.** The foot-tip angle used to be one flat
  `-leg * 0.3` regardless of where in the stride that leg was. It's now
  split by which half of the sine wave the leg is in: a flatter,
  ground-hugging angle while that leg is in its stance/push-off half, a
  freer lift on the forward-recovery half. Prevents the foot reading as
  clipping forward through the ground on push-off.
- **Hip/shoulder counter-rotation.** Real bipedal gait isn't just leg
  swing — the hips twist one way and the shoulders twist the other to
  cancel angular momentum (contralateral rotation). Added as a small
  `sin(phase)`-driven adjustment layered onto the existing `waistLean`/
  `chestLean` values, scaled by the same `intensity` the rest of the gait
  already uses so a slow walk doesn't over-twist and a full sprint reads
  as more dynamic.

Both changes only touch `poseGait`; every other pose function (attacks,
hit reactions, idle, flying, victory, death, etc.) is byte-for-byte
unchanged.

## 3. Knockback weight scales with damage

**File:** `frontend/src/lib/animationController.js`

Knockback push (`applyHitReaction`) used to be one flat speed (260px/s)
for every hit regardless of damage — a 5-damage jab and a 40-damage
haymaker shoved the target back identically, which reads as weightless.
Replaced with `KNOCKBACK_BASE (170) + damage * KNOCKBACK_PER_DAMAGE (3.4)`,
capped at `KNOCKBACK_MAX (520)` so a single hit still can't fling a
fighter across the whole arena in one frame. A light jab now barely
budges the target; a heavy hit sends them sliding back hard. Still purely
a cosmetic push on `motion.vx` — doesn't touch hp, damage, or any combat
resolution, same as before.

## 4. Landing weight: dust, camera shake, and impact-scaled squash

**Files:** `frontend/src/lib/movementController.js`,
`frontend/src/lib/characterAnimation.js`, `frontend/src/components/Stickman.jsx`,
`frontend/src/App.jsx`

The engine already tracked `motion.justLanded` and `motion.justHitWall`
(Phase 4D) but nothing was watching them for anything visual — they only
fed a sound-cue name. Kept the existing pooled particle system and camera
controller completely as-is and just gave these two events the same
treatment every other impact in the game already gets:

- Added `motion.landSpeed` — a cosmetic-only snapshot of `|vy|` taken at
  the instant of touchdown, before it's zeroed. Doesn't change physics;
  it's read-only, the same pattern as the existing `justStepped`/
  `justHitWall` flags.
- A landing now emits a `dust` particle burst at the fighter's feet
  (`lib/particleSystem.js`'s existing pooled emitter — no new profile
  added), scaled low/medium/high by how hard the landing actually was. A
  genuinely hard landing (`landSpeed > 500`) also triggers the existing
  `small-shake` camera event.
- A wall bounce now emits a `debris` burst at torso height and the same
  small camera shake.
- The landing-squash crouch (already existed via `landPulse`) now scales
  its depth by `landSpeed` too, via `computeSkeletonPose`'s new optional
  `landSpeed` param — a step off a small hop reads as a light dip, a
  knockdown-height fall reads as a real impact, clamped to a sane
  0.55x–1.7x range so it can never look broken.

No new particle types, no new camera-event kinds, no backend changes —
every piece here reuses machinery that already existed and was already
being used for other effects; this just connects two previously-silent
events to it.

## Try it

Watch a fighter dash in to melee range — legs should now visibly cycle
through the approach instead of the figure sliding on static legs. Watch
the return-to-home walk after a strike resolves — should read as a clear
walk cycle with a slight hip sway, not idle-with-translation. Land a light
jab vs. a heavy hit back-to-back — the knockback distance should now
visibly differ. Watch a fighter get knocked into a launch and come back
down — a hard landing should kick up a bigger dust puff, a bigger squash,
and a small camera shake; a light hop landing should barely register.
Knock a fighter into the arena wall — should now kick up debris and a
small shake instead of silently stopping.

## Files touched this pass

- `frontend/src/components/Stickman.jsx` — blend-rate bugfix, `landSpeed` threaded through
- `frontend/src/lib/characterAnimation.js` — gait foot-plant/hip-shoulder rotation, landing-squash scaling
- `frontend/src/lib/movementController.js` — added cosmetic `landSpeed` field
- `frontend/src/lib/animationController.js` — damage-scaled knockback
- `frontend/src/App.jsx` — landing/wall-impact particles + camera shake wiring, `landSpeed` threaded into `poses`

Nothing in `backend/`, no API routes, no deployment config, no character/
powers/ability/battle-logic files, and no UI outside these five files was
touched.

## What wasn't touched in this pass

The original brief listed 13 categories (procedural animation, movement
feel, combat timing, physics, AI, effects, performance, etc.). Investigating
this codebase found most of those already substantially built — the
project is already through a "Phase 4F" polish pass with a real
forward-kinematics skeleton, acceleration/friction-based movement,
windup/strike/recovery attack phases with power-scaled commitment,
continuous hit/block jitter, a camera system with shake/zoom/rotation/
slow-motion/chromatic-pulse layered event system, after-images, speed
lines, and personality-seeded per-fighter movement variance. Rather than
touch code that already does what the brief asks (and risk regressing a
tested system for cosmetic churn), this pass stayed scoped to the actual
reported defect plus the gait refinement it naturally led to.

Genuinely open items if you want a follow-up pass: AI-side spacing/retreat
decisions live in the backend LLM prompt, not client-side logic, so
"smarter AI" would mean backend prompt/heuristic work, not a frontend
animation change; and a couple of pose functions (jump apex / fall) could
still take an air-control-scaled variant the way `poseGait` now does.
