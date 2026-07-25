// ---------- BATTLE ENGINE MODULE ----------
// Deterministic combat resolution. This is the single source of truth the
// project has used since Phase 1 — an AI's declared action is intent only;
// everything below is what actually happens. Logic is unchanged from the
// text-battle prototype; the only addition is inferEffectType(), which maps
// a resolved action to one of the Phase 2 visual indicator icons.

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

export function resolveAction(round, attacker, defender, action) {
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

export function tickStatus(fighter) {
  fighter.status = fighter.status
    .map((s) => ({ ...s, rounds: s.rounds - 1 }))
    .filter((s) => s.rounds > 0);
  fighter.energy = Math.min(fighter.maxEnergy ?? 100, fighter.energy + 12);
}
