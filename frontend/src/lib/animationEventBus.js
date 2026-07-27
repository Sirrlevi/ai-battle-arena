// ---------- ANIMATION EVENT BUS ----------
// Phase 3.95. "The renderer must NEVER invent combat" — every event this
// module produces is read off the resolved battle log `entry` (built by
// battleEngine.resolveAction, which in Engine Authority mode already
// carries the Phase 3.8/3.9 Combat Engine's verdict: ability, element,
// statusApplied, defense, physics, counterDamage...). When a verdict is
// present, buildAnimationEvents() reads it deterministically — no keyword
// guessing. When it's absent (AI/Hybrid Authority, or an older session),
// it falls back to the existing text-keyword actionInterpreter, exactly
// like every other Phase 3.8/3.9 frontend fallback: never a hard stop.
//
// Pipeline this module sits in (spec section 12):
//   Combat Engine (backend) -> entry.verdict -> buildAnimationEvents() ->
//   Animation Event Bus -> {animationController, particleSystem,
//   cameraController, Stickman status visuals, Timeline recorder}
// The renderer only ever *listens*; it never decides an outcome.

import { interpretAction } from "./actionInterpreter.js";
import { visualForStatus } from "./statusVisuals.js";

let nextEventId = 1;

// ---------- Event Bus (pub/sub) ----------
export function createEventBus() {
  return { listeners: {} };
}

export function on(bus, type, handler) {
  if (!bus.listeners[type]) bus.listeners[type] = [];
  bus.listeners[type].push(handler);
  return () => off(bus, type, handler);
}

export function off(bus, type, handler) {
  if (!bus.listeners[type]) return;
  bus.listeners[type] = bus.listeners[type].filter((h) => h !== handler);
}

export function emit(bus, type, payload) {
  for (const h of bus.listeners[type] || []) h(payload);
  for (const h of bus.listeners["*"] || []) h({ type, payload });
}

// ---------- Element/ability -> animation-name mapping ----------
const ELEMENT_ANIMATION = {
  fire: "Fireball",
  ice: "Ice",
  lightning: "Lightning",
  physical: null, // resolved by range/melee-variant below instead
};

const MELEE_VARIANT_ANIMATION = { punch: "Punch", kick: "Kick", slash: "Combo" };

const EVENT_TYPE_ANIMATION = {
  healing: "Heal",
  shield: "Shield",
  transformation: "Transformation",
  teleport: "Teleport",
  summon: "Summon",
  time_stop: "Time Stop",
  reality_rewrite: "Reality Crack",
  fusion: "Clone",
  adaptation: "Transformation",
  counter: "Counter",
};

const DEFENSE_ANIMATION = {
  dodge: "Parry",
  block: "Block",
  counter: "Counter",
  shield: "Shield",
  teleport: "Teleport",
  reality_defense: "Reality Crack",
  time_defense: "Time Stop",
  passive: "Block",
  transformation: "Transformation",
};

// ---------- Audio Event Pipeline (spec section 17) ----------
// "No actual audio assets are required yet" — this is purely the event
// layer, so a future sound system just has to subscribe to the bus and
// look up a real asset per tag instead of inventing its own event source.
const AUDIO_TAG = {
  Punch: "punch", Kick: "kick", Combo: "punch", Uppercut: "punch", Roundhouse: "kick",
  Grab: "punch", Throw: "punch", Beam: "beam", Laser: "beam", Fireball: "beam", Explosion: "explosion",
  Lightning: "beam", Ice: "beam", "Charge Energy": "charge", Transformation: "transformation",
  Heal: "aura", Shield: "aura", Barrier: "aura", Block: "punch", Parry: "punch", Counter: "punch",
  Teleport: "landing", Summon: "aura", "Ground Slam": "explosion", "Air Combo": "punch",
  "Small Flinch": "punch", "Heavy Hit": "punch", Knockback: "punch", Death: "death",
  "Reality Crack": "explosion", "Time Stop": "charge",
};

function audioTagFor(type) {
  return AUDIO_TAG[type] || null;
}

export function audioEventsFor(animEvents) {
  return animEvents.map((e) => ({ tag: audioTagFor(e.type), sourceEventId: e.id })).filter((e) => e.tag);
}

function makeEvent(type, category, payload = {}, source = "engine") {
  return { id: nextEventId++, type, category, payload, source, audioTag: audioTagFor(type) };
}

/**
 * Determines the primary attack-animation name. Prefers the Combat
 * Engine's own classification (ability.element / eventType from the
 * verdict) over guessing from prose; the melee-variant guess
 * (punch/kick/slash) is the one place cosmetic pose selection still reads
 * the ability name, since the engine has no opinion on which melee pose
 * looks best — that's a rendering choice, not a combat one.
 */
function primaryAnimationName(entry, interpreted) {
  const ability = entry.verdict?.ability;
  const eventType = entry.eventType;

  if (eventType && EVENT_TYPE_ANIMATION[eventType]) return EVENT_TYPE_ANIMATION[eventType];

  if (ability) {
    if (ability.element && ELEMENT_ANIMATION[ability.element]) return ELEMENT_ANIMATION[ability.element];
    if (ability.range === "ranged") return "Beam";
    if (ability.areaOfEffect) return "Explosion";
    // physical melee: cosmetic variant only
    return MELEE_VARIANT_ANIMATION[interpreted.variant] || "Punch";
  }

  // No verdict (AI/Hybrid Authority) — fall back to the pre-3.95 keyword
  // interpreter's category/variant.
  if (interpreted.category === "projectile") return "Beam";
  if (interpreted.category === "block") return "Block";
  if (interpreted.category === "movement") return "Dash";
  return MELEE_VARIANT_ANIMATION[interpreted.variant] || "Punch";
}

