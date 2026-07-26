// ---------- REALITY AUTHORITY LAYER ----------
// The module the (client-side) battle engine queries before resolving
// every action. In Engine mode it's a no-op — the engine's own dodge/damage
// math runs completely unchanged, exactly as every prior phase. In AI mode
// it hands the engine an override the engine is instructed to trust
// unconditionally. In Hybrid mode it hands the engine a *scaling factor*,
// so the engine's normal rules (dodge chance, guarding, etc.) still apply,
// just calibrated by how big the AI's narrative claim was.

import { getAuthorityMode } from "./authorityManager.js";
import { interpretReality, INTENSITY_DAMAGE_TABLE } from "./realityInterpreter.js";
import { softenIfInstantWin } from "./antiBoringRule.js";

const HYBRID_MULTIPLIERS = { mild: 0.8, moderate: 1.0, severe: 1.35, extreme: 1.7 };

export function evaluateAction(session, action) {
  const mode = getAuthorityMode(session);

  if (mode === "engine") {
    const event = { authority: "engine" };
    session.lastRealityEvent = { mode, engineDecision: "Engine computes hit/miss/damage as usual.", aiDecision: null, finalEvent: event };
    return event;
  }

  const interpreted = softenIfInstantWin(interpretReality(action));

  if (mode === "ai") {
    const isHeal = interpreted.eventType === "healing";
    const magnitude = INTENSITY_DAMAGE_TABLE[interpreted.intensity] ?? INTENSITY_DAMAGE_TABLE.mild;
    const event = {
      authority: "ai",
      ...interpreted,
      damageOverride: isHeal ? null : magnitude,
      healOverride: isHeal ? magnitude : null,
    };
    session.lastRealityEvent = {
      mode,
      engineDecision: "Suppressed — AI Authority active, engine only records and displays the outcome.",
      aiDecision: interpreted.rawClaim,
      finalEvent: event,
    };
    return event;
  }

  // hybrid
  const multiplier = HYBRID_MULTIPLIERS[interpreted.intensity] ?? 1;
  const event = { authority: "hybrid", ...interpreted, intensityMultiplier: multiplier };
  session.lastRealityEvent = {
    mode,
    engineDecision: `Engine still rolls dodge/guard and computes base damage, scaled x${multiplier}.`,
    aiDecision: interpreted.rawClaim,
    finalEvent: event,
  };
  return event;
}
