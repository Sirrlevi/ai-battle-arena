# Phase 4C — Camera Modes & Visual Effects

Entirely frontend. Nothing in `backend/` changed for this phase, same as every phase since 4A.

## Where this sits

Continuation of Phase 4 (see `PHASE_4A_NOTES.md` for the sub-phase
breakdown). This phase answers spec section 11 (camera system) and
section 16 (visual effects). Only 4E (environment destruction) is left
after this.

## What actually changed

**8 edited files, all additive.** Built around two pieces of shared
infrastructure rather than one system per named spec item — most of
section 11's camera modes and section 16's VFX turn out to be
combinations of a small number of underlying primitives:

- **`lib/particleSystem.js`** — two new ring profiles, `shockwave` and
  `energy_wave`, plus a new `expand` flag alongside the existing `ring`
  flag.
- **`components/Particle.jsx`** — when `expand` is set, a ring now grows
  from 0 to full radius over its life instead of the existing subtle
  ~0.6x-to-1x pulse. `explosion_ring`/`magic_circle` (used since 3.95)
  don't set the flag, so they render exactly as before.
- **`lib/cameraController.js`** — four new decaying fields (`rotation`,
  `zoomInPulse`, `timeScale`, `chromaticPulse`) and three new composite
  event kinds (`impact-zoom`, `death-cam`, `ultimate-cam`) that each set
  several of those fields at once, the same pattern `beam-clash` already
  used in 4B. Every existing field/kind is untouched.
- **`lib/animationEventBus.js`** — `cameraEventFor`'s priority chain is
  reordered so lethal → `death-cam`, ultimate → `ultimate-cam`, and a
  real critical/heavy hit → `impact-zoom` (previously all three just
  triggered plain shake); every other priority in that chain is
  unchanged. `particleEventsFor` gained two lines: lethal now also gets a
  `shockwave`, ultimate now also gets an `energy_wave`.
- **`components/Arena.jsx`** — camera rotation folded into the existing
  scene transform (pivoting around the viewport's own center so it reads
  as a tilt, not a swing around a corner); a real directional motion-blur
  filter, finally rendering the `motionBlur` field that's existed since
  3.95 with nothing ever consuming it; a second, stronger bloom filter
  reserved for transformation/victory moments (the original aura filter
  is untouched, so ordinary auras look exactly as before); a chromatic-
  pulse overlay for the biggest moments.
- **`App.jsx`** — a new `simDt` (camera's `timeScale` applied to the
  simulation only, never to the camera's own decay — see the scoping
  notes below for why that split matters); a real per-frame motion-blur
  trigger from actual dash/knockback velocity (movementController's own
  `vx`, not a guess); a small `triggerImpactFrame` helper, called from
  both places a hit already lands, giving heavy/lethal hits a brief real
  pause and flash distinct from beam-clash's longer one.
- **`components/Stickman.jsx`** — two new fighter-level effects,
  after-images and speed lines, both driven by the same real speed value
  4A already derives. One bug caught and fixed in the process: my first
  pass wrapped the after-images hook in `alive ? useHook() : []`, which
  is a real Rules-of-Hooks violation (hooks can never be called
  conditionally) — fixed to call the hook unconditionally and gate only
  the JSX output on `alive`. Stress-tested across ~150 real re-renders
  flipping alive/dead during fast movement specifically to catch this
  class of bug before it shipped.

## What's real vs. reinterpreted vs. deferred

- **Camera (section 11):** Follow Target, Auto Zoom, Camera Shake, and
  Beam Clash Camera already existed (3.95/4B) and are untouched. Impact
  Zoom, Slow Motion, Rotation, Death Camera, and Ultimate Camera are all
  new and real this phase — Slow Motion in particular actually eases
  gameplay to a lower speed for a beat (via `simDt`) rather than just
  looking slower, and still visibly plays out, unlike beam-clash's hard
  freeze. **Split Focus** is the one item I didn't build a dedicated
  mechanic for: the existing auto-zoom already pulls back to keep both
  fighters framed as they separate, which is most of what "split focus"
  would need in a single-viewport 2D arena; true split-screen (two
  independently-rendered views) would be a real UI architecture change,
  not a camera-controller addition, so I left it as the existing
  behavior rather than half-building something bigger.
- **Visual effects (section 16):** Motion Blur is now a genuine fix, not
  just an addition — it existed as a name since 3.95 but rendered
  nothing. Glow and Screen Flash already existed. Bloom, Chromatic
  Distortion, Shock Rings, Energy Waves, Trail Effects (now covering
  fighter movement, not just 4B's projectiles), Speed Lines, and Impact
  Frames are all new. **Chromatic Distortion is a stylized
  approximation** — two tinted, screen-blended rects, not literal
  per-channel splitting via SVG filters; a `feColorMatrix`-based true
  split applied to this whole complex, frequently-changing scene graph
  every frame would cost meaningfully more for a brief, subtle effect,
  and the cheaper version reads the same at the intensity this is used
  at. **Heat Distortion is not implemented.** A real version needs
  `feTurbulence`/`feDisplacementMap`, which is a genuinely different
  category of SVG filter work — more expensive, harder to tune, and
  higher-risk to apply safely to a live scene than everything else in
  this phase. I'd rather say plainly that it's not there than ship a
  rushed version of the one effect on this list actually worth being
  cautious about.

## What every existing system keeps doing exactly as before

`animationStateMachine.js`, `movementController.js`, `collisionSystem.js`,
`characterAnimation.js`, `projectileManager.js`'s own travel/clash logic,
the Combat Engine, and every backend file are unchanged. Every new camera
field defaults to 0/1 (inert), every new Arena filter/overlay is
conditionally rendered only above a small threshold, and `Particle.jsx`'s
existing ring behavior is preserved exactly for anything that doesn't set
the new `expand` flag — with no active event, the whole scene renders
pixel-identical to end-of-4B.

## Scoping notes (please read)

- 4E (environment destruction) is the only piece left, still exactly
  where 3.95's own notes left it.
- `camera.timeScale` is deliberately NOT applied to `updateCamera` itself
  — only to the fighter/projectile/particle simulation. If it were,
  slow-motion would extend its own recovery time proportionally to how
  slow it made everything else (a self-reinforcing loop), so a slow-mo
  beat's real-world duration would stop being predictable. `updateCamera`
  always gets the real, unscaled `dt`.
- Verification for this phase: the particle/camera math was checked with
  scripted simulations (ring expansion curve, every composite event's
  fields, decay-to-rest timing, sign-aware rotation decay from both
  directions); the Arena rewrite was checked by pulling the actual
  rendered SVG DOM after triggering `ultimate-cam` and confirming the
  rotation transform, chromatic rects, and both new filter defs are
  really there with the right values — not just eyeballed. The
  Stickman.jsx hooks bug specifically was caught by a live-browser stress
  test: ~150 real re-renders toggling a fighter between alive and dead
  while moving fast enough to keep after-images/speed-lines active,
  checking for React's own hook-order warnings, which came back clean
  after the fix.

## Try it

Same `npm install && npm run dev`. A genuinely heavy or lethal hit should
now punch the camera IN rather than just shaking it, with a very brief
pause and flash. The lethal blow that ends a fight should visibly tilt
and slow down for a beat. An ultimate ability should feel like the
biggest camera moment in the fight — deep zoom, a tilt, a longer slow-mo,
a faint color-fringed flash. A hard dash or heavy knockback should blur
briefly. A fast-moving fighter should trail a few faint ghosts and short
speed lines behind them.
