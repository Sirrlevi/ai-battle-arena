// ---------- REALITY INTERPRETER MODULE ----------
// Converts an AI's narrative action (ability_name + description +
// expected_result) into structured data: an eventType from a fixed
// vocabulary, an element, a scale, an intensity, and any special effects
// mentioned. This is what lets Hybrid/AI Authority modes "translate instead
// of reject" — a wild claim always becomes *something* the engine and
// renderer can consume, never a hard failure.

const EVENT_TYPE_KEYWORDS = [
  { type: "transformation", words: ["transform", "evolve", "ascend", "awaken", "unleash true form", "power up"] },
  { type: "fusion", words: ["fuse", "fusion", "merge with"] },
  { type: "healing", words: ["heal", "regenerat", "restore health", "mend"] },
  { type: "adaptation", words: ["adapt", "resist now", "immune to", "learned to counter"] },
  { type: "counter", words: ["counter", "reflect", "parry"] },
  { type: "teleport", words: ["teleport", "blink", "phase", "warp", "vanish"] },
  { type: "shield", words: ["shield", "barrier", "ward", "guard field"] },
  { type: "summon", words: ["summon", "conjure", "call forth"] },
  { type: "time_stop", words: ["stop time", "freeze time", "time stop"] },
  { type: "reality_rewrite", words: ["rewrite reality", "alter reality", "reshape existence", "bend the rules"] },
  { type: "beam", words: ["beam", "laser", "ray"] },
  { type: "projectile", words: ["fireball", "arrow", "orb", "bolt", "blast", "energy ball"] },
];

const ELEMENT_KEYWORDS = [
  { element: "fire", words: ["fire", "flame", "inferno", "burn"] },
  { element: "ice", words: ["ice", "frost", "freeze"] },
  { element: "lightning", words: ["lightning", "thunder", "electric"] },
  { element: "void", words: ["void", "abyss", "darkness", "shadow"] },
  { element: "light", words: ["light", "radiant", "holy"] },
  { element: "gravity", words: ["gravity", "black hole", "singularity"] },
  { element: "poison", words: ["poison", "venom", "toxic"] },
  { element: "physical", words: ["punch", "kick", "slash", "blade", "strike"] },
];

const SCALE_KEYWORDS = [
  { scale: "omniversal", words: ["omniversal", "multiverse", "all realities", "every universe"] },
  { scale: "cosmic", words: ["cosmic", "galaxy", "star", "universe", "planet"] },
  { scale: "regional", words: ["citywide", "mountain", "entire arena", "massive"] },
  { scale: "local", words: [] }, // default
];

const INTENSITY_DAMAGE = { mild: 10, moderate: 22, severe: 38, extreme: 55 };

function matchFirst(text, table, fallback) {
  for (const row of table) {
    if (row.words.some((w) => text.includes(w))) return row.type || row.element || row.scale;
  }
  return fallback;
}

function estimateIntensity(text, claimedEnergyCost) {
  if (/\b(instant|absolute|infinite|omnipotent|unstoppable)\b/.test(text)) return "extreme";
  if (/\b(devastat|overwhelm|cataclysm|annihilat)\b/.test(text)) return "extreme";
  if (/\b(power(ful)?|strong|heavy|major)\b/.test(text)) return "severe";
  if (claimedEnergyCost >= 30) return "severe";
  if (claimedEnergyCost >= 18) return "moderate";
  return "mild";
}

function extractSpecialEffects(text) {
  const effects = [];
  const CATALOG = [
    ["reality crack", /reality (crack|tear|fracture)/],
    ["black lightning", /black lightning/],
    ["massive shockwave", /shock ?wave/],
    ["gravity distortion", /gravity (well|distort|pull)/],
    ["time dilation", /time (slow|dilat)/],
    ["afterimage", /after-?image/],
  ];
  for (const [label, re] of CATALOG) {
    if (re.test(text)) effects.push(label);
  }
  return effects;
}

/**
 * `action` is the raw parsed LLM turn action (thought/action/ability_name/
 * description/energy_cost/expected_result). Returns a structured reality
 * event — always, even for a perfectly mundane punch (eventType "attack",
 * local scale, mild intensity) — so downstream code never branches on
 * "was this interpreted or not".
 */
export function interpretReality(action) {
  const text = `${action.ability_name || ""} ${action.description || ""} ${action.expected_result || ""}`.toLowerCase();

  const eventType = matchFirst(text, EVENT_TYPE_KEYWORDS, action.action === "Defend" ? "shield" : "attack");
  const element = matchFirst(text, ELEMENT_KEYWORDS, "physical");
  const scale = matchFirst(text, SCALE_KEYWORDS, "local");
  const intensity = estimateIntensity(text, Number(action.energy_cost) || 0);
  const specialEffects = extractSpecialEffects(text);

  return {
    eventType,
    element,
    scale,
    intensity,
    specialEffects,
    rawClaim: `${action.ability_name || ""} — ${action.description || action.expected_result || ""}`.trim(),
    transformTo: eventType === "transformation" ? (action.ability_name || "new form") : null,
    isUltimate: intensity === "extreme" || scale === "cosmic" || scale === "omniversal",
  };
}

export const INTENSITY_DAMAGE_TABLE = INTENSITY_DAMAGE;
