// ---------- COMBAT PROFILE EXTRACTION ----------
// Phase 3.8, spec section 1. Before combat math ever runs, both fighters'
// free-form persona prompts get converted ONCE into a structured, numeric
// Combat Profile. From that point forward the raw prompt text is never
// touched again by the engine — the profile is the source of truth. Cached
// on session.combatProfiles[fighterKey] (see performance/caching notes,
// spec section 16): a 100-round battle only pays this LLM call twice, not
// twice per round.

import { callModel } from "../../providers/index.js";
import { extractJSON } from "../extractJson.js";
import { normalizeTier, DEFAULT_TIER_INDEX } from "./tiers.js";
import { logger } from "../logger.js";

const PROFILE_FIELDS = [
  "name", "species", "combatTier", "strength", "speed", "durability", "intelligence",
  "combatSkill", "experience", "stamina", "energyCapacity", "manaCapacity", "regeneration",
  "healingAbility", "mobility", "flight", "teleportation", "realityManipulation",
  "timeManipulation", "spaceManipulation", "mindControl", "summoning", "weaponType",
  "knownPowers", "passiveAbilities", "ultimateAbility", "weaknesses", "resistances",
  "immunities", "specialConditions",
];

function extractionSystemPrompt() {
  return (
    "You are the Combat Profile Extractor for a battle simulation engine. Given a fighter's persona " +
    "(name, personality, combat style, weapon, aura, and any free-form description), analyze it and produce " +
    "a permanent, structured Combat Profile. This profile becomes the mechanical source of truth for the " +
    "entire battle — be honest and consistent with the persona's actual implied power level. A mundane human " +
    "must get a low, human-scale profile even if described dramatically; an explicitly cosmic/omnipotent " +
    "persona must get a profile that reflects that. Do not inflate or deflate power for drama.\n\n" +
    "combatTier must be exactly one of: Human, Peak Human, Superhuman, Building, City, Mountain, Country, " +
    "Planet, Star, Galaxy, Universal, Multiversal, Conceptual, Narrative, Author.\n" +
    "strength, speed, durability, intelligence, combatSkill, experience, stamina, energyCapacity, " +
    "manaCapacity, regeneration, healingAbility, mobility are all integers 0-10.\n" +
    "flight, teleportation, realityManipulation, timeManipulation, spaceManipulation, mindControl, summoning " +
    "are all booleans.\n" +
    "weaponType is a short string. knownPowers, passiveAbilities, resistances, immunities, weaknesses are " +
    "short string arrays (weaknesses should be concrete and usable by the engine, e.g. \"fire\", \"attacks " +
    "from behind\", \"loses power in direct sunlight\" — empty array if truly none apply). ultimateAbility and " +
    "specialConditions are short strings (empty string if none).\n\n" +
    "Respond with ONLY a JSON object, no prose, no markdown fences, with exactly these keys: " +
    PROFILE_FIELDS.join(", ") + "."
  );
}

function extractionUserPrompt({ name, personality, combatStyle, weapon, aura, customPrompt, intro }) {
  return JSON.stringify({
    name,
    personality,
    combatStyle,
    weapon,
    aura,
    intro,
    additionalPersonaNotes: customPrompt || "",
    instruction: "Extract this fighter's permanent Combat Profile per the schema.",
  });
}

function fallbackProfile(name) {
  // A safe, unremarkable default. Used only if extraction fails entirely —
  // per spec section 13, the engine must never invent flashy behavior, so
  // the fallback is deliberately plain rather than guessed-powerful.
  return {
    name: name || "Fighter",
    species: "Unknown",
    combatTier: "Peak Human",
    combatTierIndex: DEFAULT_TIER_INDEX,
    strength: 4, speed: 4, durability: 4, intelligence: 4, combatSkill: 4, experience: 4,
    stamina: 4, energyCapacity: 4, manaCapacity: 0, regeneration: 2, healingAbility: 0, mobility: 4,
    flight: false, teleportation: false, realityManipulation: false, timeManipulation: false,
    spaceManipulation: false, mindControl: false, summoning: false,
    weaponType: "none", knownPowers: [], passiveAbilities: [], ultimateAbility: "",
    weaknesses: [], resistances: [], immunities: [], specialConditions: "",
    extractionFailed: true,
  };
}

