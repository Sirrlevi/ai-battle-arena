// ---------- POWER TRACKER MODULE ----------
// Registry of every distinct power a fighter has introduced this battle.
// Keyed by ability_name (the closest thing an LLM-invented power has to a
// stable identifier). Independent of Opponent/Self memory so both a
// fighter's own powers AND (via ingestRecentTurns) the opponent's observed
// powers can be tracked the same way.

export function createPowerMemory() {
  return { entries: {} }; // ability_name -> { name, firstSeenRound, timesUsed, category, lastResult, weakness, counter }
}

export function recordPowerUse(powerMemory, { name, round, category, result, weakness, counter }) {
  if (!name) return;
  const existing = powerMemory.entries[name];
  if (existing) {
    existing.timesUsed += 1;
    existing.lastResult = result || existing.lastResult;
    existing.lastSeenRound = round;
    if (weakness) existing.weakness = weakness;
    if (counter) existing.counter = counter;
  } else {
    powerMemory.entries[name] = {
      name,
      category: category || "unknown",
      firstSeenRound: round,
      lastSeenRound: round,
      timesUsed: 1,
      lastResult: result || null,
      weakness: weakness || null,
      counter: counter || null,
    };
  }
}

export function listPowers(powerMemory) {
  return Object.values(powerMemory.entries).sort((a, b) => b.timesUsed - a.timesUsed);
}
