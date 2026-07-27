// ---------- BEAM CLASH SYSTEM ----------
// Phase 4, spec section 5. The project's battle loop is strictly turn-based
// (one fighter acts, then the other) — there's no moment where two
// simultaneously-fired beams are literally both in flight, since only one
// action resolves per turn. Rather than fabricate a clash the engine never
// validated, this detects the closest real analogue the Combat Engine
// actually produces: a ranged/beam-type ability that the defender chose to
// answer with its own "counter" Defense Packet response (Phase 3.9) — two
// engine-validated forces genuinely meeting, just sequenced through the
// turn structure rather than literally simultaneous.

const BEAM_ELEMENTS = new Set(["fire", "lightning", "physical"]); // physical covers generic "beam"/"laser" abilities with no elemental tag

export function detectBeamClash(entry) {
  const ability = entry.verdict?.ability;
  if (!ability || ability.range !== "ranged") return null;
  if (entry.defense?.chosenResponse !== "counter") return null;

  return {
    element: ability.element,
    winner: entry.counterDamage > 0 ? "defender" : "attacker",
    attackerDamage: entry.damage || 0,
    counterDamage: entry.counterDamage || 0,
  };
}
