# AI Battle Arena — Fix & Polish Changelog

## 1. Root cause: animation loop was crashing every battle (`frontend/src/App.jsx`)

`hitstopRef` was read/written throughout the per-frame game loop but never
declared with `useRef()` anywhere in the file — every other ref in
`App.jsx` had a matching declaration, this one didn't. On the first frame
after a battle started, `hitstopRef.current` threw `ReferenceError:
hitstopRef is not defined`. Because that throw happened *before*
`requestAnimationFrame(loop)` rescheduled itself, the whole render loop
died right there — motion, pose, camera, and particles all stopped while
other React-driven UI (log, HP bars) kept updating normally.

**Fix:** added the missing `const hitstopRef = useRef(0);`. Nothing else
changed.

## 2. Hit-stop now fires on ordinary hits, not just beam clashes (`App.jsx`)

The freeze-frame mechanic existed and worked for the one beam-clash case
but never fired for normal melee/projectile hits. Added a shared
`triggerHitstop(damage, lethal)` helper (skips chip damage, scales with
damage, capped) and call it from both the direct-hit and projectile-hit
paths.

## 3. AI-failure handling — the engine no longer invents an attack when an AI doesn't respond (`App.jsx`)

**The bug:** when `apiBattleTurn` failed for *any* reason — network error,
backend down, malformed JSON from the model, rate limit, exhausted quota —
the `catch` block fabricated a fake `{ action: "Attack", ability_name:
"Basic Strike", energy_cost: 10 }` and fed it straight into
`resolveAction`. With no `verdict` available, `resolveAction`'s fallback
path rolls real damage (~15–20) and applies it to the opponent. So a
connection hiccup or an exhausted API key was silently dealing damage on
the AI's behalf. The backend itself already refused to do this
(`decisionEngine.js` explicitly throws `INVALID_JSON_RESPONSE` instead of
fabricating a result) — the fabrication was happening one layer up, in the
frontend's error handling.

**The fix — two failure modes, matching what you described:**

- **Transient** (timeout, network blip, backend briefly unreachable, a
  malformed reply this one time): the turn is simply forfeit. No
  `resolveAction` call at all — hp/energy untouched, no animation plays,
  the fighter just stands there. They get a fresh try on their next turn.
- **Permanent for this fight** (rate-limited/quota exhausted after the
  backend's own retries are exhausted, invalid API key, unknown model, no
  key on file): the fighter is marked `disabled` and **no further API
  calls are attempted for them for the rest of the battle** — no wasted
  requests. They take no more actions and don't move. Their opponent's
  turns keep resolving completely normally, so the opponent can still hit
  and finish them off.

A new `classifyTurnFailure(e)` helper reads the error code your backend
already attaches (`RATE_LIMITED`, `INVALID_API_KEY`, `INVALID_JSON_RESPONSE`,
`TIMEOUT`, etc. — see `backend/src/lib/errors.js` / `providers/loggedFetch.js`,
these were already well-classified server-side) and returns which of the
two modes applies. The battle log shows a clear system message either way
(⏳ skipped vs. ⚠️ disabled) so it's visible what happened and why.

## 4. Mutual live-stat visibility — audited and strengthened (`backend/src/lib/memory/promptBuilder.js`)

Good news first: in **Engine authority mode (the default)**, this was
already fully implemented. `worldState.js` builds a complete live view for
*both* fighters — HP, energy, mana, stamina, shield, armor, cooldowns,
status effects, tier — and it was already going into every turn's prompt.

What I found and fixed: the system prompt's sentence claiming this
visibility was **unconditional text**, but `world_state` is only actually
populated in Engine mode — in AI/Hybrid authority mode it's `undefined`,
so the model was being told about data it wasn't actually receiving in
those modes. Fixed by making that sentence accurate per mode, and made the
instruction itself more explicit everywhere: *"weigh your resources
against your opponent's — press an advantage when ahead, play safer when
behind — never pick an action at random."* That's a direct, stronger
anti-"random moves" instruction than the previous vague "use them."

*(Note: this changes prompt wording only — no schema, scoring, or damage
logic touched.)*

## 5. Teleport visuals — real vanish/reposition/reappear instead of hover-or-nothing

**Root cause:** `interpretAction()` (which decides what animation an
action gets) had no "teleport" category at all — "teleport" wasn't in its
keyword list and the engine's own `eventType: "teleport"` classification
was never checked. So a teleport ability fell through to whatever
generic category its flavor text happened to match (often "movement/hover"
or the melee default) — hence the hover-or-nothing you saw, while the
battle log correctly said "teleport" (that part was always coming from the
engine, which had this modeled correctly all along).

