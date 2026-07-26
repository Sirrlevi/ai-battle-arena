// ---------- ARENA TRACKER MODULE ----------
// Shared, per-session world state — visible to both fighters' prompts.
// Deliberately generic: instead of hardcoded fields for "fire"/"ice"/
// "black holes", it stores a tagged event list. The Reality Interpreter
// (and, later, an actual destruction/VFX system) pushes events here; this
// module never needs to know the full catalog of possible hazards.

export function getOrCreateArenaMemory(session) {
  if (!session.arenaMemory) {
    session.arenaMemory = {
      round: 0,
      events: [], // { id, type, label, element, appliedRound, expiresRound }
      weather: "clear",
      gravity: "normal",
      timeFlow: "normal",
    };
  }
  return session.arenaMemory;
}

export function resetArenaMemory(session) {
  session.arenaMemory = null;
  return getOrCreateArenaMemory(session);
}

let nextEventId = 1;

export function addArenaEvent(session, { type, label, element, durationRounds }) {
  const arena = getOrCreateArenaMemory(session);
  const event = {
    id: nextEventId++,
    type, // e.g. "fire" | "ice" | "gravity_field" | "portal" | "shield" | "buff" | "debuff" | "time_stop"
    label,
    element: element || null,
    appliedRound: arena.round,
    expiresRound: durationRounds ? arena.round + durationRounds : null,
  };
  arena.events.push(event);
  return event;
}

export function updateArenaMemory(session, round) {
  const arena = getOrCreateArenaMemory(session);
  arena.round = round;
  // Expire anything past its duration so the event list can't grow forever
  // across a 100+ turn battle.
  arena.events = arena.events.filter((e) => e.expiresRound == null || e.expiresRound >= round);
  return arena;
}
