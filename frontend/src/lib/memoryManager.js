const RECENT_LIMIT = 10;
const SUMMARY_AFTER = 14;

function emptyFighterMemory(fighter) {
  return {
    self: {}, opponent: {}, arena: { hazards: [], weather: "clear", distortions: [], summons: [], portals: [], shields: [], buffs: [], debuffs: [] },
    shortTerm: [], longTerm: "Battle just began. No adaptations observed yet.",
    personality: { archetype: fighter.personality || "unspecified", consistencyNotes: [] },
    strategy: { current: "Opening read", objective: "Observe opponent and establish safe pressure.", adaptations: [] },
    power: {}, transformation: { currentForm: "Base", history: [] },
  };
}

export function createMemoryManager(roster) {
  return { fighters: Object.fromEntries(roster.map((f) => [f.key, emptyFighterMemory(f)])), turnCount: 0, lastCompressionAt: 0 };
}
export function ensureMemory(manager, fighter) {
  if (!manager.fighters[fighter.key]) manager.fighters[fighter.key] = emptyFighterMemory(fighter);
  return manager.fighters[fighter.key];
}
function words(entry) { return `${entry.ability_name || ""} ${entry.description || ""} ${entry.action || ""}`.toLowerCase(); }
function inferRange(entry) {
  const text = words(entry);
  if (/beam|ray|projectile|arrow|gun|laser|missile|orb|ranged/.test(text)) return "ranged";
  if (/dash|slash|punch|kick|blade|melee|strike|claw/.test(text)) return "melee";
  if (/shield|guard|barrier|defend/.test(text)) return "defensive";
  return "mixed";
}
function inc(map, key, by = 1) { if (!key) return; map[key] = (map[key] || 0) + by; }
function topKeys(map, n = 3) { return Object.entries(map || {}).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k); }

