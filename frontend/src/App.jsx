import { useState, useRef, useEffect } from "react";
import { Swords, Play, Pause, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { createSession, setSessionKeys, generateCharacter as apiGenerateCharacter, battleTurn as apiBattleTurn, waitForBackend, API_BASE, ApiError, getMemory, getAuthority, setAuthority as apiSetAuthority } from "./api.js";
import { createFighter, resetFighterCombatState, computeSpawnPositions, ARENA_WIDTH, GROUND_Y } from "./lib/battleState.js";
import { resolveAction, tickStatus } from "./lib/battleEngine.js";
import { interpretAction } from "./lib/actionInterpreter.js";
import { createAnimState, queueAction, updateAnimation, applyHitReaction, triggerTransformation, registerTurnOutcome, hitStaggerDegrees } from "./lib/animationController.js";
import { createProjectileManager, spawnProjectile, spawnBeamClashPair, updateProjectiles } from "./lib/projectileManager.js";
import { createCamera, updateCamera, triggerCameraEvent } from "./lib/cameraController.js";
import { createEventBus, on, emit, buildAnimationEvents, buildDebugSnapshot, cameraEventFor, particleEventsFor } from "./lib/animationEventBus.js";
import { createParticleSystem, emitParticles, updateParticles, livingParticles } from "./lib/particleSystem.js";
import { activeStatusVisuals, visualForStatus } from "./lib/statusVisuals.js";
import { useAnimationFrame } from "./hooks/useAnimationFrame.js";
import Arena from "./components/Arena.jsx";
import HUD from "./components/HUD.jsx";
import CharacterCard from "./components/CharacterCard.jsx";
import BattleLog from "./components/BattleLog.jsx";
import MemoryViewer from "./components/MemoryViewer.jsx";
import RealityAuthorityViewer from "./components/RealityAuthorityViewer.jsx";
import AnimationDebugPanel from "./components/AnimationDebugPanel.jsx";

const INK = "#EDEAE3";
const VOID = "#0A0C0F";
const PANEL = "#12151A";
const LINE = "#23282f";
const DIM = "#7C8590";
const HIT = "#E4443B";
const GOLD = "#E8B94A";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { id: "anthropic", label: "Claude", defaultModel: "claude-sonnet-4-6" },
  { id: "gemini", label: "Gemini", defaultModel: "gemini-1.5-flash" },
  { id: "grok", label: "Grok (x.ai)", defaultModel: "grok-2-latest" },
  { id: "groq", label: "Groq", defaultModel: "llama-3.3-70b-versatile" },
  { id: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "meta-llama/llama-3.1-8b-instruct" },
];

const MOTION_BOUNDS = { minX: 40, maxX: ARENA_WIDTH - 40 };
// Phase 4B, spec section 4 ("Particle Trail"). Maps each projectile
// variant to the closest existing particle type from particleSystem.js's
// catalog — "arrow" and "lightning_bolt" are deliberately left out
// (a physical arrow doesn't need a magic trail, and the bolt's own
// zigzag shape already reads as instantaneous rather than trailing).
const TRAIL_PARTICLE = {
  laser: "energy", energy: "energy", fireball: "fire", ice_shard: "ice",
  gravity_orb: "energy", void_sphere: "energy", black_hole: "energy", orb: "energy",
};
// Teleport visual flavor ("thunder effect, fire vfx, wind, magic — alag
// lag"): each variant reuses an existing particleSystem.js emitter profile
// with a color override rather than adding new ones, so the particle
// system's catalog stays the one place particle *behavior* is defined —
// this table only picks which existing behavior + tint reads as which
// element. `ring` plays a brief portal-circle at both ends of the jump,
// `spark` is the burst that sells the specific element.
const TELEPORT_PARTICLES = {
  lightning: { ring: "magic_circle", spark: "lightning", color: "#8FE1FF" },
  fire: { ring: "magic_circle", spark: "fire", color: "#FF8A3D" },
  ice: { ring: "magic_circle", spark: "ice", color: "#BEEFFF" },
  wind: { ring: "magic_circle", spark: "aura_trail", color: "#E8F5EC" },
  shadow: { ring: "magic_circle", spark: "energy", color: "#7B4FE0" },
  arcane: { ring: "magic_circle", spark: "energy", color: "#B98CFF" },
};
const TORSO_OFFSET_Y = -80; // where projectiles launch from / aim at, relative to a fighter's feet
let dmgNumberId = 1;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function logError(tag, info) {
  // eslint-disable-next-line no-console
  console.error(`[BattleArena] ✕ ${tag}`, info);
}

// Codes that mean "this provider cannot continue in this battle at all" —
// retrying won't help (bad/expired key, unknown model) or already retried
// hard on the backend before giving up (rate limit / quota, which is what
// RATE_LIMITED means by the time it reaches us — see providers/loggedFetch.js
// + lib/retry.js: transient 429s are retried with backoff server-side
// first). A fighter hitting one of these is taken off the board for the
// rest of the fight rather than being retried every single round.
const PERMANENT_FAILURE_CODES = new Set([
  "RATE_LIMITED",
  "INVALID_API_KEY",
  "INVALID_MODEL",
  "NO_API_KEY",
  "UNSUPPORTED_PROVIDER",
  "VALIDATION_ERROR",
]);

