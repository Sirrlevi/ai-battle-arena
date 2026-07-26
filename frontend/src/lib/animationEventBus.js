// ---------- PHASE 3.95 ANIMATION EVENT BUS ----------
// Converts validated battle-engine verdicts/log entries into lightweight,
// replayable renderer events. The renderer consumes these events in order;
// it never decides combat or creates visual actions that are not sourced from
// a resolved engine event.

const PROJECTILE_TYPES = new Set(["beam", "laser", "fireball", "lightning", "ice", "wind", "water", "earth", "gravity", "reality"]);

let nextEventId = 1;

export function createAnimationEventBus() {
  return { queue: [], current: null, history: [] };
}

export function enqueueAnimationEvents(bus, events) {
  for (const event of events) {
    const normalized = { id: `anim-${nextEventId++}`, createdAt: Date.now(), ...event };
    bus.queue.push(normalized);
    if (!bus.current) bus.current = normalized;
    bus.history.push(normalized);
  }
  bus.history = bus.history.slice(-120);
}

export function markAnimationEventDispatched(bus, eventId) {
  bus.queue = bus.queue.filter((event) => event.id !== eventId);
  bus.current = bus.queue[0] || null;
}

export function peekAnimationDebug(bus) {
  return {
    queue: bus.queue.slice(0, 8),
    current: bus.current,
    eventIds: bus.queue.slice(0, 8).map((e) => e.id),
    historyCount: bus.history.length,
  };
}

export function buildAnimationEventsFromEntry(entry) {
  const source = {
    type: "engine_verdict",
    round: entry.round,
    actorKey: entry.actorKey,
    defenderKey: entry.defenderKey,
    result: entry.result,
    verdictCode: entry.verdict?.code || null,
    timelineId: `round-${entry.round}-${entry.actorKey}`,
  };
  const category = categorizeEntry(entry);
  const intensity = intensityFromEntry(entry);
  const events = [];

  events.push(event("movement", movementType(entry), { source, actorKey: entry.actorKey, defenderKey: entry.defenderKey, physics: physicsFromVerdict(entry), duration: 180 }));

  if (entry.result === "defend") {
    events.push(event("defense", "Block", { source, actorKey: entry.actorKey, defenderKey: entry.defenderKey, duration: 600, particles: ["barrier"], camera: { shake: "small" } }));
    events.push(event("pose", "Idle", { source, actorKey: entry.actorKey, duration: 120 }));
    return events;
  }

  if (entry.result === "heal") {
    events.push(event("effect", "Heal", { source, actorKey: entry.actorKey, duration: 700, particles: ["healing"], camera: { shake: "small" } }));
    events.push(event("pose", "Idle", { source, actorKey: entry.actorKey, duration: 120 }));
    return events;
  }

  if (entry.result === "transformation" || category === "transformation") {
    events.push(event("effect", "Transformation", { source, actorKey: entry.actorKey, duration: 900, particles: ["energy", "aura"], camera: { shake: "medium", zoom: "in" }, transformTo: entry.transformTo }));
    events.push(event("pose", "Idle", { source, actorKey: entry.actorKey, duration: 120 }));
    return events;
  }

  if (PROJECTILE_TYPES.has(category)) {
    events.push(event("charge", "Charge Energy", { source, actorKey: entry.actorKey, duration: 220, particles: [particleFor(category)] }));
    events.push(event("attack", attackNameFor(category), { source, actorKey: entry.actorKey, defenderKey: entry.defenderKey, duration: 260, damage: entry.damage, result: entry.result, projectileVariant: projectileVariantFor(category), particles: [particleFor(category)] }));
  } else {
    events.push(event("attack", attackNameFor(category), { source, actorKey: entry.actorKey, defenderKey: entry.defenderKey, duration: 260, damage: entry.damage, result: entry.result, particles: [particleFor(category)] }));
  }

  if (entry.result === "hit" || entry.result === "lethal") {
    events.push(event("reaction", reactionFor(intensity, entry), { source, actorKey: entry.defenderKey, attackerKey: entry.actorKey, damage: entry.damage, duration: 300, physics: physicsFromVerdict(entry), particles: reactionParticles(entry, category) }));
    if (entry.verdict?.physics?.terrainDamage) {
      events.push(event("environment", "Ground Slam", { source, actorKey: entry.actorKey, defenderKey: entry.defenderKey, duration: 450, particles: ["debris", "dust"], worldChange: "crater" }));
    }
  }

  if (entry.result === "miss") events.push(event("reaction", "Dodge", { source, actorKey: entry.defenderKey, attackerKey: entry.actorKey, duration: 240, particles: ["dust"] }));
  if (entry.statusApplied?.length) {
    for (const status of entry.statusApplied) events.push(event("status", status.type, { source, actorKey: entry.defenderKey, duration: 600, particles: [particleFor(status.type)] }));
  }
  if (entry.result === "lethal") events.push(event("pose", "Death", { source, actorKey: entry.defenderKey, duration: 800, camera: { shake: "large" } }));
  events.push(event("pose", "Idle", { source, actorKey: entry.actorKey, duration: 120 }));
  return events;
}

