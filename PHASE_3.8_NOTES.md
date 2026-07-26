# Phase 3.8 — Combat Engine Rewrite

## What changed (backend, new `backend/src/lib/combat/`)

- **tiers.js** — the 15-tier power scale (Human → Author) + `tierGate()`,
  which caps outgoing damage/effect magnitude when there's an unfavorable
  tier gap, unless the attacker's profile gives an explicit reason to
  bypass it (an Ultimate Ability, or the defender having a matching stated
  Weakness).
- **combatProfile.js** — one LLM call per fighter, before the tier/damage
  math ever runs, that converts their persona into a structured Combat
  Profile (stats, tier, powers, weaknesses, resistances, immunities...).
  Cached on the session — never re-run mid-battle.
- **resources.js** — HP/energy/mana/stamina/shield/armor as independent
  pools sized off the Combat Profile, plus cooldowns.
- **statusEffects.js** — the full status catalog from the spec (burn,
  freeze, stun, silence, gravity_lock, time_stop, etc.), with stacking
  rules and per-round ticking.
- **abilityRegistry.js** — the first time a fighter uses an ability by
  name, it's converted into a structured object (cost, cooldown, range,
  accuracy, element, crit/miss flags, status effects it applies) and
  cached — later uses of the same name reuse that definition instead of
  re-deriving it.
- **validation.js** — checked before any damage math: resources, cooldown,
  valid target, stun/silence, shield-blocks-element. Rejections downgrade
  the turn instead of silently failing, and always carry a `reason`.
- **damage.js** — the deterministic damage formula (no `Math.random()`
  anywhere): tier gate × stat power × fatigue (energy/stamina ratio) ×
  elemental resistance × crit × defense, then shield absorption. Hit/miss
  is a deterministic accuracy-vs-evasion comparison, not a dice roll.
- **worldState.js** — the live per-turn snapshot (HP/energy/mana/stamina/
  cooldowns/status/tier for both fighters + arena) that now gets injected
  into the AI's prompt so it can actually see its own state.
- **combatEngine.js** — orchestrates all of the above into one **Engine
  Verdict** per turn: valid/invalid + why, damage + full breakdown, status
  effects applied, resource costs, a rough physics readout (knockback).

## Wiring

- `decisionEngine.js` now extracts/caches both fighters' Combat Profiles
  and runs the full pipeline above, **only when Authority Mode is
  "Engine"** (the default). AI/Hybrid Authority are untouched — same
  prompts, same behavior as before Phase 3.8.
- `promptBuilder.js` gained additive fields only: the Action Intent schema
  now includes `reason`, `risk`, `movement`, `follow_up_plan`, and the
  user prompt gets a `world_state` block (only populated in Engine mode).
- `battleTurn.js` / `api.js` now also return a `verdict` field alongside
  the existing `action`/`reality`/`narration` — nothing existing was
  removed or renamed.
- `battleEngine.js` (frontend) now applies `verdict` directly when
  present in Engine mode (deterministic hit/damage/status/heal) instead of
  rolling `Math.random()` dodge/damage. **If no verdict is present for any
  reason, it falls back to the exact old random logic** — so an older
  session or a profile-extraction failure can never hard-stop a battle.
- New endpoint: `GET /api/session/:id/combat` returns Combat Profiles,
  live resources, and the ability registry — the Debug Panel data source
  (spec section 15). Not yet wired into a UI panel component; the data is
  there for one to be added.

## What's intentionally unchanged

- Character generation, Battle Memory, the opponent-analysis/strategy
  pipeline, the Reality Authority Layer's AI/Hybrid modes, Timeline/Arena
  rendering, the Stickman renderer, and the existing REST API shape are
  all untouched. AI/Hybrid Authority battles play exactly as they did
  before this phase.
- Client-side movement/collision/camera physics are unchanged; the new
  `physics` field on the verdict (knockback, impact radius) is provided
  for those systems to optionally consume later — it isn't force-wired in.

## Try it

1. `cd backend && npm install && npm run dev` (or however you normally run
   it — nothing changed there).
2. `cd frontend && npm install && npm run dev`.
3. Start a battle with **Authority Mode: Engine** (the default). Generate
   one very mundane character ("office worker, no powers") against one
   explicitly cosmic character ("omnipotent being outside reality") and
   watch the weak one's attacks land for near-zero damage with a
   `TIER_BLOCKED` verdict reason instead of occasionally one-shotting a god.
4. `GET /api/session/:id/combat` to see both Combat Profiles, live
   resources, and derived abilities for a given battle.
