# Phase 3.9 — AI Negotiation Protocol

Builds on Phase 3.8 (Combat Profiles, tiers, resources, deterministic
damage). Nothing from 3.8 was removed or renamed — this phase adds the
*defender's* side of the equation.

## The four-stage protocol (Engine Authority mode)

1. **Attacker Intent** — unchanged: the attacking fighter's LLM call
   produces an action (now also carrying `reason`/`risk`/`movement`/
   `follow_up_plan` from 3.8).
2. **Attack Packet** (`combat/attackPacket.js`) — the action + its derived
   Ability get converted into a structured packet (ability, element,
   costs, cooldown, range, risk level, etc.) before anything touches HP.
3. **Defense Packet** (`combat/defensePacket.js`) — a **second LLM call**,
   to the *defending* fighter's own provider/model/key, given the Attack
   Packet plus a mirrored World State of its own resources/cooldowns/
   status. It chooses: dodge, block, counter, shield, teleport,
   reality_defense, time_defense, passive, transformation, or none — and
   states what it's spending to do it.
4. **Engine Validation + World Sync** — `validateDefensePacket()` checks
   the defender can actually afford/perform the chosen response (capability
   flags like `realityManipulation`/`teleportation`, cooldowns, resources)
   before `combatEngine.js` folds it into the same deterministic damage
   pipeline from 3.8, then mutates both fighters' resource state directly.

## What each defense choice actually does (`combatEngine.js`)

- **dodge / teleport** — the hit is fully avoided (verdict code `DEFENDED`).
- **block** — damage × 0.4.
- **passive** — damage × 0.75.
- **reality_defense / time_defense** — damage × 0.15 (only usable if the
  Combat Profile actually has that capability).
- **shield** — raises a shield of a size derived from the defender's own
  profile, absorbed the same way Phase 3.8's healing-ability shields are.
- **transformation** — swaps in a form-boosted profile (see `forms.js`,
  spec section 11: Base/Awakened/Ascended/Ultra/God/Author/Corrupted/
  Broken) for this hit, and persists the new form going forward.
- **counter** — a deterministic combat-skill/speed comparison; on success,
  the defender takes reduced damage AND reflects damage back onto the
  attacker (`verdict.counterDamage`, applied to the attacker's own HP both
  server-side and in the frontend's `resolveAction`).
- **none** / anything the defender can't actually afford or perform gets
  downgraded to "no special defense" — never fabricated, never silently
  dropped (`verdict.defense.note` always explains why).

## Other additions

- **`forms.js`** — the persistent Form System (spec section 11).
- **`negotiationMemory.js`** — tracks each fighter's defensive habits
  (favored response, counter success rate, dodge frequency, healing
  thresholds, transformation timing, risk tolerance) and feeds a summary
  into the *opponent's* World State next turn, so both sides adapt instead
  of repeating themselves (spec section 10/13).
- **Reality Stability / Mental Stability** — two new resource pools
  (`resources.js`), spent by reality/time-manipulation attacks and
  defenses.
- **World State** (`worldState.js`) now also carries armor, both stability
  pools, summons, and an approximate distance/range read (best-effort —
  the frontend doesn't currently transmit x/y positions per turn, so this
  degrades gracefully to `"unknown"` rather than guessing).
- `GET /api/session/:id/combat` now also returns `negotiationMemory`.
- `battleTurn.js`/`api.js` responses gained `attackPacket` and
  `defensePacket` fields (additive — nothing existing changed shape).

## Cost/latency tradeoff (please read before enabling broadly)

This phase adds **a second LLM call per turn** (the defender's Defense
Packet) whenever Authority Mode is Engine and the action targets the
opponent. That roughly doubles per-turn latency and token cost in Engine
mode. This was the explicit point of the spec ("AI fighters actively
negotiate"), but it's worth knowing before running long battles.

## Scoping note

The spec's section 8 says Hybrid should become "the recommended mode" for
the full negotiation protocol. To keep this update additive and low-risk
(per "DO NOT redesign... DO NOT replace previous phases"), I wired the
negotiation protocol into **Engine Authority mode only** — AI and Hybrid
Authority are completely untouched by Phase 3.9, exactly as they were
after Phase 3.8. Extending Hybrid to use the same `attackPacket.js` /
`defensePacket.js` / `validateDefensePacket()` building blocks is a
straightforward follow-up (they're already mode-agnostic), just flagging
that it's not done in this pass.

## Try it

Same setup as Phase 3.8. Watch the backend logs (`defensePacket:failed` /
`decisionEngine:turn`) during a battle in Engine mode — you'll see two
provider calls per turn instead of one, and `GET /api/session/:id/combat`
will show `negotiationMemory` filling in with each fighter's defensive
tendencies as the fight progresses.
