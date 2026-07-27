// ---------- DYNAMIC AURA SYSTEM ----------
// Phase 4, spec section 6. The aura is a pure function of live, already-
// known state — hp%, energy%, whether a transformation is mid-play, and
// (when Engine Authority + a cached Combat Profile is available — see
// api.getCombatDebug, Phase 3.8) power tier — never invented by the
// renderer. Degrades gracefully when tier info isn't available (AI/Hybrid
// Authority, or before the debug fetch resolves): it just uses hp/energy.

const TIER_COLOR_SHIFT = [
  "#8FD62E", "#8FD62E", "#7DE8FF", "#7DE8FF", "#5A6BFF", "#5A6BFF",
  "#B46BFF", "#B46BFF", "#E8B94A", "#E8B94A", "#FF7A45", "#FF7A45",
  "#E4443B", "#FFFFFF", "#FFFFFF",
]; // index 0-14, mirrors backend tiers.js's POWER_TIERS ordering (Human -> Author)

export function computeAura({ hpPct = 1, energyPct = 1, transformProgress = 0, combatTierIndex = null, baseColor, isCharging = false, t = 0, pulseSpeed = 1 }) {
  const tierBoost = combatTierIndex != null ? Math.min(1, combatTierIndex / 14) : 0;
  const distress = hpPct < 0.3 ? (0.3 - hpPct) / 0.3 : 0; // low-hp auras flicker/thin out

  const baseRadius = 46 + tierBoost * 22 + transformProgress * 30;
  const pulse = Math.sin(t * pulseSpeed * (isCharging ? 5 : 1.6)) * (isCharging ? 8 : 3);
  const radius = baseRadius + pulse - distress * 10;

  const baseOpacity = 0.16 + energyPct * 0.1 + tierBoost * 0.08 + transformProgress * 0.22;
  const flicker = distress > 0 ? (0.5 + 0.5 * Math.sin(t * 18)) * distress * 0.1 : 0;
  const opacity = Math.max(0.05, baseOpacity - flicker);

  const color = combatTierIndex != null ? TIER_COLOR_SHIFT[Math.max(0, Math.min(14, combatTierIndex))] : baseColor;

  return {
    radius, opacity, color: color || baseColor,
    ringVisible: isCharging || transformProgress > 0 || tierBoost > 0.5,
    ringWidth: isCharging ? 3 + pulse * 0.3 : 2,
    particleRate: isCharging ? "high" : transformProgress > 0 ? "medium" : "low",
  };
}
