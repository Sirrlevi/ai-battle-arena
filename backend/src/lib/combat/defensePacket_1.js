// ---------- DEFENSE PACKET ----------
// Phase 3.9, spec section 3. Before the engine calculates anything, the
// defending AI gets the full Attack Packet + its own Combat Profile +
// resources + the shared World State, and must respond with a structured
// Defense Packet: what it detected, what it's choosing to do about it, and
// why. This is a second LLM call per turn (the defender's own provider/
// model/key — never the attacker's), which is the actual mechanism behind
// spec's "AI fighters actively negotiate" framing.

import { callModel } from "../../providers/index.js";
import { extractJSON } from "../extractJson.js";
import { logger } from "../logger.js";

const CHOSEN_RESPONSES = [
  "dodge", "block", "counter", "shield", "teleport",
  "reality_defense", "time_defense", "passive", "transformation", "none",
];

function defenseSystemPrompt({ fighterName, personality, combatStyle, defenderProfile }) {
  return (
    `You are ${fighterName}, defending against an incoming attack in a turn-based battle arena. ` +
    `Personality: ${personality || "unspecified"}. Combat style: ${combatStyle || "unspecified"}. ` +
    `Your Combat Profile: tier ${defenderProfile?.combatTier || "Peak Human"}, durability ${defenderProfile?.durability ?? 4}/10, ` +
    `speed ${defenderProfile?.speed ?? 4}/10. Known powers: ${defenderProfile?.knownPowers?.length ? defenderProfile.knownPowers.join(", ") : "none notable"}. ` +
    `${defenderProfile?.weaknesses?.length ? `Your weaknesses: ${defenderProfile.weaknesses.join(", ")}. ` : ""}` +
    `You will be shown the attacker's structured Attack Packet and the current World State (your own and the ` +
    `attacker's HP/energy/mana/stamina/shield/cooldowns/status). Choose a genuine defensive reaction consistent with ` +
    `your persona and what you can actually afford — the engine will reject a response you can't pay for or don't ` +
    `have the power to perform, and treat it as no defense at all, so don't overreach. ` +
    `Respond with ONLY a JSON object, no prose, no markdown fences. Schema: ` +
    `{"detectedThreat":string,"chosenResponse":"dodge"|"block"|"counter"|"shield"|"teleport"|"reality_defense"|` +
    `"time_defense"|"passive"|"transformation"|"none","reason":string,"counterAbility":string (empty if none),` +
    `"resourceConsumption":{"energy":number,"mana":number,"stamina":number,"realityStability":number,"mentalStability":number} (0 if unused),` +
    `"expectedSurvival":"certain"|"likely"|"uncertain"|"unlikely","emergencyPlan":string (optional)}.`
  );
}

function defenseUserPrompt({ attackPacket, worldState }) {
  return JSON.stringify({
    incoming_attack_packet: attackPacket,
    world_state: worldState,
    instruction: "Decide your Defense Packet for this incoming attack per the schema, staying consistent with your persona and actual resources.",
  });
}

function fallbackDefensePacket(reasonSuffix) {
  // Per spec section 15: never fabricate a defense. This fallback is
  // deliberately inert (chosenResponse "none") rather than inventing a
  // flashy dodge/counter — it only fires when the defender's provider call
  // itself fails after retries, same spirit as combatProfile's fallback.
  return {
    detectedThreat: "unknown",
    chosenResponse: "none",
    reason: `No defensive reaction available${reasonSuffix ? ` — ${reasonSuffix}` : ""}.`,
    counterAbility: "",
    resourceConsumption: { energy: 0, mana: 0, stamina: 0, realityStability: 0, mentalStability: 0 },
    expectedSurvival: "uncertain",
    emergencyPlan: "",
    fallback: true,
  };
}

function normalizeDefensePacket(parsed) {
  const chosen = CHOSEN_RESPONSES.includes(parsed.chosenResponse) ? parsed.chosenResponse : "none";
  const rc = parsed.resourceConsumption || {};
  return {
    detectedThreat: parsed.detectedThreat || "",
    chosenResponse: chosen,
    reason: parsed.reason || "",
    counterAbility: parsed.counterAbility || "",
    resourceConsumption: {
      energy: Number.isFinite(Number(rc.energy)) ? Math.max(0, Number(rc.energy)) : 0,
      mana: Number.isFinite(Number(rc.mana)) ? Math.max(0, Number(rc.mana)) : 0,
      stamina: Number.isFinite(Number(rc.stamina)) ? Math.max(0, Number(rc.stamina)) : 0,
      realityStability: Number.isFinite(Number(rc.realityStability)) ? Math.max(0, Number(rc.realityStability)) : 0,
      mentalStability: Number.isFinite(Number(rc.mentalStability)) ? Math.max(0, Number(rc.mentalStability)) : 0,
    },
    expectedSurvival: ["certain", "likely", "uncertain", "unlikely"].includes(parsed.expectedSurvival) ? parsed.expectedSurvival : "uncertain",
    emergencyPlan: parsed.emergencyPlan || "",
    fallback: false,
  };
}

export async function requestDefensePacket({ config, fighterName, personality, combatStyle, defenderProfile, attackPacket, worldState, referer, sessionId, fighterKey }) {
  try {
    const raw = await callModel({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: defenseSystemPrompt({ fighterName, personality, combatStyle, defenderProfile }),
      userPrompt: defenseUserPrompt({ attackPacket, worldState }),
      referer,
    });
    const parsed = extractJSON(raw);
    if (!parsed) throw new Error("Defense Packet response was not valid JSON.");
    return normalizeDefensePacket(parsed);
  } catch (err) {
    logger.error("defensePacket:failed", { sessionId, fighterKey, error: err.message });
    return fallbackDefensePacket("defender's provider call failed");
  }
}
