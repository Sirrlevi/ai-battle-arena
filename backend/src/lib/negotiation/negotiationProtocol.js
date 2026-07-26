// ---------- PHASE 3.9 NEGOTIATION PROTOCOL ----------
// Adds a structured four-stage combat exchange on top of the Phase 3.8
// combat engine. AIs propose Attack/Defense Packets; the engine validates,
// arbitrates, and synchronizes world state without inventing AI decisions.

import { callModel } from "../../providers/index.js";
import { extractJSON } from "../extractJson.js";
import { AppError } from "../errors.js";

const RISK_LEVELS = new Set(["low", "medium", "high", "desperate"]);

export function buildAttackPacket(parsed = {}, { fighterKey, opponentKey, round, authorityMode, worldState }) {
  const ability = parsed.ability_used || parsed.ability_name || "Basic Strike";
  return {
    protocolVersion: "3.9",
    stage: "attacker_intent",
    actor: fighterKey,
    round,
    authorityMode,
    actionName: parsed.action_name || parsed.action || "Attack",
    abilityUsed: ability,
    target: parsed.target || opponentKey || "Enemy",
    powerCategory: parsed.power_category || parsed.action || "attack",
    element: parsed.element || "neutral",
    intent: parsed.intent || parsed.description || parsed.thought || "Press the attack.",
    expectedResult: parsed.expected_result || "Gain advantage.",
    energyCost: numberOr(parsed.energy_cost, 12),
    manaCost: numberOr(parsed.mana_cost, 0),
    staminaCost: numberOr(parsed.stamina_cost, 0),
    cooldown: numberOr(parsed.cooldown, null),
    range: parsed.range || inferRange(parsed.movement),
    areaOfEffect: parsed.area_of_effect || parsed.aoe || "single target",
    movement: parsed.movement || "hold ground",
    followUpPlan: parsed.follow_up_plan || "Adapt to the defender's response.",
    specialEffects: arrayOf(parsed.special_effects),
    statusEffects: arrayOf(parsed.status_effects),
    realityEffects: arrayOf(parsed.reality_effects),
    timelineEffects: arrayOf(parsed.timeline_effects),
    riskLevel: RISK_LEVELS.has(parsed.risk) ? parsed.risk : "medium",
    worldStateHash: makeWorldStateHash(worldState),
  };
}

export function actionFromAttackPacket(packet, parsed = {}) {
  return {
    thought: parsed.thought || packet.intent || "",
    action: normalizeAction(packet.actionName),
    ability_name: packet.abilityUsed || "Basic Strike",
    description: parsed.description || packet.intent || "",
    target: packet.target || "Enemy",
    energy_cost: numberOr(packet.energyCost, 12),
    expected_result: packet.expectedResult || "",
    reason: parsed.reason || packet.intent || "",
    risk: ["low", "medium", "high"].includes(packet.riskLevel) ? packet.riskLevel : "medium",
    movement: packet.movement || "",
    follow_up_plan: packet.followUpPlan || "",
    attackPacket: packet,
  };
}

export function buildDefenseSystemPrompt({ fighterName, combatStyle, personality, authorityMode, combatProfile }) {
  const profile = combatProfile
    ? ` Combat Profile: tier ${combatProfile.combatTier}, speed ${combatProfile.speed}/10, durability ${combatProfile.durability}/10, known powers: ${(combatProfile.knownPowers || []).join(", ") || "none"}.`
    : "";
  return (
    `You are ${fighterName}, the defending combatant in AI Battle Arena Phase 3.9. ` +
    `Personality: ${personality || "unspecified"}. Combat style: ${combatStyle || "unspecified"}.${profile} ` +
    `Authority mode is ${authorityMode}. You receive the full Attack Packet and synchronized world_state before the engine resolves anything. ` +
    `Choose a legal defensive response consistent with your persona, resources, cooldowns, current form, battle memory, and observed enemy behavior. ` +
    `Do not decide the final outcome. Respond ONLY with JSON: ` +
    `{"detected_threat":string,"chosen_response":string,"reason":string,"counter_ability":string,"shield":string,` +
    `"dodge":string,"teleport":string,"block":string,"reality_defense":string,"time_defense":string,"passive_activation":string,` +
    `"transformation":string,"resource_consumption":{"energy":number,"mana":number,"stamina":number,"reality_stability":number,"mental_stability":number},` +
    `"expected_survival":string,"emergency_plan":string}`
  );
}

export function buildDefenseUserPrompt({ round, defenderMemory, attackPacket, worldState }) {
  return JSON.stringify({
    round,
    stage: "defender_response",
    attack_packet: attackPacket,
    world_state: worldState,
    battle_memory: {
      recent_events: (defenderMemory?.shortTerm || []).slice(-6),
      known_enemy_powers: defenderMemory?.opponent?.mostUsedPowers?.map((p) => p.name) || [],
      observed_weaknesses: defenderMemory?.opponent?.weaknesses || [],
      defense_pattern: defenderMemory?.opponent?.defensePattern || "unknown",
    },
    instruction: "Create a Defense Packet. Do not narrate an outcome or fabricate damage.",
  });
}

