// ---------- POWER TIER SYSTEM ----------
// Phase 3.8. A fixed, ordered scale the Combat Engine uses to sanity-check
// every damage calculation. This is the single source of truth for "can X
// physically hurt Y" — nothing else in the engine is allowed to let a large
// tier gap resolve as if the two fighters were peers.

export const POWER_TIERS = [
  { index: 0, name: "Human" },
  { index: 1, name: "Peak Human" },
  { index: 2, name: "Superhuman" },
  { index: 3, name: "Building" },
  { index: 4, name: "City" },
  { index: 5, name: "Mountain" },
  { index: 6, name: "Country" },
  { index: 7, name: "Planet" },
  { index: 8, name: "Star" },
  { index: 9, name: "Galaxy" },
  { index: 10, name: "Universal" },
  { index: 11, name: "Multiversal" },
  { index: 12, name: "Conceptual" },
  { index: 13, name: "Narrative" },
  { index: 14, name: "Author" },
];

const NAME_TO_INDEX = new Map(POWER_TIERS.map((t) => [t.name.toLowerCase(), t.index]));

export const DEFAULT_TIER_INDEX = 1; // "Peak Human" — a safe, unremarkable default for a failed extraction

/**
 * Accepts a tier as a name ("City"), a number, or a loose string ("tier 4",
 * "City level") and returns a clamped 0-14 index. Never throws — an
 * unrecognized value falls back to DEFAULT_TIER_INDEX so a bad LLM
 * extraction can never crash the engine.
 */
export function normalizeTier(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(14, Math.round(value)));
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (NAME_TO_INDEX.has(trimmed)) return NAME_TO_INDEX.get(trimmed);
    const numMatch = trimmed.match(/\d+/);
    if (numMatch) return Math.max(0, Math.min(14, Number(numMatch[0])));
    for (const [name, idx] of NAME_TO_INDEX.entries()) {
      if (trimmed.includes(name)) return idx;
    }
  }
  return DEFAULT_TIER_INDEX;
}

export function tierName(index) {
  return POWER_TIERS[Math.max(0, Math.min(14, index))]?.name || "Peak Human";
}

/**
 * How much raw physical/energy output one tier step represents. Deliberately
 * steep (tiers are meant to represent orders-of-magnitude gaps, e.g. "City"
 * vs "Planet") but capped so a 14-tier gap doesn't overflow into absurd
 * numbers — it just guarantees a total mismatch.
 */
export function tierPowerScore(index) {
  const clamped = Math.max(0, Math.min(14, index));
  return Math.pow(1.6, clamped);
}

/**
 * The core rule from the spec: "A normal human should NEVER physically
 * overpower an omnipotent cosmic entity unless the persona explicitly
 * provides a valid reason." Returns a multiplier (0..1) applied to outgoing
 * damage/effect magnitude based on the tier gap, plus whether the action is
 * gated entirely.
 *
 * `bypass` is true when the attacker's Combat Profile explicitly grants a
 * valid reason to ignore tier (a stated Weakness on the defender, an
 * Ultimate Ability, a Resistance/Immunity-piercing trait, or a Special
 * Condition) — the engine still logs the gap but does not suppress it.
 */
export function tierGate({ attackerTier, defenderTier, bypass = false }) {
  const gap = defenderTier - attackerTier; // positive: defender is stronger
  if (gap <= 0) {
    return { multiplier: 1, blocked: false, gap, note: "No unfavorable tier gap." };
  }
  if (bypass) {
    return {
      multiplier: 1,
      blocked: false,
      gap,
      note: `Tier gap of ${gap} present, but the attacker's profile provides an explicit, valid reason to bypass it.`,
    };
  }
  if (gap === 1) {
    return { multiplier: 0.55, blocked: false, gap, note: "One tier below target — attacks land but are significantly less effective." };
  }
  if (gap === 2) {
    return { multiplier: 0.2, blocked: false, gap, note: "Two tiers below target — attacks barely register." };
  }
  // 3+ tiers: physically cannot meaningfully hurt the target. Action still
  // resolves (never a hard reject — see antiBoringRule / "engine never
  // rejects, it displays") but with effectively no mechanical effect.
  return {
    multiplier: 0.02,
    blocked: true,
    gap,
    note: `Attacker is ${gap} tiers below the target's power scale (${tierName(attackerTier)} vs ${tierName(defenderTier)}) — physically incapable of meaningfully harming them without an explicit narrative reason.`,
  };
}
