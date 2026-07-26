// ---------- FORM SYSTEM ----------
// Phase 3.9, spec section 11. Forms are persistent (they carry over turn to
// turn until something changes them again — a new transformation, or an
// engine-forced "Broken Form" when resources collapse) and modify stats,
// not just flavor text. Applied as a multiplier layer on top of the Combat
// Profile — the profile itself never gets mutated, so "what is this fighter
// really capable of" (the profile) and "what state are they in right now"
// (the form) stay separate, exactly like Resources vs. Combat Profile do.

export const FORM_CATALOG = {
  base: { label: "Base Form", statMultiplier: 1, tierBonus: 0, cooldownMultiplier: 1 },
  awakened: { label: "Awakened Form", statMultiplier: 1.25, tierBonus: 0, cooldownMultiplier: 0.9 },
  ascended: { label: "Ascended Form", statMultiplier: 1.6, tierBonus: 1, cooldownMultiplier: 0.85 },
  ultra: { label: "Ultra Form", statMultiplier: 2, tierBonus: 1, cooldownMultiplier: 0.75 },
  god: { label: "God Form", statMultiplier: 2.6, tierBonus: 2, cooldownMultiplier: 0.65 },
  author: { label: "Author Form", statMultiplier: 3.2, tierBonus: 3, cooldownMultiplier: 0.5 },
  corrupted: { label: "Corrupted Form", statMultiplier: 1.8, tierBonus: 1, cooldownMultiplier: 0.8, sideEffect: "healingReduced" },
  broken: { label: "Broken Form", statMultiplier: 0.5, tierBonus: -1, cooldownMultiplier: 1.3, sideEffect: "vulnerable" },
};

const NAME_ALIASES = new Map(Object.entries(FORM_CATALOG).map(([key, def]) => [def.label.toLowerCase(), key]));

/** Loosely matches a free-form form name (from an ability_name/description or an AI's stated transformTo) to a catalog key. Never throws — falls back to "base". */
export function resolveFormKey(name) {
  if (!name) return "base";
  const lower = String(name).toLowerCase();
  if (FORM_CATALOG[lower]) return lower;
  if (NAME_ALIASES.has(lower)) return NAME_ALIASES.get(lower);
  for (const key of Object.keys(FORM_CATALOG)) {
    if (lower.includes(key)) return key;
  }
  return "base";
}

/**
 * Returns a *copy* of the profile with stat fields scaled by the current
 * form and combatTierIndex bumped by the form's tierBonus (clamped 0-14).
 * Everything else (weaknesses, resistances, knownPowers...) passes through
 * unchanged — a form changes how strong you are, not who you are.
 */
export function applyFormToProfile(profile, formKey) {
  const form = FORM_CATALOG[formKey] || FORM_CATALOG.base;
  if (formKey === "base" || !profile) return { ...profile, activeForm: "base", formLabel: FORM_CATALOG.base.label };

  const scale = (v) => Math.max(0, Math.min(10, Math.round((v ?? 4) * form.statMultiplier)));
  return {
    ...profile,
    strength: scale(profile.strength),
    speed: scale(profile.speed),
    durability: scale(profile.durability),
    combatSkill: scale(profile.combatSkill),
    combatTierIndex: Math.max(0, Math.min(14, (profile.combatTierIndex ?? 1) + form.tierBonus)),
    activeForm: formKey,
    formLabel: form.label,
    formSideEffect: form.sideEffect || null,
  };
}

export function formCooldownMultiplier(formKey) {
  return (FORM_CATALOG[formKey] || FORM_CATALOG.base).cooldownMultiplier;
}
