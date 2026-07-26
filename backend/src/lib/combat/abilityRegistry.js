// ---------- ABILITY SYSTEM ----------
// Phase 3.8, spec section 4. The AI still writes flavor text (ability_name +
// description) — that never changes, it's the fun part. What changes is
// that the FIRST time a given ability_name shows up for a fighter, the
// engine derives a structured, reusable definition for it from the Reality
// Interpreter's classification + the fighter's Combat Profile, and caches
// it. Every later use of the same-named ability reuses that definition
// instead of re-deriving it — this is what makes cooldowns/costs/ranges
// consistent turn to turn instead of the AI (or engine) reinventing the
// ability's rules every time it's used.

const RANGE_BY_EVENT = {
  attack: "melee", beam: "ranged", projectile: "ranged", counter: "melee", shield: "self",
  healing: "self", teleport: "self", transformation: "self", summon: "ranged", time_stop: "field",
  reality_rewrite: "field", fusion: "self", adaptation: "self",
};

const STATUS_BY_ELEMENT = {
  fire: "burn", ice: "freeze", lightning: "shock", poison: "poison", void: "fear",
  gravity: "gravity_lock", light: null, physical: null,
};

function costForIntensity(intensity, profile) {
  const base = { mild: 8, moderate: 15, severe: 26, extreme: 38 }[intensity] ?? 12;
  // A fighter with low energyCapacity pays proportionally more of their pool
  // for the same nominal ability — keeps a weak human's "big move" actually
  // costly for them specifically, not just a flat number.
  const scarcity = profile?.energyCapacity ? Math.max(0.7, 1.3 - profile.energyCapacity / 15) : 1;
  return Math.round(base * scarcity);
}

function cooldownForIntensity(intensity) {
  return { mild: 1, moderate: 2, severe: 3, extreme: 5 }[intensity] ?? 2;
}

function accuracyForProfile(profile) {
  const skill = profile?.combatSkill ?? 4;
  return Math.round(60 + skill * 3.5); // 60-95
}

/**
 * `interpreted` is the output of realityInterpreter.interpretReality(action)
 * — already computed once per turn for the reality authority layer, so this
 * reuses it rather than re-parsing the ability text a second time.
 */
export function getOrCreateAbility(session, fighterKey, abilityName, { interpreted, profile, actionType } = {}) {
  if (!session.abilityRegistry) session.abilityRegistry = {};
  if (!session.abilityRegistry[fighterKey]) session.abilityRegistry[fighterKey] = {};
  const registry = session.abilityRegistry[fighterKey];

  if (registry[abilityName]) return registry[abilityName];

  const eventType = interpreted?.eventType || "attack";
  const element = interpreted?.element || "physical";
  const intensity = interpreted?.intensity || "mild";
  const statusEffect = STATUS_BY_ELEMENT[element] || null;

  const ability = {
    name: abilityName,
    type: actionType || "Attack",
    damageType: eventType === "healing" ? "none" : element === "physical" ? "physical" : "elemental",
    energyCost: eventType === "healing" ? Math.round(costForIntensity(intensity, profile) * 0.8) : costForIntensity(intensity, profile),
    manaCost: profile?.manaCapacity > 0 && ["reality_rewrite", "time_stop", "summon"].includes(eventType) ? Math.round(costForIntensity(intensity, profile) * 0.6) : 0,
    cooldown: cooldownForIntensity(intensity),
    range: RANGE_BY_EVENT[eventType] || "melee",
    accuracy: accuracyForProfile(profile),
    element,
    castTime: intensity === "extreme" ? 1 : 0,
    duration: ["shield", "transformation"].includes(eventType) ? 3 : 0,
    canMiss: !["healing", "shield", "transformation", "teleport", "summon"].includes(eventType),
    canCrit: eventType === "attack" || eventType === "beam" || eventType === "projectile",
    areaOfEffect: interpreted?.scale === "cosmic" || interpreted?.scale === "regional",
    statusEffects: statusEffect ? [statusEffect] : [],
    counteredBy: [],
    blockedBy: element === "physical" ? ["shield", "guarding"] : ["immunity:" + element],
    requiresLineOfSight: RANGE_BY_EVENT[eventType] !== "self",
    requiresGround: false,
    requiresTarget: eventType !== "healing" && eventType !== "shield" && eventType !== "transformation",
    firstSeenAt: Date.now(),
    timesUsed: 0,
  };

  registry[abilityName] = ability;
  return ability;
}

export function recordAbilityUse(session, fighterKey, abilityName) {
  const ability = session.abilityRegistry?.[fighterKey]?.[abilityName];
  if (ability) ability.timesUsed += 1;
}

export function listAbilities(session, fighterKey) {
  return Object.values(session.abilityRegistry?.[fighterKey] || {});
}