function normalizeProfile(parsed, name) {
  const clampInt = (v, fallback = 4) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(10, Math.round(Number(v)))) : fallback);
  const tierIndex = normalizeTier(parsed.combatTier);
  return {
    name: parsed.name || name || "Fighter",
    species: parsed.species || "Unknown",
    combatTier: parsed.combatTier || "Peak Human",
    combatTierIndex: tierIndex,
    strength: clampInt(parsed.strength),
    speed: clampInt(parsed.speed),
    durability: clampInt(parsed.durability),
    intelligence: clampInt(parsed.intelligence),
    combatSkill: clampInt(parsed.combatSkill),
    experience: clampInt(parsed.experience),
    stamina: clampInt(parsed.stamina),
    energyCapacity: clampInt(parsed.energyCapacity),
    manaCapacity: clampInt(parsed.manaCapacity, 0),
    regeneration: clampInt(parsed.regeneration, 2),
    healingAbility: clampInt(parsed.healingAbility, 0),
    mobility: clampInt(parsed.mobility),
    flight: !!parsed.flight,
    teleportation: !!parsed.teleportation,
    realityManipulation: !!parsed.realityManipulation,
    timeManipulation: !!parsed.timeManipulation,
    spaceManipulation: !!parsed.spaceManipulation,
    mindControl: !!parsed.mindControl,
    summoning: !!parsed.summoning,
    weaponType: parsed.weaponType || "none",
    knownPowers: Array.isArray(parsed.knownPowers) ? parsed.knownPowers.slice(0, 12) : [],
    passiveAbilities: Array.isArray(parsed.passiveAbilities) ? parsed.passiveAbilities.slice(0, 8) : [],
    ultimateAbility: parsed.ultimateAbility || "",
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 8) : [],
    resistances: Array.isArray(parsed.resistances) ? parsed.resistances.slice(0, 8) : [],
    immunities: Array.isArray(parsed.immunities) ? parsed.immunities.slice(0, 8) : [],
    specialConditions: parsed.specialConditions || "",
    extractionFailed: false,
  };
}

/** Reads a cached profile without triggering extraction, or null if not yet built. */
export function getCombatProfile(session, fighterKey) {
  return session.combatProfiles?.[fighterKey] || null;
}

/**
 * Extracts (or returns the cached) Combat Profile for one fighter. Safe to
 * call every turn — after the first successful extraction this is a pure
 * cache read with zero LLM cost, per spec section 16.
 */
export async function getOrExtractCombatProfile(session, fighterKey, { config, character, customPrompt, referer, sessionId } = {}) {
  if (!session.combatProfiles) session.combatProfiles = {};
  if (session.combatProfiles[fighterKey]) return session.combatProfiles[fighterKey];

  try {
    const raw = await callModel({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: extractionSystemPrompt(),
      userPrompt: extractionUserPrompt({
        name: character?.name,
        personality: character?.personality,
        combatStyle: character?.combatStyle,
        weapon: character?.weapon,
        aura: character?.aura,
        intro: character?.intro,
        customPrompt,
      }),
      referer,
    });
    const parsed = extractJSON(raw);
    if (!parsed) throw new Error("Combat Profile extraction returned invalid JSON.");
    const profile = normalizeProfile(parsed, character?.name);
    session.combatProfiles[fighterKey] = profile;
    logger.info("combatProfile:extracted", { sessionId, fighterKey, tier: profile.combatTier });
    return profile;
  } catch (err) {
    logger.error("combatProfile:extraction-failed", { sessionId, fighterKey, error: err.message });
    const profile = fallbackProfile(character?.name);
    session.combatProfiles[fighterKey] = profile;
    return profile;
  }
}

export function resetCombatProfiles(session) {
  session.combatProfiles = {};
}

export { PROFILE_FIELDS };