function cameraEventFor(entry) {
  if (entry.result === "lethal") return { kind: "death-camera" };
  if (entry.isUltimate) return { kind: "ultimate-camera" };
  if (entry.verdict?.ability?.areaOfEffect && (entry.damage || 0) > 40) return { kind: "zoom-out" };
  if (entry.eventType === "teleport" || entry.defense?.chosenResponse === "teleport") return { kind: "camera-snap" };
  if (entry.verdict?.breakdown?.critical || (entry.damage || 0) > 25) return { kind: "impact-zoom" };
  if (entry.defense?.chosenResponse === "counter" || entry.defense?.chosenResponse === "block") return { kind: "dynamic-zoom" };
  if ((entry.damage || 0) > 0) return { kind: "small-shake" };
  return null;
}

function particleEventsFor(entry) {
  const events = [];
  const ability = entry.verdict?.ability;
  const element = ability?.element;

  if (entry.result === "heal") events.push({ particle: "healing", intensity: "low" });
  if (entry.eventType === "shield" || entry.defense?.chosenResponse === "shield") events.push({ particle: "magic_circle", intensity: "medium" });
  if (element === "fire") events.push({ particle: "fire", intensity: "medium" });
  if (element === "lightning") events.push({ particle: "lightning", intensity: "medium" });
  if (ability?.areaOfEffect) events.push({ particle: "explosion_ring", intensity: "high" }, { particle: "debris", intensity: "high" });
  if (entry.result === "hit" && (entry.damage || 0) > 0) events.push({ particle: "dust", intensity: "low" });
  if (entry.eventType === "reality_rewrite" || entry.defense?.chosenResponse === "reality_defense") events.push({ particle: "reality_fragment", intensity: "medium" });
  if (entry.result === "lethal") events.push({ particle: "explosion_ring", intensity: "high" });
  return events;
}

/**
 * The Phase 3.95 entry point: turns one resolved battle-log entry into an
 * ordered Animation Event queue (spec section 2 — "Run -> Jump -> Charge ->
 * Beam -> Explosion -> Knockback -> Land -> Idle"). Every event carries
 * `source: "engine"` when it was read off a verdict, `"fallback"` otherwise
 * — surfaced in the Debug Panel (section 14) so it's always visible whether
 * the renderer is actually engine-synced for a given turn.
 */
export function buildAnimationEvents(entry) {
  const interpreted = interpretAction(entry);
  const source = entry.verdict ? "engine" : "fallback";
  const queue = [];

  if (entry.action === "Defend" || entry.result === "defend") {
    queue.push(makeEvent("Block", "attack", { ability: entry.ability_name }, source));
    return queue;
  }

  if (entry.result === "on_cooldown") {
    // Validated-impossible / downgraded action — still visualized (a
    // whiff), never a fabricated success.
    queue.push(makeEvent("Combo", "attack", { whiff: true, reason: entry.engineNote }, source));
    return queue;
  }

  const primary = primaryAnimationName(entry, interpreted);
  const isCharged = entry.isUltimate || (entry.verdict?.ability?.castTime || 0) > 0;

  if (isCharged) queue.push(makeEvent("Charge Energy", "buildup", { ultimate: !!entry.isUltimate }, source));

  queue.push(makeEvent(primary, "attack", { ability: entry.ability_name, element: entry.verdict?.ability?.element }, source));

  if (entry.result === "miss") {
    queue.push(makeEvent("Parry", "reaction", {}, source));
    return queue;
  }

  if (entry.defense?.chosenResponse && entry.defense.chosenResponse !== "none") {
    const defAnim = DEFENSE_ANIMATION[entry.defense.chosenResponse];
    if (defAnim) queue.push(makeEvent(defAnim, "reaction", { note: entry.defense.note }, source));
  }

  if (entry.result === "heal") {
    queue.push(makeEvent("Heal", "self", { amount: entry.healing }, source));
    return queue;
  }
  if (entry.eventType === "shield" && entry.result !== "hit") {
    queue.push(makeEvent("Shield", "self", {}, source));
    return queue;
  }
  if (entry.eventType === "transformation") {
    queue.push(makeEvent("Transformation", "self", {}, source));
    return queue;
  }

  if ((entry.damage || 0) > 0) {
    const intensity = entry.damage > 40 ? "Heavy Hit" : entry.damage > 15 ? "Knockback" : "Small Flinch";
    queue.push(makeEvent(intensity, "reaction", { damage: entry.damage, knockback: entry.knockback || 0 }, source));
  }

  if (entry.counterDamage > 0) {
    queue.push(makeEvent("Counter", "reaction", { damage: entry.counterDamage }, source));
  }

  for (const applied of entry.statusApplied || []) {
    const visual = visualForStatus(applied.type);
    if (visual) queue.push(makeEvent(visual.label, "status", { statusType: applied.type, visual }, source));
  }

  if (entry.result === "lethal") {
    queue.push(makeEvent("Death", "reaction", {}, source));
  }

  return queue;
}

/** Everything a Developer Mode panel needs (spec section 14) — the raw event queue plus what drove it. */
export function buildDebugSnapshot(entry, animEvents) {
  return {
    round: entry.round,
    actor: entry.actorName,
    ability: entry.ability_name,
    source: entry.verdict ? "engine" : "fallback",
    verdictCode: entry.verdict?.code || null,
    physicsSync: entry.verdict?.physics || null,
    eventIds: animEvents.map((e) => e.id),
    events: animEvents,
  };
}

export { cameraEventFor, particleEventsFor };