function humanizeFailureCode(code) {
  switch (code) {
    case "RATE_LIMITED": return "rate-limited / API quota exhausted";
    case "INVALID_API_KEY": return "invalid API key";
    case "INVALID_MODEL": return "unknown or unsupported model";
    case "NO_API_KEY": return "no API key on file";
    case "UNSUPPORTED_PROVIDER": return "unsupported provider";
    case "VALIDATION_ERROR": return "request rejected by the backend";
    case "CONFIG": return "backend not configured (VITE_API_URL)";
    case "TIMEOUT": return "timed out";
    case "NETWORK_ERROR": return "network error reaching the backend";
    case "PROVIDER_UNAVAILABLE": return "provider temporarily unavailable";
    case "INVALID_JSON_RESPONSE": return "returned a response the engine couldn't parse";
    default: return null;
  }
}

/**
 * Turns a failed battle-turn API call into a { mode, reason } verdict for
 * the game loop. "disable" = this fighter can't continue this fight at
 * all — mark them and stop calling the API for them. "skip" = a one-off
 * glitch — this turn is forfeit (no damage either way) but they get a
 * fresh try on their next turn. Never returns anything that lets the
 * caller fabricate an action; the whole point is that a failed call
 * produces no action.
 */
function classifyTurnFailure(e) {
  const code = e instanceof ApiError ? e.envelope?.error?.code : null;
  if (code && PERMANENT_FAILURE_CODES.has(code)) {
    return { mode: "disable", reason: humanizeFailureCode(code) };
  }
  if (e instanceof ApiError && e.kind === "config") {
    return { mode: "disable", reason: humanizeFailureCode("CONFIG") };
  }
  // Timeouts, network blips, a backend that's briefly unreachable/asleep,
  // or a malformed reply this one time — all transient.
  const reason = humanizeFailureCode(code) || (e instanceof ApiError ? e.message : null) || "temporary issue";
  return { mode: "skip", reason };
}

// ---------- UI: fighter setup form (Phase 1, unchanged behavior) ----------
function FighterSetup({ fighter, onChange, disabled }) {
  const p = PROVIDERS.find((x) => x.id === fighter.provider);
  return (
    <div className="rounded-lg p-4 space-y-3" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: fighter.color }} />
        <span className="text-xs uppercase tracking-widest" style={{ color: fighter.color, fontFamily: "'IBM Plex Mono', monospace" }}>
          Fighter {fighter.key}
        </span>
      </div>
      <select
        disabled={disabled}
        value={fighter.provider}
        onChange={(e) => {
          const prov = PROVIDERS.find((x) => x.id === e.target.value);
          onChange({ ...fighter, provider: e.target.value, model: prov.defaultModel });
        }}
        className="w-full text-sm rounded px-2 py-2 outline-none"
        style={{ background: VOID, border: `1px solid ${LINE}`, color: INK }}
      >
        {PROVIDERS.map((pr) => (
          <option key={pr.id} value={pr.id}>{pr.label}</option>
        ))}
      </select>
      <input
        disabled={disabled}
        value={fighter.model}
        onChange={(e) => onChange({ ...fighter, model: e.target.value })}
        placeholder="model id"
        className="w-full text-sm rounded px-2 py-2 outline-none"
        style={{ background: VOID, border: `1px solid ${LINE}`, color: INK, fontFamily: "'IBM Plex Mono', monospace" }}
      />
      <input
        disabled={disabled}
        type="password"
        value={fighter.apiKey}
        onChange={(e) => onChange({ ...fighter, apiKey: e.target.value })}
        placeholder={`${p.label} API key (sent to your backend only)`}
        className="w-full text-sm rounded px-2 py-2 outline-none"
        style={{ background: VOID, border: `1px solid ${LINE}`, color: INK, fontFamily: "'IBM Plex Mono', monospace" }}
      />
      <textarea
        disabled={disabled}
        value={fighter.customPrompt}
        onChange={(e) => onChange({ ...fighter, customPrompt: e.target.value })}
        placeholder="Optional character direction / personality prompt"
        rows={2}
        className="w-full text-sm rounded px-2 py-2 outline-none resize-none"
        style={{ background: VOID, border: `1px solid ${LINE}`, color: INK }}
      />
    </div>
  );
}

// Roster is a plain array so the renderer/engine already work for any N —
// Phase 2/3 just seed it with two fighters via the setup screen.
const ROSTER_KEYS = ["A", "B"];

function makeInitialRoster() {
  const positions = computeSpawnPositions(ROSTER_KEYS.length);
  return ROSTER_KEYS.map((key, index) =>
    createFighter({ key, index, total: ROSTER_KEYS.length, provider: "openai", model: "gpt-4o-mini", apiKey: "", customPrompt: "", position: positions[index] })
  );
}

function makeAnimMap(roster) {
  const map = {};
  for (const f of roster) {
    const anim = createAnimState(f.position.x, GROUND_Y, GROUND_Y);
    anim.key = f.key;
    map[f.key] = anim;
  }
  return map;
}

