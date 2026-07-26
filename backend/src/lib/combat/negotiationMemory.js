// ---------- NEGOTIATION MEMORY ----------
// Phase 3.9, spec section 13. "Every packet becomes part of battle memory."
// Separate from the existing opponent/power/transformation memory (Phase 1-3
// memoryManager.js, unchanged) because this is specifically about the
// Attack/Defense Packet *negotiation* — what a fighter chose to defend with,
// whether it worked, and how often. Keyed by fighter (each fighter's own
// negotiation record — what THEY chose and how it went), stored on
// session.negotiationMemory[fighterKey].

const HISTORY_CAP = 30;

export function getOrCreateNegotiationMemory(session, fighterKey) {
  if (!session.negotiationMemory) session.negotiationMemory = {};
  if (!session.negotiationMemory[fighterKey]) {
    session.negotiationMemory[fighterKey] = {
      defenseChoiceTally: {}, // chosenResponse -> count
      successfulCounters: 0,
      failedCounters: 0,
      dodgeAttempts: 0,
      healingTimings: [], // hp% at moment of healing
      transformationTimings: [], // round numbers
      ultimateTimings: [], // round numbers, ability was flagged isUltimate
      riskChoices: { low: 0, medium: 0, high: 0 },
      recent: [], // last HISTORY_CAP { round, role: "attacker"|"defender", abilityOrResponse, outcome }
    };
  }
  return session.negotiationMemory[fighterKey];
}

export function recordAttackOutcome(session, fighterKey, { round, action, verdict, selfState }) {
  const mem = getOrCreateNegotiationMemory(session, fighterKey);
  if (action.risk) mem.riskChoices[action.risk] = (mem.riskChoices[action.risk] || 0) + 1;
  if (verdict?.healing > 0 && selfState) {
    mem.healingTimings.push(Math.round((selfState.hp / selfState.maxHp) * 100));
    mem.healingTimings = mem.healingTimings.slice(-10);
  }
  if (selfState?.transformations?.history?.length) {
    const last = selfState.transformations.history[selfState.transformations.history.length - 1];
    if (last?.round === round) mem.transformationTimings = [...mem.transformationTimings, round].slice(-10);
  }
  mem.recent.push({ round, role: "attacker", abilityOrResponse: action.ability_name, outcome: verdict?.code || "unknown" });
  mem.recent = mem.recent.slice(-HISTORY_CAP);
}

export function recordDefenseOutcome(session, fighterKey, { round, defensePacket, defenseResolution, verdict }) {
  const mem = getOrCreateNegotiationMemory(session, fighterKey);
  const chosen = defenseResolution?.chosenResponse || "none";
  mem.defenseChoiceTally[chosen] = (mem.defenseChoiceTally[chosen] || 0) + 1;
  if (chosen === "dodge" || chosen === "teleport") mem.dodgeAttempts += 1;
  if (chosen === "counter") {
    if (verdict?.defense?.counterDamage > 0) mem.successfulCounters += 1;
    else mem.failedCounters += 1;
  }
  mem.recent.push({ round, role: "defender", abilityOrResponse: chosen, outcome: verdict?.code || "unknown" });
  mem.recent = mem.recent.slice(-HISTORY_CAP);
}

/** Compact, prompt-ready summary of a fighter's negotiation patterns — fed into the OPPONENT's world state so they can adapt (spec section 10: "should adapt instead of repeating attacks"). */
export function summarizeNegotiationPatterns(session, fighterKey) {
  const mem = session.negotiationMemory?.[fighterKey];
  if (!mem) return [];
  const lines = [];
  const topDefense = Object.entries(mem.defenseChoiceTally).sort((a, b) => b[1] - a[1])[0];
  if (topDefense) lines.push(`Favors "${topDefense[0]}" as a defensive response (${topDefense[1]}x).`);
  if (mem.successfulCounters + mem.failedCounters > 0) {
    lines.push(`Counter attempts: ${mem.successfulCounters} succeeded, ${mem.failedCounters} failed.`);
  }
  if (mem.dodgeAttempts >= 3) lines.push(`Frequently tries to dodge/teleport out of danger (${mem.dodgeAttempts}x).`);
  if (mem.healingTimings.length) {
    const avg = Math.round(mem.healingTimings.reduce((a, b) => a + b, 0) / mem.healingTimings.length);
    lines.push(`Tends to heal around ${avg}% HP.`);
  }
  if (mem.transformationTimings.length) lines.push(`Has transformed at round(s): ${mem.transformationTimings.join(", ")}.`);
  const riskTotal = mem.riskChoices.low + mem.riskChoices.medium + mem.riskChoices.high;
  if (riskTotal >= 3) {
    const dominant = Object.entries(mem.riskChoices).sort((a, b) => b[1] - a[1])[0][0];
    lines.push(`Generally takes ${dominant}-risk actions.`);
  }
  return lines;
}

export function resetNegotiationMemory(session) {
  session.negotiationMemory = {};
}
