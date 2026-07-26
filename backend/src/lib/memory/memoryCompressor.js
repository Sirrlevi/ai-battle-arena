// ---------- MEMORY COMPRESSOR MODULE ----------
// Prevents prompt explosion over a long (100+ turn) battle. Never sends
// full history to the LLM — shortTerm is already capped at 10 by Memory
// Manager; this module periodically folds the accumulated tallies into a
// short, human-readable long-term summary (a handful of bullet lines, not
// unbounded text) that gets sent instead of raw history.

const RECOMPUTE_INTERVAL = 4; // recompute every N observed turns
const MAX_SUMMARY_LINES = 6;

export function maybeCompress(mem, opponentAnalysis) {
  if (mem.turnsObserved === 0) return mem.longTermSummary;
  if (mem.longTermSummary.length > 0 && mem.turnsObserved % RECOMPUTE_INTERVAL !== 0) return mem.longTermSummary;

  const lines = [...opponentAnalysis.observedPatterns];

  if (mem.opponent.weaknesses[0]) lines.push(`Weakness: ${mem.opponent.weaknesses[0]}`);
  if (mem.opponent.strengths[0]) lines.push(`Strength: ${mem.opponent.strengths[0]}`);
  if (mem.self.failedAttacks >= 3 && mem.self.failedAttacks > mem.self.successfulAttacks) {
    lines.push(`Self note: recent attacks have underperformed (${mem.self.failedAttacks} failed vs ${mem.self.successfulAttacks} landed) — avoid repeating the same approach.`);
  }
  if (mem.transformation.history.length > 0) {
    const last = mem.transformation.history[mem.transformation.history.length - 1];
    lines.push(`Opponent's current form: "${last.form}" (since round ${last.round}).`);
  }

  mem.longTermSummary = lines.slice(0, MAX_SUMMARY_LINES);
  return mem.longTermSummary;
}
