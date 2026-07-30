# Phase 4F — Animation Polish Pass (inspired by a reference project)

Entirely frontend. Nothing in `backend/` changed.

## Where this came from

The user pointed at a second, unrelated project — a real-time multiplayer
browser fighting game (`stick-fighter-firked`, an HTML5 Canvas + vanilla
JS Street-Fighter-style clone with WebRTC matchmaking, ELO, voice input —
none of which applies here) — and asked to keep this project's own core
logic (the LLM battle loop, Combat Engine, everything built through 4A-4D)
while borrowing whatever made that project's character animation read as
more polished, adapted into our SVG/React renderer.

**Not ported, on purpose:** the reference project's entire architecture is
different at the foundation — Canvas 2D imperative drawing vs. this
project's SVG/React declarative components, real-time player input vs.
this project's turn-based LLM battle loop, absolute per-pose joint
coordinates (bones can stretch between poses) vs. this project's rigid
forward-kinematics chain with fixed segment lengths. None of that was
worth or even sensibly portable. What follows is the specific techniques
that were.

## What actually changed

**4 edited files, all additive:**

- **`lib/animationController.js`** — `pendingImpact` now also carries the
  ability's `element` (falls back to `"physical"`), and melee/movement
  `attackPhase` now carries `power` (the real `entry.damage` about to
  land). Both are purely cosmetic hints for the renderer, read by the
  three files below, never by any combat logic.
- **`lib/characterAnimation.js`** — `poseAttacking` now scales torso-lean/
  crouch commitment by `attackPhase.power`, clamped at the same 45-damage
  ceiling used elsewhere in this codebase. `poseBlocking` and `poseHit`
  both gained a small continuous sine-driven jitter for their whole
  reaction, instead of a single static pose.
- **`components/Stickman.jsx`** — the skeleton's stroke color now
  genuinely recolors during a hit (toward red, scaling with real damage)
  and while blocking (toward blue), layered so the existing brief white
  impact flash still happens first, then the sustained tint takes over
  for the rest of the reaction. A bright dot now marks the striking
  hand/foot's exact position during a melee attack's active strike
  window. One real bug caught in the process: the first version of the
  after-images groundwork touched here (used from Phase 4C) would have
  called a hook conditionally — fixed, and it's the reason this file's
  hooks all stayed unconditional going forward.
- **`App.jsx`** — damage numbers are now colored by the ability's element
  (fire/ice/lightning/void/gravity/light/poison each get their own color,
  physical/unknown falls back to the original flat red) instead of one
  flat color for every hit.

## What each idea actually came from, and how it was adapted

- **Full-body recolor during hit/block, not just a flash.** Their
  `fighter.js` sets `ctx.strokeStyle` to a flat red/blue for the entire
  hitstun/blockstun state. Adapted rather than copied: this project keeps
  its existing brief white flash (a real, working 3.95-era effect) for
  the first instant, then blends toward red/blue via the hp/aura color-
  blend helper already built for 4A's aura tinting — and unlike the
  reference's flat color, the red scales continuously with real damage.
- **Continuous jitter during a reaction, not a static held pose.** Their
  hitstun/blockstun both oscillate every frame via a sine on their own
  frame counter. This project's version uses the same idea on real
  elapsed time, layered onto the existing magnitude-based hit pose and
  the existing guard pose — additive, not a replacement of either.
- **Attack intensity scaling with actual power, not just timing.** Their
  punch reach literally multiplies by a strength tier. This project's
  skeleton is angle-based, not absolute-position, so directly rescaling
  "reach" per joint would have meant touching arithmetic inside five
  separate, already-tested pose functions — real regression risk for a
  cosmetic feature. Instead this amplifies the torso-lean/crouch signal
  every attack pose already sets, in one place (`poseAttacking`'s
  dispatcher), which reads as "more of the body committed to the hit"
  without touching any per-variant joint math at all.
- **A bright impact marker at the exact point of contact.** Directly
  adapted — their version is a small flash at the fist/foot during active
  frames; this one reads the exact same hand/foot forward-kinematics
  position this project already computes for the skeleton itself, gated
  on the existing "strike" sub-phase `animationController.js` already
  tracks.
- **Zone-colored hit feedback.** Their version colors sparks by which
  body zone got hit (head/body/limb — the reference game tracks hit
  zones; this one doesn't). The natural equivalent here is element, which
  this project already has rich data for (8 elements, used throughout 4B
  for projectile variants) — so damage numbers are now colored by element
  instead, which fits this project's fantasy-combat framing better than
  literal body zones would have anyway.

**Deliberately left out:** their crotch/head-shot callouts and comedic
tone don't fit this project's aesthetic; their simpler single-segment
torso (hip straight to shoulder, no waist/chest/neck distinction) isn't
an upgrade over what 4A already built, just a different tradeoff; and
their rising/falling arm distinction mid-jump is already covered here by
having separate jumping/falling *states* rather than one state with an
internal velocity check.

## What every existing system keeps doing exactly as before

`animationStateMachine.js`, `movementController.js`, `projectileManager.js`,
`cameraController.js`, `particleSystem.js`, every pose function's actual
joint-angle arithmetic, the Combat Engine, and every backend file are all
unchanged. Every new field (`element`, `power`) is optional with a safe
default, so any code path that doesn't set them behaves exactly as it did
before this phase.

## Try it

Land a few hits of very different damage — a light one should barely
recolor, a heavy one should read as clearly, sustainedly red, distinct
from the brief white flash. A blocked hit should shift the guard blue
and jitter slightly, not just hold one frozen pose. A big, heavy melee
hit should visibly lean the whole body into it more than a weak jab does.
Watch a punch/kick land exactly on the strike frame — a bright dot
should mark the exact point of contact. Damage numbers from a fire
ability vs. an ice ability vs. a plain physical hit should come out in
different colors.
