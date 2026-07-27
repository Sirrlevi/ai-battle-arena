// ---------- STATUS EFFECT VISUALS ----------
// Phase 3.95, spec section 6. Mirrors the type keys in
// backend/src/lib/combat/statusEffects.js's STATUS_CATALOG one-for-one, so
// every status the Combat Engine can apply has a deterministic visual — no
// guessing from flavor text. A status the engine never sent never gets a
// visual; a status it did send always does.

export const STATUS_VISUAL_CATALOG = {
  burn: { particle: "fire", color: "#FF7A45", overlay: "ember-glow", label: "Burning" },
  freeze: { particle: "energy", color: "#7DE8FF", overlay: "ice-overlay", label: "Frozen" },
  shock: { particle: "lightning", color: "#F5E663", overlay: "static-flicker", label: "Shocked" },
  poison: { particle: "aura_trail", color: "#8FD62E", overlay: "green-aura", label: "Poisoned" },
  bleed: { particle: "blood", color: "#C23B3B", overlay: "bleed-drip", label: "Bleeding" },
  fear: { particle: "aura_trail", color: "#5A3B7A", overlay: "dark-aura", label: "Feared" },
  blind: { particle: "smoke", color: "#8A8F98", overlay: "vision-fog", label: "Blinded" },
  silence: { particle: "dust", color: "#6C7280", overlay: "muted-glyph", label: "Silenced" },
  confusion: { particle: "magic_circle", color: "#B46BFF", overlay: "swirl", label: "Confused" },
  slow: { particle: "dust", color: "#7C8590", overlay: "tether", label: "Slowed" },
  root: { particle: "rock_fragment", color: "#7C8590", overlay: "roots", label: "Rooted" },
  gravity_lock: { particle: "debris", color: "#4A4E58", overlay: "gravity-well", label: "Gravity Locked" },
  time_stop: { particle: "reality_fragment", color: "#7DE8FF", overlay: "frozen-frame", label: "Time-Stopped" },
  reality_fracture: { particle: "reality_fragment", color: "#B46BFF", overlay: "screen-distortion", label: "Reality Fractured" },
  mana_drain: { particle: "energy", color: "#5A6BFF", overlay: "drain-siphon", label: "Mana Draining" },
  energy_drain: { particle: "energy", color: "#E8B94A", overlay: "drain-siphon", label: "Energy Draining" },
  armor_break: { particle: "debris", color: "#E4443B", overlay: "cracked-armor", label: "Armor Broken" },
  shield_break: { particle: "explosion_ring", color: "#E4443B", overlay: "shield-shatter", label: "Shield Broken" },
  stun: { particle: "stars", color: "#F5E663", overlay: "stun-stars", label: "Stunned" },
  healing_reduction: { particle: "smoke", color: "#8A8F98", overlay: "sickly-tint", label: "Healing Reduced" },
};

export function visualForStatus(type) {
  return STATUS_VISUAL_CATALOG[type] || null;
}

/** Returns the visual list for a fighter's currently-active status array (the existing `fighter.status` shape: [{type, rounds}]). */
export function activeStatusVisuals(statusList) {
  if (!Array.isArray(statusList)) return [];
  return statusList
    .map((s) => visualForStatus(s.type))
    .filter(Boolean);
}