export default function App() {
  const [roster, setRoster] = useState(makeInitialRoster);
  const [phase, setPhase] = useState("setup"); // setup | generating | battle | paused | finished
  const [log, setLog] = useState([]);
  const [round, setRound] = useState(1);
  const [errorMsg, setErrorMsg] = useState("");
  const [winnerKey, setWinnerKey] = useState(null);
  const [thinkingKey, setThinkingKey] = useState(null);
  const [lastEntry, setLastEntry] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [backendOk, setBackendOk] = useState(null); // null = checking, true/false once known
  const [wakeAttempt, setWakeAttempt] = useState(0);
  const [damageNumbers, setDamageNumbers] = useState([]);
  const [, setRenderTick] = useState(0); // forces a re-render every animation frame

  // Phase 3.5: Reality Authority + debug panels
  const [authorityMode, setAuthorityModeState] = useState("engine");
  const [refereeEnabled, setRefereeEnabledState] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [memoryData, setMemoryData] = useState(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [authorityPanelOpen, setAuthorityPanelOpen] = useState(false);
  const [authorityData, setAuthorityData] = useState(null);
  const [authorityLoading, setAuthorityLoading] = useState(false);
  const lastRealityRef = useRef(null);

  const runRef = useRef({ stop: false, pause: false });
  const stateRef = useRef(roster);
  const animRef = useRef(makeAnimMap(roster));
  const projectileManagerRef = useRef(createProjectileManager());
  const cameraRef = useRef(createCamera(ARENA_WIDTH / 2));
  // Freeze-frame timer (seconds remaining) for hit-stop, read/written every
  // frame by the game loop below. This was previously referenced without
  // ever being declared, which threw a ReferenceError on the first battle
  // frame and silently killed the whole requestAnimationFrame loop — the
  // root cause of movement/animation appearing to stop.
  const hitstopRef = useRef(0);

  // Phase 3.95: Animation Sync Engine
  const eventBusRef = useRef(createEventBus());
  const particleSystemRef = useRef(createParticleSystem());
  const animationTimelineRef = useRef([]); // spec section 11: one recorded entry per resolved turn, replayable
  const animDebugRef = useRef(null);
  const audioCuesRef = useRef([]); // Phase 4D, spec section 17: rolling log of fired sound-cue names (no audio assets — this is the event layer itself)
  const [animDebugOpen, setAnimDebugOpen] = useState(false);

  // Wake the backend (tolerating Render free-tier cold starts) and then
  // establish a session, as soon as the app loads.
  useEffect(() => {
    let cancelled = false;
    async function connect() {
      const ok = await waitForBackend({ maxWaitMs: 60000, intervalMs: 3000, onAttempt: (n) => !cancelled && setWakeAttempt(n) });
      if (cancelled) return;
      if (!ok) {
        setBackendOk(false);
        setErrorMsg(`Could not reach the backend at ${API_BASE || "(VITE_API_URL not set)"} after 60s.`);
        return;
      }
      setBackendOk(true);
      try {
        const sid = await createSession();
        if (!cancelled) setSessionId(sid);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e.message);
        logError("createSession", e);
      }
    }
    connect();
    return () => { cancelled = true; };
  }, []);

  function pushDamageNumber(x, y, damage, color) {
    const id = dmgNumberId++;
    setDamageNumbers((prev) => [...prev, { id, x, y, text: `-${damage}`, color }]);
    setTimeout(() => setDamageNumbers((prev) => prev.filter((d) => d.id !== id)), 950);
  }

  // Brief freeze-frame on impact, scaled by how hard the hit landed — the
  // same feel beam-clashes already had (see the spawnBeamClashPair onClash
  // below), extended to ordinary melee/projectile hits. Skipped below a
  // small damage floor so chip damage doesn't stutter the game with
  // constant micro-freezes; `Math.max` so an already-active hitstop from a
  // simultaneous event is never shortened.
  function triggerHitstop(damage = 0, lethal = false) {
    if (damage < 4 && !lethal) return;
    const base = Math.min(0.1, 0.02 + damage * 0.0016);
    hitstopRef.current = Math.max(hitstopRef.current, lethal ? base + 0.05 : base);
  }

  function handleImpact(actorAnim, targetKey, impact) {
    const targetAnim = animRef.current[targetKey];
    if (!targetAnim) return;

    if (impact.spawnBeamClash) {
      // Phase 4B, spec section 5. See spawnBeamClashPair's doc comment in
      // projectileManager.js and resolveProjectileVariant's in
      // animationController.js for why this specific trigger (a ranged
      // attack met with a "counter" response) is the one beam-clash
      // scenario this turn-based battle loop can actually produce.
      spawnBeamClashPair(projectileManagerRef.current, {
        variantA: impact.projectileVariant,
        fromAX: actorAnim.motion.x, fromAY: actorAnim.motion.y + TORSO_OFFSET_Y,
        toAX: targetAnim.motion.x, toAY: targetAnim.motion.y + TORSO_OFFSET_Y,
        ownerAKey: actorAnim.key, targetAKey: targetKey,
        payloadA: { damage: impact.damage, result: impact.result },
        variantB: impact.counterVariant,
        fromBX: targetAnim.motion.x, fromBY: targetAnim.motion.y + TORSO_OFFSET_Y,
        toBX: actorAnim.motion.x, toBY: actorAnim.motion.y + TORSO_OFFSET_Y,
        ownerBKey: targetKey, targetBKey: actorAnim.key,
        payloadB: { damage: impact.counterDamage, result: "hit" },
        onClash: (cx, cy) => {
          triggerCameraEvent(cameraRef.current, "beam-clash");
          emitParticles(particleSystemRef.current, "energy", cx, cy, { intensity: "high" });
          emitParticles(particleSystemRef.current, "explosion_ring", cx, cy, { intensity: "medium" });
          hitstopRef.current = Math.max(hitstopRef.current, 0.12);
        },
      });
      return;
    }

    if (impact.spawnProjectile) {
      spawnProjectile(projectileManagerRef.current, {
        variant: impact.projectileVariant,
        fromX: actorAnim.motion.x,
        fromY: actorAnim.motion.y + TORSO_OFFSET_Y,
        toX: targetAnim.motion.x,
        toY: targetAnim.motion.y + TORSO_OFFSET_Y,
        ownerKey: actorAnim.key,
        targetKey,
        payload: { damage: impact.damage, result: impact.result },
        bounds: MOTION_BOUNDS,
      });
      return;
    }

    if (impact.result === "hit" || impact.result === "lethal") {
      applyHitReaction(targetAnim, actorAnim.motion.x, impact.damage);
      triggerHitstop(impact.damage, impact.result === "lethal");
      pushDamageNumber(targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, impact.damage, HIT);
    }
  }

  // ---------- The Phase 3 game loop: runs independently of the turn-based
  // backend calls, so movement stays smooth while an AI is "thinking". ----------
  useAnimationFrame((dt) => {
    if (phase === "setup" || phase === "paused") return;

    // Phase 4B, spec section 5 ("Pause movement"): a real freeze-frame,
    // not a slow-motion fudge — while active, nothing below advances at
    // all, only the render tick, so the pause is actually visible.
    if (hitstopRef.current > 0) {
      hitstopRef.current = Math.max(0, hitstopRef.current - dt);
      setRenderTick((t) => t + 1);
      return;
    }

    const currentRoster = stateRef.current;
    const newFrameCues = [];
    for (const f of currentRoster) {
      const anim = animRef.current[f.key];
      if (!anim) continue;
      const { impact, state } = updateAnimation(anim, dt, MOTION_BOUNDS, anim.homeX, f.alive);
      anim.state = state;
      if (impact) handleImpact(anim, impact.targetKey, impact);
      // Phase 4D, spec section 17: the two cue types with no resolved turn
      // to attach to — everything else's sound cue rides along on that
      // turn's animation events (see the "turn:resolved" subscriber below).
      if (anim.motion.justStepped) newFrameCues.push("footstep");
      // Landing: silent for a soft hover ("like butter" — no cue, no VFX),
      // the existing plain thud for a jump or any other grounded arrival,
      // and a full hard-landing burst for a fly landing specifically —
      // shockwave ring + kicked-up dust + debris + a camera shake, timed
      // off the same justLanded flag jump-landings already used (a fly
      // command targeting groundY naturally flips grounded true through
      // the normal gravity/ground-contact check once the command clears,
      // same as everything else that lands).
      if (anim.motion.justLanded) {
        if (anim.motion.mode === "fly") {
          newFrameCues.push("landing_thud");
          emitParticles(particleSystemRef.current, "explosion_ring", anim.motion.x, anim.motion.y, { intensity: "medium" });
          emitParticles(particleSystemRef.current, "dust", anim.motion.x, anim.motion.y, { intensity: "high" });
          emitParticles(particleSystemRef.current, "debris", anim.motion.x, anim.motion.y, { intensity: "medium" });
          triggerCameraEvent(cameraRef.current, "medium-shake");
        } else if (anim.motion.mode !== "hover") {
          newFrameCues.push("landing_thud");
        }
      }
      // Takeoff: the hard-flight counterpart to the hard landing above —
      // hover deliberately gets none of this at all (spec: soft/smooth
      // takeoff, no burst, hovers "like butter").
      if (anim.motion.justTookOff && anim.motion.mode === "fly") {
        emitParticles(particleSystemRef.current, "explosion_ring", anim.motion.x, anim.motion.y, { intensity: "medium" });
        emitParticles(particleSystemRef.current, "dust", anim.motion.x, anim.motion.y, { intensity: "high" });
        triggerCameraEvent(cameraRef.current, "small-shake");
      }
      // A light continuous trail for the whole traversal, not just the two
      // endpoints — probabilistic emission (~14/s) instead of a new
      // per-fighter accumulator field, since this is purely decorative and
      // only one fighter is usually airborne at a time.
      if ((anim.motion.mode === "fly" || anim.motion.mode === "hover") && anim.motion.command && Math.random() < dt * 14) {
        emitParticles(particleSystemRef.current, "aura_trail", anim.motion.x - anim.motion.facing * 14, anim.motion.y, { intensity: anim.motion.mode === "fly" ? "medium" : "low" });
      }
      if (anim.motion.justVanished || anim.motion.justArrived) {
        const flavor = TELEPORT_PARTICLES[anim.motion.teleportVariant] || TELEPORT_PARTICLES.arcane;
        // Vanish burst plays at the ORIGIN (stashed on the command before
        // the instant position-snap — see movementController.js's
        // "teleport" branch); arrive burst plays at the fighter's
        // already-snapped current position. Both flags land on the same
        // tick by design (the hidden window is a single instant, not a
        // held pause), so both bursts fire together here.
        if (anim.motion.justVanished) {
          const ox = anim.motion.command?.originX ?? anim.motion.x;
          const oy = (anim.motion.command?.originY ?? anim.motion.y) + TORSO_OFFSET_Y / 2;
          emitParticles(particleSystemRef.current, flavor.ring, ox, oy, { intensity: "medium", color: flavor.color });
          emitParticles(particleSystemRef.current, flavor.spark, ox, oy, { intensity: "high", color: flavor.color });
        }
        if (anim.motion.justArrived) {
          const ay = anim.motion.y + TORSO_OFFSET_Y / 2;
          emitParticles(particleSystemRef.current, flavor.ring, anim.motion.x, ay, { intensity: "medium", color: flavor.color });
          emitParticles(particleSystemRef.current, flavor.spark, anim.motion.x, ay, { intensity: "high", color: flavor.color });
        }
      }
    }
    if (newFrameCues.length) audioCuesRef.current = [...audioCuesRef.current, ...newFrameCues].slice(-40);

    updateProjectiles(
      projectileManagerRef.current,
      dt,
      (p) => {
        if (p.payload?.result === "hit" || p.payload?.result === "lethal") {
          const targetAnim = animRef.current[p.targetKey];
          if (targetAnim) {
            applyHitReaction(targetAnim, p.fromX, p.payload.damage);
            triggerHitstop(p.payload.damage, p.payload.result === "lethal");
            pushDamageNumber(p.toX, p.toY, p.payload.damage, HIT);
          }
        }
      },
      (p) => {
        const trailType = TRAIL_PARTICLE[p.variant];
        if (trailType) emitParticles(particleSystemRef.current, trailType, p.x, p.y, { intensity: "low" });
      }
    );

    updateCamera(cameraRef.current, currentRoster.map((f) => ({ alive: f.alive, motion: animRef.current[f.key]?.motion })), ARENA_WIDTH, dt);
    updateParticles(particleSystemRef.current, dt);

    setRenderTick((t) => t + 1);
  }, true);

  // Phase 3.95, spec section 12: the Animation Event Bus is a real pub/sub —
  // runLoop only ever emits "turn:resolved"; this is the one place that
  // listens and fans it out to camera/particles/transformation/timeline.
  // Registered once so re-renders don't pile up duplicate listeners.
  useEffect(() => {
    const bus = eventBusRef.current;
    const unsubscribe = on(bus, "turn:resolved", ({ entry, animEvents }) => {
      const camEvt = cameraEventFor(entry);
      if (camEvt) triggerCameraEvent(cameraRef.current, camEvt.kind);

      const impactAnim = animRef.current[entry.defenderKey];
      const fallbackFighter = stateRef.current.find((f) => f.key === entry.defenderKey);
      for (const pe of particleEventsFor(entry)) {
        emitParticles(
          particleSystemRef.current,
          pe.particle,
          impactAnim?.motion.x ?? fallbackFighter?.position.x ?? 0,
          (impactAnim?.motion.y ?? fallbackFighter?.position.y ?? 0) + TORSO_OFFSET_Y,
          { intensity: pe.intensity }
        );
      }

      if (animEvents.some((e) => e.type === "Transformation")) {
        const actorAnimForTransform = animRef.current[entry.actorKey];
        if (actorAnimForTransform) triggerTransformation(actorAnimForTransform);
      }

      animDebugRef.current = buildDebugSnapshot(entry, animEvents);
      animationTimelineRef.current = [...animationTimelineRef.current, {
        round: entry.round, actorKey: entry.actorKey, defenderKey: entry.defenderKey, animEvents, cameraEvent: camEvt,
      }].slice(-200);
      const newCues = animEvents.map((e) => e.sound).filter(Boolean);
      if (newCues.length) audioCuesRef.current = [...audioCuesRef.current, ...newCues].slice(-40);
    });
    return unsubscribe;
  }, []);

  function updateFighter(key, val) {
    setRoster((prev) => prev.map((f) => (f.key === key ? val : f)));
  }

  function fighterByKey(list, key) {
    return list.find((f) => f.key === key);
  }

  async function generateCharacterFor(sid, fighter) {
    const character = await apiGenerateCharacter(sid, fighter.key, fighter.customPrompt);
    return resetFighterCombatState({ ...fighter, ...character });
  }

  async function refreshMemory() {
    if (!sessionId) return;
    setMemoryLoading(true);
    try {
      const data = await getMemory(sessionId);
      setMemoryData(data);
    } catch (e) {
      logError("refreshMemory", e);
    } finally {
      setMemoryLoading(false);
    }
  }

  async function refreshAuthority() {
    if (!sessionId) return;
    setAuthorityLoading(true);
    try {
      const data = await getAuthority(sessionId);
      setAuthorityData(data);
      setAuthorityModeState(data.mode);
      setRefereeEnabledState(data.refereeEnabled);
    } catch (e) {
      logError("refreshAuthority", e);
    } finally {
      setAuthorityLoading(false);
    }
  }

  async function handleChangeAuthorityMode(mode) {
    setAuthorityModeState(mode);
    if (!sessionId) return;
    try {
      await apiSetAuthority(sessionId, { mode });
      refreshAuthority();
    } catch (e) {
      logError("setAuthorityMode", e);
    }
  }

  async function handleToggleReferee(enabled) {
    setRefereeEnabledState(enabled);
    if (!sessionId) return;
    try {
      await apiSetAuthority(sessionId, { refereeEnabled: enabled });
    } catch (e) {
      logError("setReferee", e);
    }
  }

  function toggleMemoryPanel() {
    setMemoryPanelOpen((open) => {
      const next = !open;
      if (next) refreshMemory();
      return next;
    });
  }

  function toggleAuthorityPanel() {
    setAuthorityPanelOpen((open) => {
      const next = !open;
      if (next) refreshAuthority();
      return next;
    });
  }

  async function startBattle() {
    if (!sessionId) {
      setErrorMsg(backendOk === false ? "Backend is unreachable — can't start a battle." : "Still connecting to the backend — try again in a moment.");
      return;
    }
    const [fighterA, fighterB] = roster;
    if (!fighterA.apiKey || !fighterB.apiKey) {
      setErrorMsg("Both fighters need an API key before the battle can start.");
      return;
    }
    setErrorMsg("");
    setLog([]);
    setRound(1);
    setWinnerKey(null);
    setLastEntry(null);
    setDamageNumbers([]);
    setAuthorityModeState("engine");
    setRefereeEnabledState(false);
    setAuthorityData(null);
    setMemoryData(null);
    lastRealityRef.current = null;
    setPhase("generating");

    try {
      await setSessionKeys(sessionId, fighterA, fighterB);
    } catch (e) {
      logError("setSessionKeys", e);
      setErrorMsg(e.message);
      setPhase("setup");
      return;
    }

    const results = await Promise.allSettled(roster.map((f) => generateCharacterFor(sessionId, f)));
    const rejected = results.filter((r) => r.status === "rejected");
    results.forEach((r, i) => { if (r.status === "rejected") logError(`startBattle:fighter${roster[i].key}`, r.reason); });

    if (rejected.length > 0) {
      const lines = results
        .map((r, i) => (r.status === "rejected" ? `Fighter ${roster[i].key} — ${r.reason?.message || String(r.reason)}` : null))
        .filter(Boolean);
      setErrorMsg(lines.join("  |  "));
      setPhase("setup");
      return;
    }

    const newRoster = results.map((r) => r.value);
    setRoster(newRoster);
    stateRef.current = newRoster.map((f) => ({ ...f, status: [...f.status], cooldowns: { ...f.cooldowns } }));

    // Fresh animation/projectile/camera state for the new fight.
    animRef.current = makeAnimMap(newRoster);
    projectileManagerRef.current = createProjectileManager();
    cameraRef.current = createCamera(ARENA_WIDTH / 2);
    particleSystemRef.current = createParticleSystem();
    animationTimelineRef.current = [];
    audioCuesRef.current = [];
    animDebugRef.current = null;

    setLog(newRoster.map((f) => ({ system: true, text: `${f.name} enters the arena — "${f.intro}"` })));
    runRef.current = { stop: false, pause: false };
    setPhase("battle");
    runLoop();
  }

  async function runLoop() {
    let turn = 0; // index into stateRef.current
    let r = 1;
    while (!runRef.current.stop) {
      while (runRef.current.pause && !runRef.current.stop) {
        await sleep(250);
      }
      if (runRef.current.stop) break;

      const st = stateRef.current;
      const attacker = st[turn];
      const defender = st[1 - turn]; // two-fighter roster for now; N-fighter targeting is a later concern
      const attackerAnimState = animRef.current[attacker.key];

      // A fighter already marked unable to continue this fight (exhausted
      // quota, invalid key/model — see classifyTurnFailure below) never
      // gets another API call: no wasted request, no damage, no movement.
      // Their opponent's turns keep resolving normally, so this fighter can
      // still be hit and finished off — they just can't act back.
      if (attackerAnimState?.disabled) {
        turn = 1 - turn;
        if (turn === 0) { r += 1; setRound(r); }
        await sleep(900);
        continue;
      }

      setThinkingKey(attacker.key);
      let action = null;
      let reality = null;
      let narration = null;
      let verdict = null;
      let turnFailure = null;
      try {
        const recentTurns = log.filter((l) => !l.system).slice(-10);
        const result = await apiBattleTurn(
          sessionId,
          attacker.key,
          r,
          { name: attacker.name, hp: attacker.hp, energy: attacker.energy, status: attacker.status.map((s) => s.type), combatStyle: attacker.combatStyle, personality: attacker.personality, weapon: attacker.weapon, aura: attacker.aura },
          { name: defender.name, hp: defender.hp, energy: defender.energy, status: defender.status.map((s) => s.type) },
          recentTurns,
          attacker.customPrompt
        );
        action = result.action;
        reality = result.reality;
        narration = result.narration;
        verdict = result.verdict;
      } catch (e) {
        logError("runLoop:turn", { round: r, actor: attacker.name, message: e.message, envelope: e instanceof ApiError ? e.envelope : null });
        turnFailure = classifyTurnFailure(e);
      }
      setThinkingKey(null);

      // The AI didn't actually respond this turn — the engine must never
      // invent an attack to fill the gap. A transient failure just costs
      // this fighter their turn (no resolveAction call at all, so hp/energy
      // are untouched and no animation plays); a failure that means this
      // provider can't continue (quota exhausted, bad key/model) takes them
      // off the board for the rest of the fight — no more requests, no more
      // movement, and their opponent's turns still land on them normally.
      if (turnFailure) {
        if (turnFailure.mode === "disable" && attackerAnimState) {
          attackerAnimState.disabled = true;
          attackerAnimState.disabledReason = turnFailure.reason;
          setLog((prev) => [...prev, { system: true, text: `⚠️ ${attacker.name} is unable to continue (${turnFailure.reason}) — no further actions this fight.` }]);
        } else {
          setLog((prev) => [...prev, { system: true, text: `⏳ ${attacker.name}'s turn was skipped (${turnFailure.reason}) — no damage dealt.` }]);
        }
        turn = 1 - turn;
        if (turn === 0) { r += 1; setRound(r); }
        await sleep(900);
        continue;
      }

      const entry = resolveAction(r, attacker, defender, action, reality, verdict);
      tickStatus(attacker);

      // Phase 3.95: Animation Event Bus. Reads ONLY what the engine already
      // validated (entry.verdict / entry.statusApplied / entry.defense /
      // entry.eventType) — never re-derives combat from prose. Falls back
      // to the pre-3.95 keyword interpreter only when no verdict exists
      // (AI/Hybrid Authority), same fallback contract as every other
      // Phase 3.8/3.9 frontend integration point.
      const animEvents = buildAnimationEvents(entry);
      entry.animationEvents = animEvents;

      // Newly-applied status effects get a visual-only entry on the
      // defender's status list so Stickman can render an aura ring for
      // them — purely cosmetic, never read by any damage/dodge formula.
      if (entry.statusApplied?.length) {
        for (const applied of entry.statusApplied) {
          if (visualForStatus(applied.type)) {
            defender.status.push({ type: applied.type, rounds: applied.roundsLeft || 2, stacks: applied.stacks || 1, visualOnly: true });
          }
        }
      }

      // Hand off to the Animation Event Bus (section 12) — camera/particle/
      // transformation/timeline dispatch all happen in the one subscriber
      // registered in the useEffect above, not here.
      emit(eventBusRef.current, "turn:resolved", { entry, animEvents });

      stateRef.current = st.map((f) => ({ ...f, status: [...f.status], cooldowns: { ...f.cooldowns } }));
      setRoster(stateRef.current);
      lastRealityRef.current = reality;
      setLog((prev) => [...prev, entry, ...(narration ? [{ system: true, text: `📣 ${narration}` }] : [])]);
      setLastEntry(entry);

      // If the debug panels are open, keep them in sync with what just happened.
      if (memoryPanelOpen) refreshMemory();
      if (authorityPanelOpen) refreshAuthority();

      // Hand the resolved outcome to the animation layer: it decides HOW to
      // show it (melee dash-in, projectile flight, block pose, ...) while
      // the actual hp/energy numbers above are already final.
      const attackerAnim = animRef.current[attacker.key];
      const defenderAnim = animRef.current[defender.key];
      if (attackerAnim && defenderAnim) {
        const intent = interpretAction(entry);
        queueAction(attackerAnim, intent, defenderAnim, entry);
        registerTurnOutcome(attackerAnim, entry.result === "hit" || entry.result === "lethal");
      }

      if (!defender.alive) {
        setWinnerKey(attacker.key);
        setPhase("finished");
        runRef.current.stop = true;
        break;
      }

      turn = 1 - turn;
      if (turn === 0) { r += 1; setRound(r); }
      await sleep(900);
    }
  }

  function togglePause() {
    if (phase === "battle") { runRef.current.pause = true; setPhase("paused"); }
    else if (phase === "paused") { runRef.current.pause = false; setPhase("battle"); }
  }

  function reset() {
    runRef.current.stop = true;
    setPhase("setup");
    setLog([]);
    setRound(1);
    setWinnerKey(null);
    setLastEntry(null);
    setDamageNumbers([]);
    setRoster((prev) => {
      const positions = computeSpawnPositions(prev.length);
      const next = prev.map((f, i) => createFighter({ key: f.key, index: i, total: prev.length, provider: f.provider, model: f.model, apiKey: f.apiKey, customPrompt: f.customPrompt, position: positions[i] }));
      stateRef.current = next;
      animRef.current = makeAnimMap(next);
      projectileManagerRef.current = createProjectileManager();
      cameraRef.current = createCamera(ARENA_WIDTH / 2);
      particleSystemRef.current = createParticleSystem();
      animationTimelineRef.current = [];
      audioCuesRef.current = [];
      animDebugRef.current = null;
      return next;
    });
  }

  const setupLocked = phase !== "setup";
  const thinkingFighter = thinkingKey ? fighterByKey(roster, thinkingKey) : null;
  const winnerFighter = winnerKey ? fighterByKey(roster, winnerKey) : null;
  const fighterColors = Object.fromEntries(roster.map((f) => [f.key, f.color]));
  const activeEffects = lastEntry?.effect ? { [lastEntry.actorKey]: lastEntry.effect } : {};

  const poses = Object.fromEntries(
    roster.map((f) => {
      const anim = animRef.current[f.key];
      return [
        f.key,
        anim
          ? {
              x: anim.motion.x, y: anim.motion.y, facing: anim.motion.facing, state: anim.state, attackPhase: anim.attackPhase, flashing: anim.flashTimer > 0, hitMagnitude: anim.lastHitDamage || 0,
              vx: anim.motion.vx, vy: anim.motion.vy, grounded: anim.motion.grounded, mode: anim.motion.mode, justHitWall: anim.motion.justHitWall, combo: anim.comboCount || 0,
              teleportAlpha: anim.motion.teleportAlpha, hitStagger: hitStaggerDegrees(anim),
            }
          : { x: f.position.x, y: f.position.y, facing: 1, state: "idle", attackPhase: null, flashing: false, hitMagnitude: 0, vx: 0, vy: 0, grounded: true, mode: "idle", justHitWall: false, combo: 0, teleportAlpha: 1, hitStagger: 0 },
      ];
    })
  );
  const statusVisualsByFighter = Object.fromEntries(roster.map((f) => [f.key, activeStatusVisuals(f.status)]));
  // Phase 4A: drives the new victory pose (spec section 14) — false for
  // every fighter until the battle actually ends, so it never affects a
  // battle in progress.
  const isWinnerByFighter = Object.fromEntries(roster.map((f) => [f.key, phase === "finished" && f.key === winnerKey]));

  return (
    <div className="min-h-screen w-full" style={{ background: VOID, color: INK, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Swords size={22} style={{ color: GOLD }} />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">AI Battle Arena</h1>
              <p className="text-xs" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
                {backendOk === null && `Connecting to backend${wakeAttempt > 1 ? ` (attempt ${wakeAttempt} — Render free tier can take up to a minute to wake up)` : ""}…`}
                {backendOk === true && `Connected · ${API_BASE}`}
                {backendOk === false && `Backend unreachable · ${API_BASE || "VITE_API_URL not set"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {phase === "setup" && (
              <button
                onClick={startBattle}
                disabled={!sessionId}
                className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: GOLD, color: VOID }}
              >
                {sessionId ? <Play size={15} /> : <Loader2 size={15} className="animate-spin" />}
                {sessionId ? "Start Battle" : "Connecting…"}
              </button>
            )}
            {phase === "generating" && (
              <div className="flex items-center gap-2 px-4 py-2 rounded text-sm" style={{ background: PANEL, color: DIM, border: `1px solid ${LINE}` }}>
                <Loader2 size={15} className="animate-spin" /> Forging fighters…
              </div>
            )}
            {(phase === "battle" || phase === "paused") && (
              <button onClick={togglePause} className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium" style={{ background: PANEL, color: INK, border: `1px solid ${LINE}` }}>
                {phase === "paused" ? <Play size={15} /> : <Pause size={15} />} {phase === "paused" ? "Resume" : "Pause"}
              </button>
            )}
            {phase !== "setup" && (
              <button onClick={toggleMemoryPanel} className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium" style={{ background: memoryPanelOpen ? "#1c2027" : PANEL, color: memoryPanelOpen ? GOLD : DIM, border: `1px solid ${memoryPanelOpen ? GOLD : LINE}` }}>
                🧠 Memory
              </button>
            )}
            {phase !== "setup" && (
              <button onClick={toggleAuthorityPanel} className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium" style={{ background: authorityPanelOpen ? "#1c2027" : PANEL, color: authorityPanelOpen ? GOLD : DIM, border: `1px solid ${authorityPanelOpen ? GOLD : LINE}` }}>
                ⚖️ Authority: {authorityMode}
              </button>
            )}
            {phase !== "setup" && (
              <button onClick={() => setAnimDebugOpen((o) => !o)} className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium" style={{ background: animDebugOpen ? "#1c2027" : PANEL, color: animDebugOpen ? GOLD : DIM, border: `1px solid ${animDebugOpen ? GOLD : LINE}` }}>
                🎬 Animation
              </button>
            )}
            {phase !== "setup" && (
              <button onClick={reset} className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium" style={{ background: "transparent", color: DIM, border: `1px solid ${LINE}` }}>
                <RotateCcw size={15} /> Reset
              </button>
            )}
          </div>
        </header>

        {errorMsg && (
          <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded text-sm" style={{ background: "#2a1414", border: `1px solid ${HIT}`, color: "#ffb4ae" }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              {errorMsg.split("  |  ").map((line, i) => (
                <div key={i} className="mb-1 last:mb-0" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem" }}>{line}</div>
              ))}
              <div className="mt-1 text-xs" style={{ color: "#c98d88" }}>
                Backend: {API_BASE || "(not configured)"} · Full request/response details logged in the backend terminal.
                {backendOk === false && " If this is a Render free-tier service, it may just be waking up — reload in ~30s."}
              </div>
            </div>
          </div>
        )}

        {phase !== "setup" && (
          <>
            <MemoryViewer
              open={memoryPanelOpen}
              data={memoryData}
              loading={memoryLoading}
              fighters={roster}
              onRefresh={refreshMemory}
              onClose={toggleMemoryPanel}
            />
            <RealityAuthorityViewer
              open={authorityPanelOpen}
              mode={authorityMode}
              refereeEnabled={refereeEnabled}
              lastEvent={authorityData?.lastRealityEvent || lastRealityRef.current}
              onChangeMode={handleChangeAuthorityMode}
              onToggleReferee={handleToggleReferee}
              onRefresh={refreshAuthority}
              loading={authorityLoading}
              onClose={toggleAuthorityPanel}
            />
            <AnimationDebugPanel
              open={animDebugOpen}
              snapshot={animDebugRef.current}
              camera={cameraRef.current}
              poses={poses}
              onClose={() => setAnimDebugOpen(false)}
              particleCount={livingParticles(particleSystemRef.current).length}
              statusVisualsByFighter={statusVisualsByFighter}
              audioCues={audioCuesRef.current}
            />
          </>
        )}

        {phase === "setup" && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {roster.map((f) => (
              <FighterSetup key={f.key} fighter={f} onChange={(v) => updateFighter(f.key, v)} disabled={setupLocked} />
            ))}
          </div>
        )}

        {phase !== "setup" && (
          <>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {roster.map((f) => (
                <CharacterCard key={f.key} fighter={f} />
              ))}
            </div>

            <div className="mb-4">
              <Arena
                fighters={roster}
                poses={poses}
                activeEffects={activeEffects}
                camera={cameraRef.current}
                projectiles={projectileManagerRef.current.items}
                damageNumbers={damageNumbers}
                particles={livingParticles(particleSystemRef.current)}
                statusVisualsByFighter={statusVisualsByFighter}
                isWinnerByFighter={isWinnerByFighter}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {roster.map((f) => (
                <HUD key={f.key} fighter={f} isWinner={winnerKey === f.key} />
              ))}
            </div>

            <BattleLog
              log={log}
              round={round}
              thinkingName={thinkingFighter?.name || null}
              phase={phase}
              winnerName={winnerFighter?.name || null}
              fighterColors={fighterColors}
            />
          </>
        )}
      </div>
    </div>
  );
}
