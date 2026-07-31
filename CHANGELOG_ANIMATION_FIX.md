# Animation Fix + Hit-Stop Pass

## Root cause found (Task 1): animation loop was crashing every battle

**File:** `frontend/src/App.jsx`

`hitstopRef` was **read and written throughout the per-frame game loop
(`useAnimationFrame`) but never declared anywhere in the file** — every
other ref used in `App.jsx` (`animRef`, `cameraRef`, `stateRef`, etc.) has
a matching `useRef()` line; this one didn't.

Because the very first check inside the loop after the phase guard is:

```js
if (hitstopRef.current > 0) { ... }
```

this threw `ReferenceError: hitstopRef is not defined` on the first frame
after a battle starts. Since that throw happens *before* the loop
reschedules itself (`requestAnimationFrame(loop)` runs after the callback,
not before), the entire `requestAnimationFrame` chain died right there —
permanently, for the rest of that session. Motion integration
(`updateMotion`), pose/state resolution (`updateAnimation`), camera,
particles, and the render tick all live inside that same callback, so once
it died, fighters stopped receiving new positions/poses even though other
React-driven UI (HP bars, battle log, turn text from the async battle
loop) kept updating normally — which reads as "the game is still going,
but movement/animation broke."

**Fix:** added the missing declaration next to the other refs:
```js
const hitstopRef = useRef(0);
```
No other logic changed. Confirmed by cross-checking every `*Ref` usage in
`App.jsx` against its declaration — this was the only one missing, and a
scan of every other file in the project found no equivalent issue.

## Polish: hit-stop now applies to ordinary hits, not just beam clashes

**File:** `frontend/src/App.jsx`

The `hitstopRef` freeze-frame mechanism already existed and worked
correctly for the one beam-clash case (`spawnBeamClashPair`'s `onClash`),
but ordinary melee/movement-attack hits and regular projectile impacts
never set it — so only that one rare interaction ever got a hit-stop.

Added a small shared helper:
```js
function triggerHitstop(damage = 0, lethal = false) {
  if (damage < 4 && !lethal) return; // skip chip damage, avoid stutter
  const base = Math.min(0.1, 0.02 + damage * 0.0016);
  hitstopRef.current = Math.max(hitstopRef.current, lethal ? base + 0.05 : base);
}
```
and call it from both impact paths:
- `handleImpact`'s direct hit/lethal branch (melee + movement-attacks)
- `updateProjectiles`'s per-projectile hit callback

Duration scales with damage (heavier hits freeze slightly longer, capped
so it never feels laggy), lethal hits get a touch more, and `Math.max`
means an already-active freeze is never shortened by a smaller hit landing
in the same window. The beam-clash trigger now goes through the same
`Math.max` pattern for consistency instead of a separate hardcoded value.

## Files modified
- `frontend/src/App.jsx` — the two changes above. Nothing else touched:
  no backend, API, deployment config, database, character/power/ability
  system, or UI layout changes.

## What I checked but did NOT change

This project is already much further along than a typical "first pass" —
most of the request list is already implemented, well past what I'd
normally expect to still be missing:

- **Procedural skeleton animation** (`characterAnimation.js`): idle
  breathing, personality-seeded stance/lean/arm-carry per fighter, a
  single continuous gait pose locked to *distance traveled* (not a timer)
  that scales smoothly from walk through dash-sprint intensity, jump/fall/
  land poses, hit reactions that scale continuously with damage magnitude,
  a knee-bend "land pulse" squash, death/victory poses.
- **Motion feel** (`movementController.js`): real acceleration/friction
  (not an instant velocity snap), separate ground vs. air control,
  gravity, wall-bounce with restitution.
- **Combat feel** (`animationController.js`): windup → strike → recovery
  phase timing per attack, distinct pose generators per melee variant
  (punch/kick/slash/uppercut/roundhouse), a cross-turn combo-streak badge.
- **Visual polish**: pooled particle system (dust/blood/energy/explosion/
  etc.), camera shake/zoom/motion-blur/snap-flash event layer, aura
  glow + personality-driven spike silhouette, HP-tinted aura color.
- **Render-time smoothing** (`Stickman.jsx`): every joint angle is
  exponentially blended between renders so state changes don't pop.

I didn't touch any of that — it's solid, and re-doing it risked breaking
what's already working for no real gain.

## Honest limitation

I don't have network access in this environment, so I couldn't run
`npm install` / `vite dev` / a browser to visually confirm the fix or
test further changes live. The `hitstopRef` fix is as close to certain as
static analysis gets (it's a guaranteed `ReferenceError` given the code
as written), but please run it locally and confirm before deploying.

## Suggested next steps (didn't want to guess blind on these)

If you want me to keep going on feel polish, the most useful next
additions I can see — each small and isolated — would be:
1. Motion trails on strike frames (a fading duplicate silhouette a few ms
   behind the current pose) — biggest visual-impact-per-line item from
   your list that isn't in yet.
2. Landing dust particles wired to `motion.justLanded` (the event already
   exists in `movementController.js`, it's just not consumed for a
   particle emit yet).
3. A touch more anticipation on the windup phase (a slight counter-lean
   before strike) for punch/kick specifically.

Let me know which of these (or anything else on your list) you'd like
prioritized, since I can't test in a browser here and want to keep
changes small and reviewable rather than doing a big blind batch.
