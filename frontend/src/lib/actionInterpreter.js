// ---------- ACTION INTERPRETER MODULE ----------
// Translates a resolved battle-engine log entry (free-form ability_name +
// description written by an LLM) into a structured animation intent the
// animation controller can act on. This is deliberately keyword/category
// based rather than a hardcoded phrase list — new fighters, new providers,
// and new wording all route through the same categories without code
// changes, and adding a new category later is just another entry below.

const CATEGORY_KEYWORDS = [
  { category: "projectile", variant: "laser", words: ["laser", "beam", "ray"] },
  { category: "projectile", variant: "fireball", words: ["fireball", "flame ball", "fire blast"] },
  { category: "projectile", variant: "energy", words: ["energy blast", "energy bolt", "blast", "bolt", "orb of energy"] },
  { category: "projectile", variant: "arrow", words: ["arrow", "shoot", "shot"] },
  { category: "projectile", variant: "orb", words: ["orb", "sphere", "void ball"] },
  { category: "movement", variant: "dash", words: ["dash", "rush", "blink forward", "close the distance"] },
  { category: "movement", variant: "jump", words: ["jump", "leap", "hop"] },
  { category: "movement", variant: "fly", words: ["fly", "soar", "flight", "airborne"] },
  { category: "movement", variant: "hover", words: ["hover", "levitate", "float"] },
  { category: "movement", variant: "run", words: ["charge", "sprint", "run at"] },
  { category: "melee", variant: "kick", words: ["kick", "knee", "roundhouse"] },
  { category: "melee", variant: "slash", words: ["slash", "sword", "blade", "claw", "cut"] },
  { category: "melee", variant: "punch", words: ["punch", "fist", "strike", "jab", "hit", "smash"] },
];

/**
 * Returns { category, variant } for a resolved log entry. `category` is one
 * of "melee" | "projectile" | "movement" | "block" | "melee" (default).
 */
export function interpretAction(entry) {
  if (entry.action === "Defend" || entry.result === "defend") {
    return { category: "block", variant: "guard" };
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