**What's new, across 5 files:**
- `movementController.js` — a real `"teleport"` motion command: fades the
  fighter out at the origin (0.16s), **instantly snaps position** the
  moment they're fully invisible (no interpolated travel — that's the
  actual "cut" a teleport should be), then fades back in at the
  destination (0.14s). Gravity is suspended for the duration so they don't
  fall mid-teleport.
- `actionInterpreter.js` — trusts the engine's own `eventType`/`result ===
  "teleport"` first (authoritative), falls back to keywords (teleport,
  blink, phase, warp, vanish, shadowstep) otherwise.
- `animationController.js` — picks a destination from the ability's own
  description (`"behind"` → reappear behind the opponent, `"retreat"` /
  `"away"` → reposition backward, otherwise → arrive at striking range),
  and a VFX flavor (lightning / fire / ice / wind / shadow / arcane) from
  element data or flavor-text keywords, the same pattern the projectile
  system already used for its own variant picking. Only chains into a
  strike pose afterward if the turn actually carries damage — a pure
  reposition teleport just ends at the destination.
- `App.jsx` — fires a themed particle burst (a portal-ring + an
  elemental spark burst) at both the vanish point and the arrival point,
  reusing your existing particle catalog with color overrides rather than
  adding new emitter types.
- `Stickman.jsx` — actually renders the invisibility: opacity now follows
  the teleport fade, so the character is genuinely gone mid-teleport
  instead of continuing to render.

The "where to teleport" decision is still the AI's own — this only fixes
how it *looks* once that decision is made, same as you asked.

## 6. Laser / heat-vision — a real beam instead of a flying bullet (`components/Projectile.jsx`)

**Root cause:** the laser variant used the exact same rendering path as
every point-projectile (fireball, arrow, orb) — a short 44px segment
riding the interpolated position between source and target, i.e. a small
object flying through the air. That's why it read as a bullet.

**Fix:** laser now renders the **entire path from shooter to target** as a
layered glowing line (soft outer glow + core beam + hot point at the
leading edge) every frame it's alive, with a near-instant reveal so it
connects almost immediately and then holds — the classic heat-vision /
optic-blast look, connected light rather than a traveling object.

**Honest scope note:** the underlying turn-based combat system resolves
one action per turn with a fixed outcome — there's no concept of "holding"
a beam for a variable, player-chosen duration, and building that would
mean changing how actions and turns work, not just how they're drawn. I
did not touch that. What this fixes is purely the *look*: connected beam
instead of a bullet, for however long the existing action already lasts
on screen.

## 7. Hand-to-hand combat — punches and kicks now actually land (`frontend/src/lib/animationController.js`, `characterAnimation.js` unchanged, `Stickman.jsx`)

**Two separate root causes were stacked on top of each other here — both fixed:**

**(a) Reach vs. distance mismatch.** Every melee variant (punch, kick,
slash, uppercut, roundhouse) shared one flat approach distance —
`MELEE_RANGE = 92px` — that the attacker would dash to before swinging.
But actually working out how far a strike extends from the rig geometry
already defined in `characterAnimation.js` (`RIG.UPPER_ARM` + `RIG.LOWER_ARM`
+ `RIG.HAND_R` for arm strikes ≈ 52px from the fighter's root at full
extension; `RIG.UPPER_LEG` + `RIG.LOWER_LEG` + `RIG.FOOT_LEN` for leg
strikes ≈ 68.5px) showed arm strikes stopping roughly 35-40px *short* of
the target at that distance — the fist was extending into empty air well
before reaching the opponent's body. Replaced the flat range with a
per-variant reach table (`punch/slash/uppercut: 56px`, `kick/roundhouse:
72px`) computed from that same geometry plus a small overlap margin, so
the dash-in now stops close enough that the strike's own extension
actually lands on the defender's silhouette.

**(b) Impact timing.** Separately — and this turned out to be the bigger
one — the damage/hit-reaction/knockback was firing at the *very start* of
the strike phase, which is the exact pose the windup ends on: fist still
cocked back, not yet swung forward at all. So the defender would flinch
and get knocked back before the attacker's arm had moved. Reworked
`updateAnimation` so the impact now fires partway through the strike
phase, timed per-variant to when that variant's own pose math (in
`characterAnimation.js`) is at or near peak forward reach — worked out
directly from each pose function's angle formulas (e.g. punch/slash/kick/
roundhouse all sweep monotonically toward their most-extended angle right
at the end of the strike keyframe; uppercut's arm sweeps *through*
horizontal partway in and keeps rising afterward, so its peak is earlier
— solved algebraically from its own `mix()` keyframe). A safety net still
fires the impact at phase-end if a slow frame somehow skips past the
timed trigger, so a hit can never be silently dropped.

**Bonus — a bit of "ragdoll" weight on top:** added a brief whole-body
stagger rotation on hit (`hitStaggerDegrees`), scaled by damage and
decaying back to upright over the existing hit-react window — the
character now visibly gets knocked off-balance in the direction of the
hit, not just the joint-level flinch pose it had before. This isn't a
physics simulation (nothing in this renderer is — it's all hand-authored
forward-kinematics, same as everything else here), just an authored decay
curve layered on top of the existing knockback velocity, which was
already going through the normal friction/deceleration physics every
other motion does.

**What I did not do:** add an actual physics engine or true simulated
ragdoll (joints falling under gravity/collision independent of authored
poses). That would mean a new dependency and a real architecture change,
not a polish pass — the fixes above address the actual symptom you
described ("punches thrown in the air, don't land on each other") at its
real root cause (distance + timing), without it.

## 8. Flying VFX — real altitude, hard vs. soft takeoff/landing, and a proper arc (`movementController.js`, `animationController.js`, `App.jsx`)

**Root cause:** a fly/hover attack only ever rose **40px** above the
ground (a single hardcoded offset shared with jump), had zero particle/
camera VFX anywhere in its lifecycle, and — since nothing kept a fighter
airborne once that one motion command finished — gravity took back over
immediately afterward with no landing treatment at all. That's the "kuch
dikhta hi nahi" (nothing visible happens) you described: a barely-there
40px bob and then straight back down, silently.

**Fixed, in three parts:**

**(a) Real altitude, geometrically correct.** A single altitude can't do
both jobs a flying attack needs — dramatic height for the sake of looking
like flight, AND a strike that actually lands on a grounded opponent (the
punch itself only reaches ~50px, so contact has to happen near ground
level or it visibly whiffs above their head). So **fly** is now a genuine
two-stage arc: soar up to a dramatic peak (170px — roughly 1.5-2x a
fighter's own height, comfortably inside the ~340px of headroom between
`GROUND_Y` and the arena's top edge) across most of the horizontal
distance, then swoop down to a proper strike height (34px) for the actual
hit — a "dive in and punch" read, same shape real flying-attack scenes
use. **Hover** stays at one gentle, consistently low height (26px)
throughout — no peak, no arc — which is what makes it read as "soft" next
to fly's swoop.

**(b) Hard vs. soft takeoff/landing VFX.** A new `justTookOff` flag
(mirroring the existing `justLanded`) fires once, the exact frame a
fly/hover command lifts a fighter off the ground.
- **Fly** (hard): takeoff and landing both get a shockwave ring +
  ground-kicked dust + a camera shake (landing gets debris too, and a
  stronger shake — impacts should hit harder than launches).
- **Hover** (soft): none of that. No ring, no dust burst, no camera
  shake, not even the plain landing thud other movement gets — genuinely
  silent and smooth, "like butter," exactly as asked.
- Both also get a light continuous trail wisp for the whole transit (fly
  a bit stronger than hover), so the character reads as airborne
  throughout the flight, not just at the two endpoints.

**(c) A fighter who flew in also flies home.** Previously the return trip
after *any* movement-category attack used a plain ground "walk," which
would have looked broken now that fly/hover start from real altitude —
mid-air fighter suddenly speed-walking. The recovery phase now checks
which style was used to approach and returns the same way, descending
back to `groundY` — which is also what lets the hard-landing VFX above
correctly fire on the way home.

**What I did not change:** `characterAnimation.js`'s `poseFlying`/
`poseHovering` pose functions themselves (the arm/body posture during
flight) — those already looked reasonable and don't depend on absolute
altitude, only relative joint angles, so they carry over correctly at the
new heights with no changes needed.

## 9. Facing/mirroring — the real reason strikes were missing, plus ranged-attack origin points and log sync (`characterAnimation.js`, `App.jsx`)

This is a deeper bug than #7 above caught — worth being direct about that.
#7 fixed reach and impact timing, both genuinely wrong, but a screenshot
showing both fighters facing away from each other (and hands drawn on the
same screen-side) pointed at something underneath both problems.

**Root cause: `setActingArm` picked the correct arm but never mirrored the
angle.** Every joint angle in this file is authored on an absolute
"0deg=down, 90deg=toward +x" convention (this file's own header comment),
and `armL`/`armR` are fixed screen-side shoulder positions in
`Stickman.jsx` (`armL` always the left shoulder, `armR` always the right
— never swapped). `setActingArm` correctly picked *which* arm should act
based on facing (left shoulder when facing left, right when facing
right)... but hand the SAME unmirrored angle values to whichever arm won.
Angle 88° always means "swing toward screen-right," full stop — so a
facing-left fighter's (correctly-picked) left arm would still swing
rightward, away from a left-side opponent, not toward them. This affected
every arm-based attack (punch, slash, uppercut, and the generic ranged
cast) for roughly half of all engagements — whichever fighter happened to
be facing left. Fixed by mirroring (negating) both the upper AND lower
angle when facing is negative — lower is relative to upper (Stickman.jsx
computes the hand position from their sum), so only the *cumulative*
angle mirrors correctly if both do. Kick/roundhouse had the same gap in
miniature (only the upper leg angle was mirrored, not the knee bend) —
fixed the same way. `chestLean`, which several of these poses feed into
the neck/head lean chain, had the same one-sided gap in punch/slash/
uppercut/kick — fixed for consistency.

**A second, separate bug: nothing made an idle fighter face their
opponent.** `facing` was purely a side-effect of the last movement
command's direction (which way you last walked/dashed) — there was no
"look at your opponent" logic at rest at all. Both fighters default to
`facing: 1` at spawn, so at the exact moment in your screenshot (idle,
between turns), there was a real chance either or both fighters were
facing the wrong way — which, combined with the mirroring bug above,
compounds badly (wrong facing feeding an unmirrored angle could
coincidentally look "less wrong," which is probably why this wasn't
always obviously broken). Fixed with a small per-frame check in `App.jsx`'s
game loop: whenever a fighter has no active motion command and isn't
mid-attack, their facing is set to point at their opponent's current
position. Attacks still manage their own facing during the approach (via
whichever way they're dashing/flying in) — this only fills the "just
standing there" gap.

**Ranged attacks — origin points, and two new dedicated poses.** Every
projectile previously launched from a single, fixed torso-height point
regardless of type. Now:
- **Laser/heat-vision** always launches from the face (~head height,
  worked out from the rig's own proportions), with a new `poseLaserCast`
  that doesn't raise the arms at all — just a focused stance and a head
  recoil that snaps back fast the instant the beam fires and eases to
  neutral as it cuts off, like the beam has its own kickback pressure.
- **Everything else** (energy blast, fireball, orb, gravity well, etc.)
  launches from the extended hand, offset forward in the facing
  direction, with `poseCast`'s peak angle pushed from 58° to ~90°
  (horizontal) so a channeled blast reads as actually aimed at the
  opponent rather than off at an angle — this game keeps both fighters at
  roughly the same height, so "horizontal, in the facing direction" *is*
  "aimed at the opponent" here.
- **Arrow** gets its own `poseArrowCast` — a single-arm aimed draw (bow-
  string read) instead of the generic two-handed channel, since a thrown/
  loosed precision shot reads differently from a channeled blast.

**Battle log sync.** The log text (damage, hit/miss, ability description)
previously appeared the instant a turn was computed — before the attacker
had even started their dash-in, let alone landed the hit. The animation
itself wasn't delayed (`queueAction` still fires immediately, so movement
stays responsive), only the log/narration display now waits
`LOG_SYNC_DELAY_MS` (260ms — windup + strike \* the same impact fraction
`handleImpact` itself uses, so text and the character's own flinch land
at roughly the same moment) before appearing.

**What I did not change:** camera shake and hit-particles from
`turn:resolved` still fire at the old (immediate) timing — that's a
separate, pre-existing timing gap from before the Phase 4 animation delay
existed, and fixing it means touching the event-bus subscriber rather
than just display text. Flagging it rather than bundling in an
unrequested, less-scoped change: happy to take it on as its own item if
you want it.

## 10. Cinematic camera / impact frames (`cameraController.js`, `Arena.jsx`, `App.jsx`)

Found something worth flagging before describing the fix: the camera
system already had `motionBlur` and `clashFreeze` fields, fully tracked
and decaying every frame since Phase 3.95 — but neither was ever actually
read anywhere in `Arena.jsx`. The state machinery existed; nothing was
drawing it. That's most of why "cinematic" didn't read as cinematic yet.

**Wired up motion blur for real.** Added an SVG filter
(`feGaussianBlur`, horizontal-only, since the camera itself only ever
pans/shakes horizontally) applied to the whole scene group, intensity
tied directly to `cam.motionBlur`. Now actually triggered on: a heavy/
critical/lethal hit landing (melee or projectile), a beam-clash, and a
hard fly takeoff/landing.

**New: a directed camera "punch" toward the hit (`impact-zoom`).**
Previously the camera could only ever *zoom out* (generically, never
toward a specific point) — there was no mechanism for the camera to react
toward a specific location at all. Added `punchInIntensity`/`punchInDir`/
`punchInZoom`, decaying fast (~0.3s) exactly like the existing shake-
offset pattern, just aimed instead of random: layered *additively* on top
of the normal follow/zoom target (never replacing it), so it reads as a
quick reactive jab rather than fighting or overriding the follow camera.

**New: a hit-scaled impact flash (`impact-flash`), distinct from the
existing teleport-only snap-flash.** Same full-screen overlay technique
`snapFlash` already used, but warmer-toned, snappier decay, and scaled by
how hard the hit landed instead of always full intensity — so a teleport
cut and a haymaker landing don't look like the same event.

**All three fire together** on a genuinely heavy hit (damage ≥ 15, or any
lethal blow — deliberately gated so this doesn't fire on routine chip
damage) via a new shared `triggerImpactFrame()` helper in `App.jsx`,
alongside the hitstop freeze that already existed: freeze, flash, camera
punch, and a blur streak as it releases — the classic "impact frame"
combo, built almost entirely out of decay patterns the codebase already
used elsewhere (shake, snap-flash), not new machinery.

**What I did not change:** the base follow-camera logic in
`updateCamera` (targetX/targetZoom from fighter spread) — every addition
here is a layered, independently-decaying offset on top of it, same
architecture Phase 3.95 already established for shake/zoom-out.

## 11. Idle stance still didn't mirror — the actual last piece (`characterAnimation.js`)

Fair callout — #9's fix corrected the facing *value* and the *attack*
poses' mirroring, but never checked whether the *idle* pose (what's on
screen the rest of the time, including your screenshot) used facing at
all. It didn't: `poseIdle` took `(seed, now)` — no facing parameter,
full stop. Arms were positioned purely from `seed.armCarry` (a personality
quirk), completely unaffected by which way the fighter was actually
turned. Correct facing values (from #9) with a facing-blind pose still
looks the same regardless of facing — that's why it still looked wrong.

Rewrote `poseIdle(seed, facing, now)` as an actual bladed ready stance:
the lead arm (whichever side currently faces the opponent) is carried
noticeably higher and further forward than the rear arm, mirrored the
same way `setActingArm` mirrors an attack (angle values negated when
facing is negative, not just reassigned to the other arm — the exact
mistake #9 fixed for attacks, this time in the pose that's visible far
more of the time). Threaded `facing` through both call sites
(`poseAttacking`'s idle fallback, and the main state-switch's idle case).
Left `poseBlocking` and `poseHit` alone — a defensive cover-up and a
reactive flinch are reasonably symmetric regardless of facing in a way an
active ready stance isn't, so mirroring them didn't seem worth the added
risk for something not in scope here.

## 12. 100-power VFX + physics catalog (new file: `powerCatalog.js`)

**Scoping this honestly first:** abilities in this engine are freely
generated by the AI every turn — `ability_name` and `description` are
whatever text the model writes (see `promptBuilder.js`), and the engine
has never worked any other way. A "power database" in the sense of a
fixed list of 100 powers the AI picks from would mean the AI no longer
inventing its own abilities — a real change to how the game works, not a
visual pass, and specifically the kind of architecture change the
original brief said not to make. So this is a **100-entry VFX + physics
catalog** that plugs into the exact cosmetic-classification pipeline that
already existed (`actionInterpreter.js`'s keyword matching, the same
"guess a category and variant from the flavor text" approach every
projectile/melee action already went through) — just with far richer
coverage than the ~20 keyword phrases that existed before. Nothing here
is sent to the AI or changes what it can do; a miss falls through to
exactly the same behavior as before this file existed.

**What's in it** (`frontend/src/lib/powerCatalog.js`): 100 power
archetypes across 20 themes (fire, ice, lightning, wind, earth, water,
shadow, light, psychic, sonic, poison, gravity, metal, nature, physical
enhancement, speed, force/telekinesis, illusion, blood, energy/tech — 5
each), every entry carrying: which of Projectile.jsx's existing rendered
shapes it uses (or which melee variant, for the more physical ones),
a color/glow tint, which of particleSystem.js's existing emitter types
flavors its impact, and a physics `tier` (light/medium/heavy/massive).
Validated every field against the actual enums Projectile.jsx/
particleSystem.js/the melee-variant list use — no typos-that-render-as-
nothing.

**Wired in, not just written:**
- `actionInterpreter.js` checks the catalog first (richer, more specific
  than the old keyword list — "chain lightning" now correctly wins over
  a generic "blast" match), falling back to the exact old behavior on a
  miss.
- Matched color/glow now actually reaches the projectile renderer —
  `projectileManager.js` and `Projectile.jsx` both previously had no
  concept of a per-spawn color override, only a fixed per-variant tint.
- **Melee hits get a colored impact-particle burst for the first time** —
  there wasn't one at all before, catalog-matched or not.
- `tier` scales knockback distance and the impact-frame flash/zoom/blur
  strength (see #10) on top of the existing damage-driven scaling — a
  "massive" boulder smash now genuinely reads heavier than a "light" dart
  landing the same numeric damage, not just a bigger number.

**"Ragdoll":** unchanged from what #7 already said — this renderer is
hand-authored forward-kinematics, not a physics engine, and building an
actual one is a genuine architecture change, not a data table. `tier` is
the real physics-feel lever a data file can honestly drive (see above);
I didn't relabel knockback distance as "ragdoll" to appear to cover more
than this actually does.

## 13. Speedster + time-stop / time-slow / time-travel (`movementController.js`, `animationController.js`, `powerCatalog.js`, `App.jsx`, `Stickman.jsx`, `Arena.jsx`)

Four new mechanics, not just four new catalog colors — genuinely new
behavior, matching the spec ("character jitni fast chahe move kar sakta
hai... time stop, time manipulation... proper vfx ke saath").

**Speedster.** `issueCommand` (`movementController.js`) now takes an
optional speed override — previously every dash used the same fixed
speed regardless of ability. Powers tagged `speedster: true` in the
catalog (sonic dash, blitz combo, afterimage strike, flash step, and the
new time-stop/temporal-slam entries) get `SPEEDSTER_DASH_SPEED` (1600,
well above the fastest normal movement at 640) for their approach —
genuinely faster, not just a different color, while still a finite,
bounded number ("obviously kuch limits hongi" — not unlimited/instant).
Paired with a ghost-trail: 3 fading offset copies of the character's
*already-computed* joint positions (no separate pose computation needed —
Stickman.jsx just re-draws the existing spine/legs/head points behind the
main body), active only during the fast dash-in itself.

**Time stop.** Two catalog entries (`time_stop`, `quantum_freeze`, both
tier "massive"/"heavy") freeze the *defender* on impact — a genuine
freeze, not a slow-down: the tick loop calls `updateAnimation` with
`dt=0` for a frozen fighter, so motion doesn't move (velocity × 0) and
every timer holds (nothing decrements by dt) via the exact same code path
everything else already goes through, not a special internal branch.
Paired with a desaturation filter (`feColorMatrix` saturate ≈0) on that
fighter specifically, plus a snap-flash and a "shattered clock" particle
burst at the moment it lands.

**Time slow.** A real slow-motion window, distinct from the freeze above
and from the existing hitstop (a full pause) — `time_slow` scales the
whole tick's `dt` down (to ~32%) for just under a second, so motion,
particles, and camera all genuinely play out slower rather than either
stopping or continuing at normal speed. Starts the moment the ability is
*cast*, not when it lands, so the projectile's own flight reads as
part of the slow-motion rather than arriving at normal speed into it.

**Time travel.** Routed through the existing teleport-flavor system
(`resolveTeleportVariant` / `TELEPORT_PARTICLES` — see #5) rather than a
new mechanic: "time travel / time warp / chrono / rewind" now resolves to
a `temporal` teleport flavor with its own look (a galaxy-ring + starfield
burst instead of the existing lightning/fire/ice/wind/shadow/arcane
looks), reusing the exact vanish-instant snap-reappear sequence #5 already
built rather than inventing a second teleport pipeline for what is, visually,
the same "cut through spacetime and reappear" beat with a different flavor.

## 14. Fight pause + frame-by-frame scrub (`App.jsx`)

**Recording.** A new ring buffer (`frameHistoryRef`, ~10s / 600 frames at
60fps) captures one lightweight snapshot per rendered frame during live
play: both fighters' hp/energy/alive, every pose field Stickman.jsx
actually renders (position, facing, state, attack phase, hit-flash,
teleport fade, hit-stagger, speed-trail, frozen), every live projectile's
position/variant/color, and the camera's x/zoom. This needed real care —
`anim.motion`, `anim.attackPhase`, and projectile objects are all mutated
in place every frame elsewhere in this file (not reassigned), so storing
a snapshot meant explicitly copying out primitive values, never a
reference to the live object — a naive `{...anim}`-style copy would have
made every "historical" frame silently show today's latest state instead
of its own.

**Pausing** now defaults the scrub position to the most recently recorded
frame (pausing shouldn't visually jump anywhere), and **resuming** drops
back to live rendering rather than continuing from wherever was being
reviewed — the underlying simulation was never affected by scrubbing,
only what's displayed.

**Scrubbing:** a panel appears under the arena while paused — a range
slider across the whole buffer, ±1 and ±30 frame step buttons, and a
"Live" button that jumps to the latest frame. Moving it substitutes the
historical snapshot for live state in exactly the props Arena needs
(fighters, poses, camera, projectiles) — Stickman.jsx and Projectile.jsx
needed no changes at all, since from their point of view a scrubbed frame
and a live one are the same shape of data.

**Scope I deliberately left out:** particle replay (cleared during scrub
rather than shown stale/misplaced — replaying exact particle physics
would mean snapshotting every live particle's individual state every
frame, real cost for a purely decorative layer) and status-visuals/
active-effects (kept live — slower-changing, lower value to get exactly
historically accurate). Both were conscious scope cuts to keep this
addition contained and correct rather than trying to make everything
perfectly scrubbable and risking bugs I can't visually verify here.

## 15. Fight recording / export (new file: `fightRecorder.js`)

**Read this section before the others if you only read one** — this
feature is genuinely different in kind from everything else in this
document, and I want to be direct about why rather than let it blend in
with 14 other entries that were all static-analysis-verifiable rendering
math.

**On mp4 vs mkv, honestly:** no browser has an API that produces an
`.mkv` file — Matroska isn't something any browser's `MediaRecorder`
targets, at all. The only way to get a real `.mkv` (or a *guaranteed*-
everywhere `.mp4`) client-side is transcoding with something like
ffmpeg.wasm — a ~25-30MB WebAssembly dependency I have no way to install
or test in this sandbox (no npm/network access here), and not something I
was willing to wire in blind and call done. What this actually does:
asks the browser for `.mp4` first (`MediaRecorder.isTypeSupported`) and
only falls back to `.webm` where the browser genuinely can't produce mp4
itself. Safari and recent Chrome/Edge give you real `.mp4` today; other
browsers get `.webm` — a real, standard, fully playable video format
(VLC, Discord, YouTube, and most video players all take it directly),
just not literally the extension asked for on every browser. I'd rather
tell you that plainly than have you find out after the fact.

**What it does:** there's no direct "record this SVG" browser API, so
`fightRecorder.js` serializes the live arena `<svg>` to a data URL every
frame, draws it onto a hidden `<canvas>` (`XMLSerializer` → `Image` →
`drawImage`), feeds that canvas into `canvas.captureStream(30)`, and
records the result with `MediaRecorder`. A red "Record" button appears
next to Pause once a battle starts; "Stop & Save" ends it, triggers a
download (`battle-<fighter1>-vs-<fighter2>-<timestamp>.mp4/webm`), and
leaves a persistent "Download again" link since auto-download can get
blocked by browser settings. A reset mid-recording stops and discards
rather than leaving a dangling recorder.

**The honest limitation, stated plainly:** every other entry in this
document was deterministic rendering/physics math I could trace through
the actual code paths and be genuinely confident about without running
it. This one leans on browser Media APIs — `MediaRecorder`,
`captureStream`, SVG-as-`Image` loading — that have real, documented
cross-browser quirks (Safari in particular has historically been pickier
about exactly this kind of SVG rasterization) that are very hard to fully
verify by reading code alone, and I have no browser available in this
sandbox to actually run it in. I'm confident in the approach — it's a
standard, well-established technique — but this is the one feature in the
whole session where "please test this yourself before relying on it" is
not just a formality. If it doesn't work cleanly in whatever browser you
test in first, that's a real possibility, not a hedge — tell me what you
see and I'll fix it from there.

## 16. Post-review fixes: idle hand mirroring, damage-before-hit, and continuous exchanges (`characterAnimation.js`, `App.jsx`, `animationController.js`)

Three real bugs from watching an actual fight play out — two were mine
to own directly, one was a bigger mechanical gap underneath the earlier
fixes.

**The idle-stance hand mirroring — my mistake, repeated.** #11's
`poseIdle` rewrite mirrored `upper` by facing but left `lower` as a fixed
value on both the lead and rear arm. Since the hand's actual position
comes from `upper + lower` together (this file's own convention,
documented in #9's `setActingArm` fix), only mirroring half of that sum
meant the right-side fighter's hands landed in a different place than a
true mirror of the left-side fighter's — exactly what you saw, and
exactly the same mistake #9 already fixed once in `setActingArm`/
`poseKick`/`poseRoundhouse`, just reintroduced here. Fixed the same way:
`lower` now gets `* f` too. Audited every other `lower:` assignment in
the file afterward specifically looking for this pattern again — nothing
else had it.

**Damage landing before the hit — a real gap #9 didn't cover.** #9 fixed
the *log text* timing; it explicitly did not touch `setRoster` (what the
hp bars actually render from) or the win-condition UI, both of which
were still updating in the same instant `resolveAction` returned — before
the attacker had even started their approach. That's what made damage
(and, on a finishing blow, the "you win" screen) appear to land before
the hit did. `stateRef.current` — the internal ref the *next* turn's
decision-making reads — still updates immediately, since that has to stay
accurate regardless of animation timing; only the visible `setRoster`
call, the log, and `setWinnerKey`/`setPhase("finished")` now wait for the
same synced moment #9 already established.

**Continuous exchanges — the actual mechanical cause of the stop-start
rhythm.** Every attack ended by walking (or flying) all the way back to
the fighter's *original spawn position* — meaning after every single
exchange, both fighters reset to a standoff at opposite ends of the arena
before the next attack could even begin its approach. That's the literal
mechanism behind "hit, retreat, opponent crosses the whole arena, hit,
retreat" — not a pacing issue to tune, a specific line of code
(`issueCommand(..., homeReturnX)`) doing exactly that every time. Removed
it: a grounded fighter now simply settles into idle wherever the
exchange left them — already at striking range, the way real exchanges
actually stay in the pocket instead of resetting to neutral every
turn. (A fly/hover attacker still comes back down to the ground
afterward — otherwise they'd stay stuck hovering at strike altitude
forever, and the landing VFX from #8 would never fire again — but
straight down at their current position, not a flight back to spawn.)
Knockback still pushes a real hit's target back a natural amount, so
spacing still varies turn to turn — this only removed the artificial
full-arena reset, not all repositioning.

**What this doesn't change:** which ability an AI picks each turn is
backend/prompt behavior, not animation — #4 already pushes toward
varied, resource-aware choices ("prefer creativity over repetition," see
`promptBuilder.js`), and the continuous-exchange fix above should make
whatever the AI does pick read as much more connected regardless. If
turn variety itself is still too repetitive after this, that's a
separate, prompt-focused pass — happy to take it on specifically rather
than bundle a guess at it into this animation fix.

**Noted, not started:** the audio/real-time-sync system you mentioned
wanting next — nothing here touches audio (there isn't one yet), flagging
that I saw it so it's not lost, not attempting it in the same pass as
everything above.

## Files touched across this session
`frontend/src/App.jsx`, `frontend/src/lib/movementController.js`,
`frontend/src/lib/actionInterpreter.js`, `frontend/src/lib/animationController.js`,
`frontend/src/lib/characterAnimation.js`, `frontend/src/lib/cameraController.js`,
`frontend/src/lib/projectileManager.js`, `frontend/src/lib/powerCatalog.js` (new),
`frontend/src/lib/fightRecorder.js` (new), `frontend/src/components/Stickman.jsx`,
`frontend/src/components/Arena.jsx`, `frontend/src/components/Projectile.jsx`,
`backend/src/lib/memory/promptBuilder.js`.

No backend routes, deployment config, database, character/power/ability
schema, or UI layout were touched.

## Honest limitation (unchanged from before)
No network access in this sandbox, so no `npm install` / dev server /
browser to visually confirm any of this. Everything above is as carefully
reasoned through the actual code paths as static reading allows — please
run it locally before shipping to production.
