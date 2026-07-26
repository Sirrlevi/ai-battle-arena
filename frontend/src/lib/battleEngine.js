// ---------- BATTLE ENGINE MODULE ----------
// Deterministic combat resolution — still the project's single source of
// truth for HP/energy/death. Phase 3.5 adds one thing: resolveAction() now
// accepts an optional `reality` object (produced server-side by the Reality
// Authority Layer). When `reality` is absent or `reality.authority ===
// "engine"` — which is the default and everything before this phase — this
// function's Attack/Special resolution path is byte-for-byte the same dodge
// roll + damage formula it has always been. AI/Hybrid Authority only change
// behavior when a session explicitly opts into them.

const EFFECT_KEYWORDS = [
  { type: "fire", words: ["fire", "flame", "blaze", "burn", "inferno", "ember"] },
  { type: "ice", words: ["ice", "frost", "freeze", "frozen", "glacial", "chill"] },
  { type: "laser", words: ["laser", "beam", "ray", "bolt"] },
  { type: "teleport", words: ["teleport", "blink", "phase", "warp", "vanish", "flicker"] },
  { type: "poison", words: ["poison", "venom", "toxic", "plague", "corrode"] },
  { type: "stun", words: ["stun", "paraly", "shock", "daze", "static"] },
  { type: "explosion", words: ["explo", "blast", "detonat", "bomb", "shatter"] },
];

const EFFECT_EMOJI = {
  laser: "⚡",
  fire: "🔥",
  ice: "❄️",
  teleport: "🌀",
  explosion: "💥",
  shield: "🛡️",
  poison: "☠️",
  stun: "⭐",
};

// Mirrors backend/src/lib/authority/realityInterpreter.js's INTENSITY_DAMAGE_TABLE
// so an AI-Authority override lands in the same numeric range the backend
// reasoned about when it produced the event.
const INTENSITY_MAGNITUDE = { mild: 10, moderate: 22, severe: 38, extreme: 55 };

// Event types that change something other than the defender's HP.
const NON_DAMAGE_EVENTS = new Set(["healing", "transformation", "teleport", "summon", "shield", "adaptation", "counter", "fusion", "reality_rewrite", "time_stop"]);

export function inferEffectType(entry) {
  const text = `${entry.ability_name || ""} ${entry.description || ""}`.toLowerCase();
  for (const { type, words } of EFFECT_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return type;
  }
  if (entry.action === "Defend" || entry.result === "defend") return "shield";
  if (entry.result === "lethal") return "explosion";
  return null;
}

export function effectEmoji(type) {
  return type ? EFFECT_EMOJI[type] || null : null;
}

