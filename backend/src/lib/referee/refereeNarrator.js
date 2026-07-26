// ---------- REFEREE / NARRATOR MODULE ----------
// Optional and off by default (session.refereeEnabled, set via
// authorityManager). Does NOT fight. This default implementation is
// rule-based — zero extra LLM calls, zero extra latency/token cost — which
// satisfies "must be optional and easily disabled" and the Phase 3.5
// performance budget at the same time.
//
// To upgrade this to a genuine third AI later (for richer commentary or to
// resolve ambiguous Hybrid-mode events), swap generateNarration's body for
// a callModel() call using a dedicated referee provider/key on the session
// — every call site here already treats narration as "a string that may or
// may not be present", so that swap needs no caller changes.

export function generateNarration({ entry, realityEvent, attackerName, defenderName }) {
  if (!entry) return null;

  if (realityEvent?.authority && realityEvent.authority !== "engine" && realityEvent.rawClaim) {
    const tag = realityEvent.softened ? " — reality strains, but the fight goes on" : "";
    return `${attackerName} ${describeEventType(realityEvent.eventType)}: "${realityEvent.rawClaim}"${tag}.`;
  }

  switch (entry.result) {
    case "lethal":
      return `${attackerName}'s ${entry.ability_name} lands the final blow — ${defenderName} is down!`;
    case "hit":
      return `${attackerName} connects with ${entry.ability_name} for ${entry.damage} damage.`;
    case "miss":
      return `${defenderName} slips past ${attackerName}'s ${entry.ability_name}.`;
    case "defend":
      return `${attackerName} raises their guard.`;
    case "on_cooldown":
      return `${attackerName}'s ${entry.ability_name} isn't ready yet — they improvise.`;
    default:
      return `${attackerName} uses ${entry.ability_name}.`;
  }
}

function describeEventType(type) {
  const VERBS = {
    transformation: "undergoes a transformation",
    fusion: "fuses with unknown power",
    healing: "channels restorative energy",
    adaptation: "adapts on the fly",
    counter: "counters",
    teleport: "teleports",
    shield: "raises a barrier",
    summon: "summons aid",
    time_stop: "warps time itself",
    reality_rewrite: "bends reality",
    beam: "unleashes a beam",
    projectile: "hurls a projectile",
    attack: "attacks",
  };
  return VERBS[type] || "acts";
}