export async function requestDefensePacket({ session, sessionId, defenderKey, attackerKey, config, round, defender, attackPacket, worldState, memory, authorityMode, combatProfile, referer }) {
  if (!config) {
    throw new AppError(`No provider/model/apiKey on file for defender ${defenderKey}; cannot create a Defense Packet without fabricating one.`, {
      code: "NO_DEFENDER_PROVIDER",
      status: 400,
    });
  }
  const raw = await callModel({
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt: buildDefenseSystemPrompt({ fighterName: defender.name, combatStyle: defender.combatStyle || memory?.combatStyle, personality: defender.personality || memory?.personality, authorityMode, combatProfile }),
    userPrompt: buildDefenseUserPrompt({ round, defenderMemory: memory, attackPacket, worldState }),
    referer,
  });
  const parsed = extractJSON(raw);
  if (!parsed) {
    throw new AppError(`${config.provider} returned an invalid Defense Packet.`, {
      code: "INVALID_DEFENSE_PACKET",
      status: 422,
      provider: config.provider,
      model: config.model,
      detail: { rawResponse: String(raw).slice(0, 500) },
    });
  }
  return normalizeDefensePacket(parsed, { defenderKey, attackerKey, round, worldState });
}

export function normalizeDefensePacket(parsed = {}, { defenderKey, attackerKey, round, worldState }) {
  return {
    protocolVersion: "3.9",
    stage: "defender_response",
    actor: defenderKey,
    target: attackerKey,
    round,
    detectedThreat: parsed.detected_threat || "Incoming attack packet.",
    chosenResponse: parsed.chosen_response || "Brace and guard",
    reason: parsed.reason || "Preserve survivability while reading the opponent.",
    counterAbility: parsed.counter_ability || "",
    shield: parsed.shield || "",
    dodge: parsed.dodge || "",
    teleport: parsed.teleport || "",
    block: parsed.block || "",
    realityDefense: parsed.reality_defense || "",
    timeDefense: parsed.time_defense || "",
    passiveActivation: parsed.passive_activation || "",
    transformation: parsed.transformation || "",
    resourceConsumption: {
      energy: numberOr(parsed.resource_consumption?.energy, 0),
      mana: numberOr(parsed.resource_consumption?.mana, 0),
      stamina: numberOr(parsed.resource_consumption?.stamina, 0),
      realityStability: numberOr(parsed.resource_consumption?.reality_stability, 0),
      mentalStability: numberOr(parsed.resource_consumption?.mental_stability, 0),
    },
    expectedSurvival: parsed.expected_survival || "unknown",
    emergencyPlan: parsed.emergency_plan || "Reassess after engine verdict.",
    worldStateHash: makeWorldStateHash(worldState),
  };
}

export function recordNegotiationPacket(session, fighterKey, packet) {
  if (!session.negotiationMemory) session.negotiationMemory = { packets: [], byFighter: {} };
  session.negotiationMemory.packets.push(packet);
  session.negotiationMemory.packets = session.negotiationMemory.packets.slice(-80);
  if (!session.negotiationMemory.byFighter[fighterKey]) session.negotiationMemory.byFighter[fighterKey] = [];
  session.negotiationMemory.byFighter[fighterKey].push(packet);
  session.negotiationMemory.byFighter[fighterKey] = session.negotiationMemory.byFighter[fighterKey].slice(-40);
}

export function summarizeArbitration({ authorityMode, validation, attackPacket, defensePacket }) {
  return {
    stage: "engine_validation",
    authorityMode,
    validationsPassed: ["packet_schema", "world_state_synchronized"].concat(validation?.valid ? ["ability_validation", "resource_legality"] : []),
    validationsFailed: validation && !validation.valid ? [validation.code] : [],
    attackerIntent: attackPacket?.intent,
    defenderResponse: defensePacket?.chosenResponse || null,
    defenseReason: defensePacket?.reason || null,
    explanation: authorityMode === "ai"
      ? "AI Authority active: engine validates legality and synchronization but does not invent combat outcomes."
      : authorityMode === "hybrid"
        ? "Hybrid Authority active: AI packets drive strategy while engine validates physics, resources, scaling, and final verdict."
        : "Engine Authority active: AI packets provide intent/response while deterministic Phase 3.8 engine computes the final outcome.",
  };
}

export function makeWorldStateHash(worldState) {
  if (!worldState) return "none";
  const text = JSON.stringify(worldState);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return String(hash >>> 0);
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function arrayOf(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}
function inferRange(movement = "") {
  const text = String(movement).toLowerCase();
  if (text.includes("close")) return "close";
  if (text.includes("retreat") || text.includes("range")) return "long";
  return "mid";
}
function normalizeAction(actionName = "Attack") {
  const text = String(actionName).toLowerCase();
  if (text.includes("defend") || text.includes("guard")) return "Defend";
  if (text.includes("special") || text.includes("transform") || text.includes("heal")) return "Special";
  return "Attack";
}