export function resolveAction(round, attacker, defender, action, reality = null, verdict = null) {
  const entry = {
    round,
    actorKey: attacker.key,
    actorName: attacker.name,
    defenderKey: defender.key,
    thought: action?.thought || "",
    action: action?.action || "Attack",
    ability_name: action?.ability_name || "Strike",
    description: action?.description || "",
    result: "hit",
    damage: 0,
    engineNote: "",
    eventType: reality?.eventType || "attack",
    transformTo: reality?.transformTo || null,
    isUltimate: !!reality?.isUltimate,
    // Phase 3.8: the deterministic Combat Engine's explanation for this
    // outcome (tier gate, validation reason, damage breakdown), when present.
    verdict: verdict || null,
  };

  const round_available = attacker.cooldowns[entry.ability_name] || 0;
  if (round_available > round) {
    entry.result = "on_cooldown";
    entry.engineNote = `${entry.ability_name} is still on cooldown (ready round ${round_available}). Engine substitutes a basic strike.`;
    entry.ability_name = "Basic Strike";
  }

  let cost = Math.max(0, Math.min(Number(action?.energy_cost) || 12, 40));
  if (cost > attacker.energy) {
    entry.engineNote += ` Insufficient energy for full technique — engine caps output.`;
    cost = attacker.energy;
  }
  attacker.energy = Math.max(0, attacker.energy - cost);
  attacker.cooldowns[entry.ability_name] = round + 2;

  if (entry.action === "Defend") {
    attacker.status.push({ type: "guarding", rounds: 1 });
    entry.result = "defend";
    entry.effect = inferEffectType(entry);
    return entry;
  }

  const authority = reality?.authority || "engine";

  // ---------- Engine / Hybrid server verdict path ----------
  if (authority === "engine" || (authority === "hybrid" && verdict?.damage !== undefined)) {
    // Phase 3.8: a Combat Profile-aware, deterministic verdict computed
    // server-side (see backend/src/lib/combat/combatEngine.js) — tiers,
    // resources, cooldowns, status effects, and a real damage formula
    // instead of a random dodge roll converting everything into flat
    // damage. Applied directly when present.
    if (verdict) {
      entry.engineNote = verdict.reason || "";

      if (!verdict.valid) {
        // Validated-impossible action (no resources, on cooldown, stunned,
        // etc.) — downgraded, never invented. See spec section 6/13.
        entry.result = "on_cooldown";
        entry.damage = 0;
        entry.effect = inferEffectType(entry);
        return entry;
      }

      if (verdict.code === "DEFEND") {
        attacker.status.push({ type: "guarding", rounds: 1 });
        entry.result = "defend";
        entry.effect = inferEffectType(entry);
        return entry;
      }

      if (verdict.healing > 0) {
        attacker.hp = Math.min(attacker.maxHp ?? 100, attacker.hp + verdict.healing);
        entry.healing = verdict.healing;
        entry.result = "heal";
        entry.effect = inferEffectType(entry);
        return entry;
      }

      if (verdict.code === "MISS") {
        entry.result = "miss";
        entry.effect = inferEffectType(entry);
        return entry;
      }

      if (!verdict.ability?.requiresTarget) {
        // Shield / transformation / other self-directed, non-damage event.
        entry.result = entry.eventType;
        entry.effect = inferEffectType(entry);
        return entry;
      }

      const dmg = Math.max(0, Math.round(verdict.damage || 0));
      defender.hp = Math.max(0, defender.hp - dmg);
      if (defender.hp === 0) defender.alive = false;
      entry.damage = dmg;
      entry.result = defender.hp === 0 ? "lethal" : dmg === 0 ? "on_cooldown" : "hit";
      entry.statusApplied = verdict.statusApplied || [];
      entry.knockback = verdict.physics?.knockback || 0;
      entry.effect = inferEffectType(entry);
      return entry;
    }

    // ---------- Fallback: no verdict available (older backend, or the
    // profile-extraction pipeline errored out entirely) — behaves exactly
    // as every prior phase so a battle can never hard-stop. ----------
    const dodgeChance = 0.16 + (defender.status.some((s) => s.type === "slowed") ? -0.08 : 0);
    if (Math.random() < dodgeChance) {
      entry.result = "miss";
      entry.effect = inferEffectType(entry);
      return entry;
    }

    let dmg = Math.round(6 + cost * 0.85 + Math.random() * 9);
    if (defender.status.some((s) => s.type === "guarding")) dmg = Math.round(dmg * 0.35);
    if (entry.action === "Special") dmg = Math.round(dmg * 1.15);

    defender.hp = Math.max(0, defender.hp - dmg);
    if (defender.hp === 0) defender.alive = false;
    entry.damage = dmg;
    entry.result = defender.hp === 0 ? "lethal" : "hit";
    entry.effect = inferEffectType(entry);
    return entry;
  }

  // ---------- AI / legacy Hybrid Authority fallback ----------
  if (reality.softened && reality.softenNote) entry.engineNote += ` ${reality.softenNote}`;

  if (NON_DAMAGE_EVENTS.has(entry.eventType)) {
    // Narrative event with no direct HP change: healing affects the actor,
    // everything else (transform/teleport/shield/etc.) is displayed and
    // remembered but doesn't grant a mechanical effect the engine can't
    // reason about later — "the engine never rejects, it displays."
    if (entry.eventType === "healing") {
      const amount = authority === "ai" ? (reality.healOverride ?? INTENSITY_MAGNITUDE[reality.intensity] ?? 15) : Math.round((INTENSITY_MAGNITUDE[reality.intensity] ?? 15) * (reality.intensityMultiplier ?? 1));
      attacker.hp = Math.min(attacker.maxHp ?? 100, attacker.hp + amount);
      entry.healing = amount;
      entry.result = "heal";
    } else {
      entry.result = entry.eventType; // e.g. "transformation", "shield", "teleport"
    }
    entry.effect = inferEffectType(entry);
    return entry;
  }

  // Damage-dealing narrative event (attack / beam / projectile).
  if (authority === "ai") {
    // Full AI Authority: the claimed magnitude is trusted directly, no dodge roll.
    const dmg = Math.max(1, Math.round(reality.damageOverride ?? INTENSITY_MAGNITUDE[reality.intensity] ?? 15));
    defender.hp = Math.max(0, defender.hp - dmg);
    if (defender.hp === 0) defender.alive = false;
    entry.damage = dmg;
    entry.result = defender.hp === 0 ? "lethal" : "hit";
  } else {
    // Hybrid: engine still rolls dodge/guard, base formula scaled by the
    // Reality Interpreter's intensity multiplier.
    const dodgeChance = 0.16 + (defender.status.some((s) => s.type === "slowed") ? -0.08 : 0);
    if (Math.random() < dodgeChance) {
      entry.result = "miss";
      entry.effect = inferEffectType(entry);
      return entry;
    }
    let dmg = Math.round((6 + cost * 0.85 + Math.random() * 9) * (reality.intensityMultiplier ?? 1));
    if (defender.status.some((s) => s.type === "guarding")) dmg = Math.round(dmg * 0.35);
    defender.hp = Math.max(0, defender.hp - dmg);
    if (defender.hp === 0) defender.alive = false;
    entry.damage = dmg;
    entry.result = defender.hp === 0 ? "lethal" : "hit";
  }

  entry.effect = inferEffectType(entry);
  return entry;
}

export function tickStatus(fighter) {
  fighter.status = fighter.status
    .map((s) => ({ ...s, rounds: s.rounds - 1 }))
    .filter((s) => s.rounds > 0);
  fighter.energy = Math.min(fighter.maxEnergy ?? 100, fighter.energy + 12);
}