export function updateMemoriesAfterTurn(manager, roster, entry, arenaEvents = []) {
  manager.turnCount += 1;
  const actor = roster.find((f) => f.key === entry.actorKey);
  const defender = roster.find((f) => f.key === entry.defenderKey);
  if (!actor || !defender) return manager;
  const actorMemory = ensureMemory(manager, actor);
  const defenderMemory = ensureMemory(manager, defender);
  updateSelf(actorMemory, actor, entry);
  updateOpponent(defenderMemory, actor, entry);
  updateArena(actorMemory, arenaEvents, entry);
  updateArena(defenderMemory, arenaEvents, entry);
  appendShortTerm(actorMemory, entry, "self");
  appendShortTerm(defenderMemory, entry, "opponent");
  updatePower(actorMemory, entry);
  updatePower(defenderMemory, entry);
  updateTransformation(actorMemory, entry, actor);
  updateStrategy(actorMemory, actor, defender, entry);
  updateStrategy(defenderMemory, defender, actor, entry);
  compressIfNeeded(manager);
  return manager;
}
function updateSelf(memory, fighter, entry) {
  memory.self = {
    currentHp: fighter.hp, energy: fighter.energy, cooldowns: { ...fighter.cooldowns }, knownAbilities: topKeys(memory.power),
    currentForm: memory.transformation.currentForm, transformations: memory.transformation.history, currentWeapon: fighter.weapon || "unarmed",
    currentAura: fighter.aura || "none", statusEffects: fighter.status, position: fighter.position, movementState: fighter.alive ? "active" : "defeated",
    successfulAttacks: (memory.self.successfulAttacks || 0) + (entry.actorKey === fighter.key && ["hit", "lethal"].includes(entry.result) ? 1 : 0),
    failedAttacks: (memory.self.failedAttacks || 0) + (entry.actorKey === fighter.key && ["miss", "on_cooldown"].includes(entry.result) ? 1 : 0),
    recentlyUsedPowers: [entry.ability_name, ...(memory.self.recentlyUsedPowers || [])].filter(Boolean).slice(0, 5),
    currentGoal: memory.strategy.objective,
  };
}
function updateOpponent(memory, opponent, entry) {
  const o = memory.opponent;
  o.powerUseCounts ||= {}; o.successCounts ||= {}; o.rangeCounts ||= {}; o.favoriteCombos ||= []; o.adaptations ||= [];
  inc(o.powerUseCounts, entry.ability_name); inc(o.rangeCounts, inferRange(entry)); if (["hit","lethal"].includes(entry.result)) inc(o.successCounts, entry.ability_name);
  o.preferredRange = topKeys(o.rangeCounts, 1)[0] || "unknown"; o.mostUsedPowers = topKeys(o.powerUseCounts); o.mostSuccessfulPowers = topKeys(o.successCounts);
  o.aggression = entry.action === "Attack" || entry.action === "Special" ? "pressuring" : "guarded";
  o.defensePattern = entry.action === "Defend" ? "actively guards" : o.defensePattern || "unproven";
  o.reactionPattern = entry.result === "miss" ? "creates whiffs/evasion windows" : "trades or absorbs contact";
  o.movementHabits = o.preferredRange === "ranged" ? "keeps distance" : o.preferredRange === "melee" ? "closes space" : "varies spacing";
  o.weaknesses = entry.result === "miss" ? ["current approach can be avoided"] : o.weaknesses || [];
  o.strengths = o.mostSuccessfulPowers;
  o.healingBehaviour = /heal|regen|restore/.test(words(entry)) ? "uses healing/regeneration" : o.healingBehaviour || "not observed";
  o.ultimateUsage = /ultimate|final|omega|infinite|omniversal/.test(words(entry)) ? "high-scale finisher attempted" : o.ultimateUsage || "not observed";
}
function updateArena(memory, arenaEvents, entry) { memory.arena.lastEvents = arenaEvents; if (/fire|storm|black hole|portal|gravity|void|ice|time/.test(words(entry))) memory.arena.distortions = [...new Set([...(memory.arena.distortions||[]), entry.effect || inferRange(entry)])].slice(-8); }
function appendShortTerm(memory, entry, perspective) { memory.shortTerm = [...memory.shortTerm, { turn: entry.round, action: entry.action, target: perspective === "self" ? entry.defenderKey : entry.actorKey, result: entry.result, damage: entry.damage, reasoning: entry.thought, transformation: entry.transformation || null, specialEvents: entry.engineNote || entry.narrativeNote || "" }].slice(-RECENT_LIMIT); }
function updatePower(memory, entry) { const p = memory.power[entry.ability_name] || { powerName: entry.ability_name, used: false, effect: "unknown", weakness: "unproven", counter: "observe timing", evolution: "none" }; memory.power[entry.ability_name] = { ...p, used: true, effect: entry.effect || entry.action, weakness: entry.result === "miss" ? "can miss" : p.weakness, counter: entry.result === "hit" ? "guard, evade, or resist next use" : p.counter }; }
function updateTransformation(memory, entry) { if (/transform|form|evolve|ascend/.test(words(entry))) { memory.transformation.currentForm = entry.ability_name; memory.transformation.history.push({ turn: entry.round, form: entry.ability_name, description: entry.description }); } }
function updateStrategy(memory, self, enemy, entry) { const low = self.hp <= self.maxHp * .3; memory.strategy.current = low ? "Survival adaptation" : entry.result === "miss" ? "Revise failed approach" : "Exploit observed pressure"; memory.strategy.objective = low ? "Stabilize, defend, or transform before committing." : entry.result === "hit" ? "Chain from the successful tactic without becoming predictable." : "Change range, timing, or element to avoid repetition."; }
function compressIfNeeded(manager) { if (manager.turnCount - manager.lastCompressionAt < SUMMARY_AFTER) return; for (const memory of Object.values(manager.fighters)) { const patterns = memory.shortTerm.map((t)=>`${t.turn}:${t.action}/${t.result}${t.damage?` ${t.damage}dmg`:""}`).join(", "); memory.longTerm = `${memory.longTerm} Recent compression: ${patterns}. Strategy: ${memory.strategy.current}; objective: ${memory.strategy.objective}`.slice(-900); } manager.lastCompressionAt = manager.turnCount; }

export function buildPromptContext(manager, fighterKey) { const m = manager.fighters[fighterKey]; return m ? { selfMemory: m.self, opponentMemory: m.opponent, arenaMemory: m.arena, recentTurns: m.shortTerm, longTermSummary: m.longTerm, personalityMemory: m.personality, strategyMemory: m.strategy, powerMemory: m.power, transformationMemory: m.transformation } : null; }
