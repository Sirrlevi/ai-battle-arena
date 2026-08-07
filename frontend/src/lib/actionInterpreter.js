// ---------- ACTION INTERPRETER MODULE ----------
// Translates a resolved battle-engine log entry (free-form ability_name +
// description written by an LLM) into a structured animation intent the
// animation controller can act on. This is deliberately keyword/category
// based rather than a hardcoded phrase list — new fighters, new providers,
// and new wording all route through the same categories without code
// changes, and adding a new category later is just another entry below.

import { COMBAT_MOVES } from "./stickmanCombatPack.js";
import { matchPower } from "./powerCatalog.js";

const CATEGORY_KEYWORDS = [
  { category: "teleport", variant: "teleport", words: ["teleport", "blink", "phase", "warp", "vanish", "flicker", "shadowstep", "shadow step", "short-hop"] },
  { category: "projectile", variant: "laser", words: ["laser", "beam", "ray"] },
  { category: "projectile", variant: "fireball", words: ["fireball", "flame ball", "fire blast"] },
  { category: "projectile", variant: "energy", words: ["energy blast", "energy bolt", "blast", "bolt", "orb of energy"] },
  { category: "projectile", variant: "arrow", words: ["arrow", "shoot", "shot"] },
  { category: "projectile", variant: "orb", words: ["orb", "sphere", "void ball"] },
  // Explicit range language, independent of any specific element/shape —
  // catches an ability that's clearly long-range by description but
  // doesn't name a specific element the categories above would match
  // (e.g. the 100-power catalog, checked before this list — see
  // interpretAction below). Without this, an ambiguous long-range
  // description could fall all the way through to the melee/punch
  // default, which forces an approach a ranged attack shouldn't need.
  { category: "projectile", variant: "energy", words: ["from a distance", "from afar", "long range", "long-range", "at range", "across the arena", "without closing the distance", "ranged attack"] },
  { category: "movement", variant: "dash", words: ["dash", "rush", "close the distance"] },
  { category: "movement", variant: "jump", words: ["jump", "leap", "hop"] },
  { category: "movement", variant: "fly", words: ["fly", "soar", "flight", "airborne"] },
  { category: "movement", variant: "hover", words: ["hover", "levitate", "float"] },
  { category: "movement", variant: "run", words: ["charge", "sprint", "run at"] },
  { category: "melee", variant: "kick", words: ["kick", "knee"] },
  { category: "melee", variant: "roundhouse", words: ["roundhouse", "spin kick", "spinning kick", "spinning heel"] },
  { category: "melee", variant: "uppercut", words: ["uppercut", "upper cut", "rising fist"] },
  { category: "melee", variant: "slash", words: ["slash", "sword", "blade", "claw", "cut"] },
  { category: "melee", variant: "punch", words: ["punch", "fist", "strike", "jab", "hit", "smash", "close range", "close-range", "up close", "melee range", "hand-to-hand", "hand to hand"] },
];

/**
 * Returns { category, variant, power? } for a resolved log entry. `category`
 * is one of "melee" | "projectile" | "movement" | "teleport" | "block" |
 * "melee" (default). `power`, when present, is the matched entry from
 * powerCatalog.js's 100-power catalog — color/particle/tier data for
 * animationController.js to apply; every existing caller only ever needed
 * category/variant, so this is purely additive.
 */
export function interpretAction(entry) {
  const abilityLower = (entry.ability_name||'').toLowerCase() + ' ' + (entry.description||'').toLowerCase();
  const combatMove = COMBAT_MOVES.find(m => abilityLower.includes(m.name.toLowerCase()) || abilityLower.includes(m.slug));
  if (combatMove) {
    const power = matchPower ? matchPower(entry.ability_name + ' ' + entry.description) : null;
    return { category: 'melee', variant: combatMove.slug, power, isCombatMove: true, combatMove, moveId: combatMove.id };
  }

  if (entry.action === "Defend" || entry.result === "defend") {
    return { category: "block", variant: "guard" };
  }

  // The battle engine's own classification (entry.eventType, or entry.result
  // when it's carried straight through — see battleEngine.js's
  // NON_DAMAGE_EVENTS handling) is authoritative when present: no reason to
  // guess from prose if the engine already knows this was a teleport.
  if (entry.eventType === "teleport" || entry.result === "teleport") {
    return { category: "teleport", variant: "teleport" };
  }

  // The 100-power catalog is checked first — far richer, more specific
  // keyword coverage than the handful of categories below, so a specific
  // match ("chain lightning") wins over a shorter generic one ("blast")
  // the older list alone would have picked. A miss here just falls
  // through to the exact same behavior as before this catalog existed.
  const power = matchPower(entry.ability_name, entry.description);
  if (power) {
    if (power.cat === "melee") return { category: "melee", variant: power.meleeHint, power };
    if (power.cat === "projectile") return { category: "projectile", variant: power.shape, power };
  }

  const text = `${entry.ability_name || ""} ${entry.description || ""}`.toLowerCase();
  for (const { category, variant, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => text.includes(w))) {
      return { category, variant };
    }
  }

  // Unrecognized flavor text still needs *some* animation — default to a
  // melee punch so every action produces visible feedback.
  return { category: "melee", variant: "punch" };
}
