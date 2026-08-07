# Phase 4B — Projectile System & Beam Clash

Entirely frontend. Nothing in `backend/` changed for this phase, same as 4A/4D.

## Where this sits

Continuation of Phase 4 (see `PHASE_4A_NOTES.md` for the sub-phase
breakdown). This phase answers spec section 4 (projectile system) and
section 5 (beam clash system). Still not started: 4C (extra camera modes +
VFX suite), 4E (environment destruction).

## What actually changed

**7 edited files, all additive:**

- **`lib/particleSystem.js`** — one new particle type, `ice`, alongside
  the 15 already there.
- **`lib/cameraController.js`** — one new camera-event kind, `beam-clash`
  (zoom + shake + a new `clashFreeze` field), alongside the existing
  small-shake/medium-shake/large-shake/zoom-out/motion-blur/camera-snap/
  dynamic-zoom.
- **`lib/projectileManager.js`** — the real substance of this phase, and
  effectively a full rewrite (61 → 201 lines). Variant catalog expanded
  from 5 to 10, matching the Combat Engine's actual element vocabulary
  (fire/ice/lightning/gravity/void — see below); a light homing bow on a
  few variants; a missed shot can now bounce off the arena wall instead
  of vanishing (reuses `reflectVelocity`, the exact primitive Phase 4D
  gave fighter knockback); a defensive lifetime cap; and the new
  `spawnBeamClashPair` for spec section 5. Every original
  `spawnProjectile` call anywhere in the codebase works completely
  unchanged — none of this is a breaking change to that function's shape.
- **`components/Projectile.jsx`** — a distinct SVG shape per variant
  (61 → 113 lines) instead of 2 silhouettes shared across everything.
- **`lib/animationController.js`** — `queueAction`'s projectile branch now
  calls a new `resolveProjectileVariant(entry, keywordVariant)` before
  spawning, and detects the one beam-clash trigger this battle loop can
  actually produce (see below).
- **`App.jsx`** — `handleImpact` gained a `spawnBeamClash` branch calling
  the new pair-spawn function; the existing `spawnProjectile` call now
  passes arena `bounds` (enables the wall-bounce); a new `hitstopRef`
  pauses the entire frame's simulation (not just visuals — a real
  freeze-frame) while a clash is resolving; `updateProjectiles` now also
  takes an `onTrail` callback that emits a particle at each projectile's
  current position, throttled per-projectile so 1-2 simultaneous shots
  can't flood the particle pool.

## What's real vs. partial

- **Projectile system (section 4):** Travel Speed, Lifetime, Collision,
  Explosion (already existed via `particleEventsFor`, now visually tied to
  more variants), Particle Trail, and Bounce are all genuinely wired.
  Homing is implemented as a light cosmetic bow on a few variants — never
  literal target-tracking, since a projectile's target position is fixed
  the moment the Combat Engine resolves the turn, before the projectile
  even spawns. Piercing is NOT implemented as a mechanical multi-target
  hit: this architecture resolves exactly one attacker/defender pair per
  turn, so there's no second real target for a shot to pierce into — doing
  it visually-only (traveling a bit past the target with nothing behind
  it) would've been decoration with no combat behind it, so I left it out
  rather than fake it. Variant coverage: fire → fireball, ice → ice_shard,
  lightning → lightning_bolt, void → void_sphere, gravity → gravity_orb
  or black_hole (nudged by the ability's own flavor text, since the
  element alone doesn't distinguish the two spec names) all now come from
  the Combat Engine's own element classification when a verdict exists,
  same "engine beats keyword guess" rule Phase 3.95 set for everything
  else — this used to be 100% keyword-guessed even with a full verdict
  available. "Wind Blade," "Rock Projectile," and "Water Blast" from the
  spec's list have no backend element to key off (the vocabulary is fire/
  ice/lightning/void/light/gravity/poison/physical — no wind/earth/water),
  so they fall back to the existing generic variants rather than getting
  invented backend categories.
- **Beam clash (section 5):** worth reading carefully, since it's the
  most re-interpreted section of anything across 4A/4D/4B. The spec's own
  description ("if two beam attacks collide") assumes two attacks in
  flight at once. That can't happen here: turns strictly alternate
  (`turn = 1 - turn` every turn, App.jsx's runLoop) with a real API
  round-trip between them, so one fighter's shot always fully resolves
  before the other's next turn even begins. The one place two ranged
  effects ARE genuinely part of the same exchange: a beam/projectile
  attack met with a "counter" defense response, both resolved in one
  entry. That's the actual trigger. When it fires: both projectiles
  travel to a shared midpoint first, pause the whole simulation briefly
  on arrival (`hitstopRef`, a real freeze-frame, not slow-motion),
  camera zooms and shakes, particles burst at the collision point, then
  both continue on to their own real final targets. "Winner determined by
  engine" from the spec doesn't apply the way it's written — there's no
  competitive-outcome concept in this Combat Engine, counterDamage is
  additive to the original hit, not a competing roll — so this doesn't
  fake a winner. Both hits landing, staged as a clash instead of two
  disconnected shots, is the honest version of what's actually happening
  mechanically.

## What every existing system keeps doing exactly as before

`animationStateMachine.js`, `movementController.js`, `collisionSystem.js`
(only gained a new function, nothing existing touched),
`characterAnimation.js`, all of `Stickman.jsx`'s skeleton work, the Combat
Engine, and every backend file are unchanged. Every existing
`spawnProjectile` call site still works with its original argument shape
— `bounds` is optional and only enables the new bounce behavior when
provided.

## Scoping notes (please read)

- 4C (camera modes + VFX suite) and 4E (environment destruction) are
  still exactly where 4A/4D's notes left them.
- **A note on how this phase actually went:** partway through, a chunk of
  already-written and already-tested work (the `projectileManager.js`
  rewrite, the `Projectile.jsx` rewrite, `animationController.js`'s
  variant-resolution addition, and part of the `App.jsx` wiring) turned
  out not to have persisted to disk — a handful of other small edits
  around them did. I caught this because I re-run a full audit (grep for
  every new symbol across every touched file, plus a full bundle) before
  treating anything as done, and the audit came back inconsistent with
  what I'd just written. Every missing piece was re-applied and the
  entire verification suite (see below) was re-run clean afterward, so
  what's in this zip is confirmed consistent — but flagging it plainly
  rather than not mentioning it.
- Verification for this phase: a scripted simulation of
  `projectileManager.js` covering all 10 variants' arrival, the homing
  bow's actual deviation (checked against the exact configured amount per
  variant), wall-bounce firing only on a miss and never on a hit, and the
  beam-clash pair resolving correctly in both possible arrival orders
  (fast-projectile-first and slow-projectile-first) with exactly one
  clash callback and each shot reaching its own real target; a table-
  driven check of `resolveProjectileVariant` and the clash-detection
  condition across 11 cases; server-rendered checks of every projectile
  variant and a full Stickman state sweep; and a live-browser render of
  all 10 projectile shapes with zero console errors.

## Try it

Same `npm install && npm run dev`. Ranged abilities should now show a
shape and color matching their actual element instead of a generic
colored line/blob, with a faint trailing particle wake. Watch for a
missed ranged shot that continues past the target — near either edge of
the arena, it should rebound rather than vanish. A beam-clash needs a
defender countering a ranged attack specifically — when it happens, watch
for the whole screen to briefly freeze before the camera zooms in on the
collision point.