function event(channel, name, payload) {
  return { channel, name, ...payload };
}
function categorizeEntry(entry) {
  const text = `${entry.ability_name || ""} ${entry.description || ""} ${entry.eventType || ""}`.toLowerCase();
  if (text.includes("transform") || text.includes("ascend")) return "transformation";
  if (text.includes("laser")) return "laser";
  if (text.includes("beam") || text.includes("ray")) return "beam";
  if (text.includes("fire")) return "fireball";
  if (text.includes("lightning") || text.includes("shock")) return "lightning";
  if (text.includes("ice") || text.includes("freeze")) return "ice";
  if (text.includes("gravity")) return "gravity";
  if (text.includes("reality") || text.includes("void")) return "reality";
  if (text.includes("kick")) return "kick";
  if (text.includes("slash") || text.includes("sword") || text.includes("blade")) return "slash";
  return "punch";
}
function movementType(entry) {
  const text = `${entry.movement || ""} ${entry.description || ""}`.toLowerCase();
  if (text.includes("teleport") || text.includes("blink")) return "Teleport";
  if (text.includes("fly")) return "Fly";
  if (text.includes("hover")) return "Hover";
  if (text.includes("jump")) return "Jump";
  if (text.includes("sprint")) return "Sprint";
  if (text.includes("run") || text.includes("dash") || text.includes("rush")) return "Dash";
  return "Walk";
}
function attackNameFor(category) {
  return ({ punch: "Punch", kick: "Kick", slash: "Combo", beam: "Beam", laser: "Laser", fireball: "Fireball", lightning: "Lightning", ice: "Ice", gravity: "Gravity Crush", reality: "Reality Crack" })[category] || "Punch";
}
function projectileVariantFor(category) {
  return ({ laser: "laser", beam: "laser", fireball: "fireball", lightning: "energy", ice: "orb", gravity: "orb", reality: "orb" })[category] || "energy";
}
function particleFor(type = "energy") {
  const t = String(type).toLowerCase();
  if (t.includes("burn") || t.includes("fire")) return "fire";
  if (t.includes("freeze") || t.includes("ice")) return "ice";
  if (t.includes("poison")) return "poison";
  if (t.includes("shock") || t.includes("lightning")) return "lightning";
  if (t.includes("heal")) return "healing";
  if (t.includes("reality")) return "reality-fragments";
  if (t.includes("gravity") || t.includes("earth")) return "debris";
  return "energy";
}
function reactionFor(intensity, entry) {
  if (entry.result === "lethal") return "Death";
  if (intensity === "heavy") return "Knockback";
  if (intensity === "medium") return "Stagger";
  return "Small Flinch";
}
function intensityFromEntry(entry) {
  const damage = Number(entry.damage || 0);
  if (damage >= 40 || entry.isUltimate) return "heavy";
  if (damage >= 18) return "medium";
  return "light";
}
function physicsFromVerdict(entry) {
  return {
    position: entry.verdict?.worldSync || null,
    knockback: entry.knockback || entry.verdict?.physics?.knockback || 0,
    impactRadius: entry.verdict?.physics?.impactRadius || 1,
    grounded: true,
    airborne: false,
  };
}
function reactionParticles(entry, category) {
  const particles = [particleFor(category)];
  if ((entry.knockback || entry.verdict?.physics?.knockback || 0) > 20) particles.push("dust");
  return particles;
}
