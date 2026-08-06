import { useState, useRef, useEffect } from "react";
import { Swords, Play, Pause, RotateCcw, AlertTriangle, Loader2, ChevronLeft, ChevronRight, Circle, Square } from "lucide-react";
import { createSession, setSessionKeys, generateCharacter as apiGenerateCharacter, battleTurn as apiBattleTurn, waitForBackend, API_BASE, ApiError, getMemory, getAuthority, setAuthority as apiSetAuthority } from "./api.js";
import { createFighter, resetFighterCombatState, computeSpawnPositions, ARENA_WIDTH, GROUND_Y } from "./lib/battleState.js";
import { generatePhysicsProfile, shouldRegeneratePhysicsProfile } from "./lib/physicsProfile.js";
import { validateSimulationAction } from "./lib/simulationCore.js";
import { calculateImpact, getFallAnimation, getHitJuice } from "./lib/impactSystem.js";
import { resolveAllOverlaps } from "./lib/collisionSystem.js";
import { setAnimPhysicsProfile } from "./lib/animationController.js";

// M1 Helper
function ensurePhysicsProfile(fighter, combatProfile, character){ try{ const cp=combatProfile||fighter.combatProfile||{combatTier:"Peak Human",strength:4,durability:4,speed:4,mobility:4,combatSkill:4,flight:false}; const ch=character||fighter.character||{name:fighter.name}; const p=generatePhysicsProfile(cp,ch); fighter.physicsProfile=p; return p;}catch(e){ const fb=generatePhysicsProfile({combatTier:"Peak Human",strength:4,durability:4,speed:4,mobility:4,combatSkill:4},{name:fighter.name}); fighter.physicsProfile=fb; return fb; } }
import { resolveAction, tickStatus } from "./lib/battleEngine.js";
import { interpretAction } from "./lib/actionInterpreter.js";
import { createAnimState, queueAction, updateAnimation, applyHitReaction, triggerKnockdown, triggerTransformation, registerTurnOutcome, hitStaggerDegrees } from "./lib/animationController.js";
import { PHYSICS_TIERS } from "./lib/powerCatalog.js";
import { createFightRecorder, downloadBlob, recordingFilename, extensionForMimeType } from "./lib/fightRecorder.js";
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
  temporal: { ring: "galaxy", spark: "stars", color: "#B8CCFF" },
};
const TORSO_OFFSET_Y = -80; // where projectiles AIM at (the target's center of mass), relative to a fighter's feet
// Where a ranged attack visually LAUNCHES FROM, relative to a fighter's
// feet — worked out from characterAnimation.js's RIG proportions (HIP_Y
// -55, CHEST_LEN 29, NECK_LEN 13, HEAD_R+HEAD_GAP 17 => head-center ≈
// -114; a raised ~horizontal casting arm keeps the hand at ~shoulder/
// chest height, ≈ -84, same as TORSO_OFFSET_Y). Heat-vision/laser always
// fires from the face — everything else (energy blast, fireball, orb,
// arrow, etc.) launches from the extended, forward-reaching hand.
const FACE_OFFSET_Y = -114;
const HAND_CAST_OFFSET_Y = -84;
const HAND_FORWARD_REACH = 46; // how far forward of the root the casting hand sits at full extension
function projectileOrigin(anim, variant) {
  const facing = anim.motion.facing >= 0 ? 1 : -1;
  if (variant === "laser") {
    return { x: anim.motion.x + facing * 10, y: anim.motion.y + FACE_OFFSET_Y };
  }
  return { x: anim.motion.x + facing * HAND_FORWARD_REACH, y: anim.motion.y + HAND_CAST_OFFSET_Y };
}
// How long (ms) to hold the battle-log text back after a turn resolves,
// so it appears in sync with the strike actually landing instead of the
// instant it's computed. ~260ms = windup (160ms) + strike (120ms) *
// ~0.85 impact fraction — the same timing handleImpact's own hit
// registration already uses (see MELEE_IMPACT_FRACTION /
// DEFAULT_IMPACT_FRACTION in animationController.js), so the text and the
// character's own flinch land at roughly the same moment.
const LOG_SYNC_DELAY_MS = 260;
// Replaces a flat 900ms pause between every turn. Kept short and purely
// cosmetic (a beat for the viewer to register "that attack ended, a new
// one is starting") rather than a wait for anything — the actual AI
// fetch for the next turn is kicked off while THIS turn's animation is
// still playing (see runLoop's `pending` pre-fetch), not during this
// delay, so this number is no longer what determines how long the fight
// pauses between exchanges.
const TURN_PACING_MS = 150;
const TIME_STOP_DURATION = 1.1; // seconds a "timeStop"-special power (powerCatalog.js) freezes its target for
// Damage-tiered hit reaction. Independent of (and multiplies with)
// PHYSICS_TIERS from powerCatalog.js — that's about an ABILITY's inherent
// weight (a boulder smash should hit harder than a dart at the same
// number), this is about the raw damage NUMBER scaling the reaction, in
// discrete brackets rather than one continuous curve, per spec: below 5
// stays exactly as before (see applyHitReaction/hitStaggerDegrees, both
// unchanged), each bracket above adds more knockback/camera, and 20+ starts
// an actual knockdown (triggerKnockdown) instead of the brief flinch-and-
// slide (applyHitReaction) every tier below it still uses.
const IMPACT_TIERS = [
  { max: 5, mult: 0.45, camera: null, falls: false },
  { max: 10, mult: 0.75, camera: null, falls: false },
  { max: 20, mult: 1.05, camera: "small-shake", falls: false },
  { max: 30, mult: 1.5, camera: "medium-shake", falls: true },
  { max: 40, mult: 1.9, camera: "medium-shake", falls: true },
  { max: 60, mult: 2.4, camera: "large-shake", falls: true },
  { max: 80, mult: 2.9, camera: "large-shake", falls: true },
  { max: Infinity, mult: 3.4, camera: "large-shake", falls: true },
];
function impactTierFor(damage) {
  return IMPACT_TIERS.find((t) => damage < t.max) || IMPACT_TIERS[IMPACT_TIERS.length - 1];
}
const TIME_SLOW_DURATION = 0.9; // seconds a "timeSlow"-special power runs the whole game loop at reduced speed
const TIME_SLOW_FACTOR = 0.32; // how much dt is scaled by during a time-slow window — not a full freeze (that's hitstop's job), a real slow-motion playback
const FRAME_HISTORY_MAX = 600; // ~10s at 60fps — how far back the frame-scrub buffer (frameHistoryRef) reaches
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
  // Frame-by-frame scrub: null = live rendering (normal), a number = showing
  // frameHistoryRef.current[scrubIndex] instead — see the tick loop below
  // for recording and the Arena props further down for how this substitutes
  // for live state.
  const [scrubIndex, setScrubIndex] = useState(null);
  // Fight recording — arenaContainerRef wraps the Arena's rendered <svg> so
  // fightRecorder.js can grab it without Arena.jsx needing to change at
  // all (a plain DOM query on a ref, not a forwarded ref through the
  // component). recordingRef holds the live recorder instance (start/stop/
  // isRunning — see fightRecorder.js); recordingInfo is only ever the
  // *last completed* recording, for the persistent download link.
  const arenaContainerRef = useRef(null);
  const recordingRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingInfo, setRecordingInfo] = useState(null); // { url, filename } | null
  const [recordingError, setRecordingError] = useState("");

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
  // Seconds remaining of a "timeSlow"-special power's slow-motion window
  // (powerCatalog.js) — unlike hitstop (a full pause), this scales dt down
  // for the whole tick rather than stopping it, a real slow-motion
  // playback rather than a freeze-frame.
  const timeSlowRef = useRef(0);

  // Phase 3.95: Animation Sync Engine
  const eventBusRef = useRef(createEventBus());
  const particleSystemRef = useRef(createParticleSystem());
  const animationTimelineRef = useRef([]); // spec section 11: one recorded entry per resolved turn, replayable
  const animDebugRef = useRef(null);
  const audioCuesRef = useRef([]); // Phase 4D, spec section 17: rolling log of fired sound-cue names (no audio assets — this is the event layer itself)
  const [animDebugOpen, setAnimDebugOpen] = useState(false);
  // Frame-by-frame scrub history — much finer-grained than
  // animationTimelineRef above (one entry per resolved TURN); this is one
  // lightweight snapshot per rendered FRAME, capped to the last
  // FRAME_HISTORY_SECONDS of real gameplay. Every field captured here is
  // copied out as plain primitives (never a reference to anim.motion,
  // anim.attackPhase, or a projectile object) because those are mutated in
  // place every frame elsewhere in this file — storing a reference would
  // make every historical snapshot silently show today's, i.e. the most
  // recent, state instead of its own.
  const frameHistoryRef = useRef([]);
  // Mirrors `log`'s content, but as a ref instead of state — updated
  // synchronously the instant each turn resolves. runLoop is a long-lived
  // async function (started once from startBattle, runs for the whole
  // fight) — a plain closure over the `log` state variable would freeze at
  // whatever `log` was at that single moment (the intro messages, before
  // any turns exist) for the entire battle, since React state updates
  // produce new values for FUTURE renders, not for an already-captured
  // closure. That's what recentTurns (below) reads from now instead of
  // `log` directly, and it's also what makes it safe to pre-fetch the next
  // turn's AI decision before the current turn's own (deferred) setLog
  // call has caught the visible log up yet.
  const logRef = useRef([]);

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
      const originA = projectileOrigin(actorAnim, impact.projectileVariant);
      const originB = projectileOrigin(targetAnim, impact.counterVariant);
      spawnBeamClashPair(projectileManagerRef.current, {
        variantA: impact.projectileVariant, fromAX: originA.x, fromAY: originA.y, toAX: targetAnim.motion.x, toAY: targetAnim.motion.y + TORSO_OFFSET_Y,
        ownerAKey: actorAnim.key, targetAKey: targetKey, payloadA: { damage: impact.damage, result: impact.result }, colorA: impact.power?.color, glowColorA: impact.power?.glow,
        variantB: impact.counterVariant, fromBX: originB.x, fromBY: originB.y, toBX: actorAnim.motion.x, toBY: actorAnim.motion.y + TORSO_OFFSET_Y,
        ownerBKey: targetKey, targetBKey: actorAnim.key, payloadB: { damage: impact.counterDamage, result: "hit" },
        onClash: (cx, cy) => {
          triggerCameraEvent(cameraRef.current, "beam-clash");
          triggerCameraEvent(cameraRef.current, "motion-blur", { intensity: 0.8 });
          emitParticles(particleSystemRef.current, "energy", cx, cy, { intensity: "high" });
          emitParticles(particleSystemRef.current, "explosion_ring", cx, cy, { intensity: "medium" });
          hitstopRef.current = Math.max(hitstopRef.current, 0.18);
        },
      });
      return;
    }
    if (impact.spawnProjectile) {
      const origin = projectileOrigin(actorAnim, impact.projectileVariant);
      spawnProjectile(projectileManagerRef.current, {
        variant: impact.projectileVariant, fromX: origin.x, fromY: origin.y, toX: targetAnim.motion.x, toY: targetAnim.motion.y + TORSO_OFFSET_Y,
        ownerKey: actorAnim.key, targetKey, payload: { damage: impact.damage, result: impact.result, power: impact.power }, bounds: MOTION_BOUNDS, color: impact.power?.color, glowColor: impact.power?.glow,
      });
      if (impact.power?.special === "timeSlow") { timeSlowRef.current = TIME_SLOW_DURATION; triggerCameraEvent(cameraRef.current, "impact-flash", { intensity: 0.3 }); }
      return;
    }
    if (impact.result === "hit" || impact.result === "lethal" || impact.result === "counter") {
      const isDown = targetAnim.knockdownPhase === "down" || targetAnim.isSliding;
      const physImpact = calculateImpact({
        attackerPos: { x: actorAnim.motion.x, y: actorAnim.motion.y },
        defenderPos: { x: targetAnim.motion.x, y: targetAnim.motion.y },
        attackerMotion: actorAnim.motion, defenderMotion: targetAnim.motion,
        attackerProfile: actorAnim.physicsProfile || { mass:75,density:1,weightClass:'Medium',derivedFrom:{strength:4},weightDef:{},collisionBehaviour:{},flightPhysics:{} },
        defenderProfile: targetAnim.physicsProfile || { mass:75,density:1,weightClass:'Medium',knockbackResistance:75,weightDef:{},collisionBehaviour:{groundFriction:0.6},flightPhysics:{} },
        damage: impact.damage, attackSpeed: impact.power?.tier==='massive'?420:300, isDown,
      });
      const powerTier = PHYSICS_TIERS[impact.power?.tier] || PHYSICS_TIERS.medium;
      const dmgTier = impactTierFor(impact.damage);
      if (isDown) {
        applyHitReaction(targetAnim, impact.damage, actorAnim, impact);
      } else if (dmgTier.falls || impact.damage > 18) {
        triggerKnockdown(targetAnim, impact.damage, actorAnim, impact);
        targetAnim.fallDirection = physImpact.fallDirection;
      } else {
        applyHitReaction(targetAnim, impact.damage, actorAnim, impact);
      }
      hitstopRef.current = Math.max(hitstopRef.current, (physImpact.hitstop||60)/1000);
      triggerHitstop(impact.damage, impact.result==="lethal", physImpact);
      if (physImpact.cameraShake) triggerCameraEvent(cameraRef.current, physImpact.cameraShake, { intensity: physImpact.shakeIntensity });
      else if (dmgTier.camera) triggerCameraEvent(cameraRef.current, dmgTier.camera);
      if (actorAnim.motion && physImpact.impactForce>50) {
        const recoilDir = -Math.sign(physImpact.impactDir.x);
        actorAnim.motion.vx += recoilDir * Math.min(80, physImpact.impactForce*0.08);
      }
      pushDamageNumber(targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, impact.damage, HIT);
      triggerImpactFrame(targetAnim.motion.x, impact.damage, impact.result==="lethal", powerTier.impact * (physImpact.impactForce/200));
      if (impact.power) emitParticles(particleSystemRef.current, impact.power.particle, targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, { intensity: impact.power.tier==="massive"||impact.power.tier==="heavy"?"high":"medium", color: impact.power.color });
      if (physImpact.debrisCount>0) {
        emitParticles(particleSystemRef.current, "debris", targetAnim.motion.x, targetAnim.motion.groundY, { count: physImpact.debrisCount });
        emitParticles(particleSystemRef.current, "dust", targetAnim.motion.x, targetAnim.motion.groundY, { intensity: physImpact.dustAmount>0.5?"high":"low" });
      }
      if (physImpact.crackIntensity>0.5) emitParticles(particleSystemRef.current, "rock_fragment", targetAnim.motion.x, targetAnim.motion.groundY, { count: 2 });
      if (impact.power?.special==="timeStop") {
        targetAnim.timeFrozenTimer = TIME_STOP_DURATION;
        triggerCameraEvent(cameraRef.current, "camera-snap");
        emitParticles(particleSystemRef.current, "magic_circle", targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, { intensity:"high" });
      }
      const allAnimsList = Object.values(animRef.current).filter(Boolean);
      if (allAnimsList.length>1) {
        const fightersForSep = allAnimsList.map(a=>({ x:a.motion.x, y:a.motion.y, motion:a.motion, physicsProfile:a.physicsProfile }));
        resolveAllOverlaps(fightersForSep, 52);
        allAnimsList.forEach((a,i)=>{ a.motion.x = fightersForSep[i].x; });
      }
      return;
    }
    if (impact.result==="miss") pushDamageNumber(targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, "MISS", DIM);
  }
function triggerHitstop(damage, isLethal, physImpact) {
    const base = isLethal?0.14:Math.min(0.12,Math.max(0.03,(damage||0)*0.004));
    const extra = physImpact ? (physImpact.hitstop||0)/1000*0.5 : 0;
    hitstopRef.current = Math.max(hitstopRef.current, base+extra);
  }
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
      const originA = projectileOrigin(actorAnim, impact.projectileVariant);
      const originB = projectileOrigin(targetAnim, impact.counterVariant);
      spawnBeamClashPair(projectileManagerRef.current, {
        variantA: impact.projectileVariant,
        fromAX: originA.x, fromAY: originA.y,
        toAX: targetAnim.motion.x, toAY: targetAnim.motion.y + TORSO_OFFSET_Y,
        ownerAKey: actorAnim.key, targetAKey: targetKey,
        payloadA: { damage: impact.damage, result: impact.result },
        colorA: impact.power?.color, glowColorA: impact.power?.glow,
        variantB: impact.counterVariant,
        fromBX: originB.x, fromBY: originB.y,
        toBX: actorAnim.motion.x, toBY: actorAnim.motion.y + TORSO_OFFSET_Y,
        ownerBKey: targetKey, targetBKey: actorAnim.key,
        payloadB: { damage: impact.counterDamage, result: "hit" },
        onClash: (cx, cy) => {
          triggerCameraEvent(cameraRef.current, "beam-clash");
          triggerCameraEvent(cameraRef.current, "motion-blur", { intensity: 0.8 });
          emitParticles(particleSystemRef.current, "energy", cx, cy, { intensity: "high" });
          emitParticles(particleSystemRef.current, "explosion_ring", cx, cy, { intensity: "medium" });
          hitstopRef.current = Math.max(hitstopRef.current, 0.12);
        },
      });
      return;
    }

    if (impact.spawnProjectile) {
      const origin = projectileOrigin(actorAnim, impact.projectileVariant);
      spawnProjectile(projectileManagerRef.current, {
        variant: impact.projectileVariant,
        fromX: origin.x,
        fromY: origin.y,
        toX: targetAnim.motion.x,
        toY: targetAnim.motion.y + TORSO_OFFSET_Y,
        ownerKey: actorAnim.key,
        targetKey,
        payload: { damage: impact.damage, result: impact.result, power: impact.power },
        bounds: MOTION_BOUNDS,
        color: impact.power?.color,
        glowColor: impact.power?.glow,
      });
      // "timeSlow"-special powers (powerCatalog.js) start their slow-motion
      // window the moment the ability is cast, not when it lands — time
      // visibly bending is the point, and it also means the projectile's
      // own flight plays out in slow motion, which reads well together.
      if (impact.power?.special === "timeSlow") {
        timeSlowRef.current = TIME_SLOW_DURATION;
        triggerCameraEvent(cameraRef.current, "impact-flash", { intensity: 0.3 });
      }
      return;
    }

    if (impact.result === "hit" || impact.result === "lethal") {
      const powerTier = PHYSICS_TIERS[impact.power?.tier] || PHYSICS_TIERS.medium;
      const dmgTier = impactTierFor(impact.damage);
      const combinedKnockback = dmgTier.mult * powerTier.knockback;
      if (dmgTier.falls) {
        triggerKnockdown(targetAnim, actorAnim.motion.x, impact.damage, combinedKnockback);
      } else {
        applyHitReaction(targetAnim, actorAnim.motion.x, impact.damage, combinedKnockback);
      }
      if (dmgTier.camera) triggerCameraEvent(cameraRef.current, dmgTier.camera);
      triggerHitstop(impact.damage, impact.result === "lethal");
      pushDamageNumber(targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, impact.damage, HIT);
      triggerImpactFrame(targetAnim.motion.x, impact.damage, impact.result === "lethal", powerTier.impact);
      // Melee hits never had a colored particle burst before — every
      // catalog-matched power now gets one at the point of contact (torso
      // height, matching the damage-number spawn point), tinted by its
      // element instead of the same generic flash for every punch/kick.
      if (impact.power) {
        emitParticles(particleSystemRef.current, impact.power.particle, targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, { intensity: impact.power.tier === "massive" || impact.power.tier === "heavy" ? "high" : "medium", color: impact.power.color });
      }
      // "timeStop"-special powers (powerCatalog.js) freeze the DEFENDER —
      // see the dt=0 handling in the tick loop below for how the freeze
      // itself works. This just starts the timer and plays the "everything
      // just stopped" beat: a snap-flash + a burst reading as a shattered/
      // stopped clock.
      if (impact.power?.special === "timeStop") {
        targetAnim.timeFrozenTimer = TIME_STOP_DURATION;
        triggerCameraEvent(cameraRef.current, "camera-snap");
        emitParticles(particleSystemRef.current, "magic_circle", targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, { intensity: "high", color: "#EAF6FF" });
        emitParticles(particleSystemRef.current, "stars", targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, { intensity: "high", color: "#EAF6FF" });
      }
    }
  }

  // Full "impact frame" treatment — flash + a directed camera punch toward
  // the hit + a quick motion-blur streak — reserved for genuinely heavy/
  // critical/lethal hits (damage >= 15, or any lethal blow) so it reads as
  // a meaningful beat rather than noise on every routine poke. Shared by
  // both the direct-hit path above and the projectile-arrival path below.
  // tierMultiplier (from powerCatalog.js's PHYSICS_TIERS) leans a matched
  // power's own weight on top of the damage-driven scaling that already
  // exists — a "massive"-tier boulder smash punches harder than a "light"
  // dart landing the same numeric damage.
  function triggerImpactFrame(atX, damage, lethal, tierMultiplier = 1) {
    if (damage < 15 && !lethal) return;
    const strength = (Math.min(1, damage / 40) + (lethal ? 0.3 : 0)) * tierMultiplier;
    triggerCameraEvent(cameraRef.current, "impact-flash", { intensity: 0.35 + strength * 0.45 });
    triggerCameraEvent(cameraRef.current, "impact-zoom", { x: atX, intensity: 0.04 + strength * 0.09 });
    triggerCameraEvent(cameraRef.current, "motion-blur", { intensity: 0.5 + strength * 0.5 });
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

    // "timeSlow"-special powers (powerCatalog.js) run a real slow-motion
    // window instead of a full pause — dt is scaled down for the rest of
    // this tick (motion, particles, camera, every timer below all run off
    // this same dt), decaying back to normal playback speed as the timer
    // runs out. Deliberately after the hitstop check above: a full pause
    // always wins if both happen to be active at once.
    if (timeSlowRef.current > 0) {
      timeSlowRef.current = Math.max(0, timeSlowRef.current - dt);
      dt *= TIME_SLOW_FACTOR;
    }

    const currentRoster = stateRef.current;
    const newFrameCues = [];
    for (const f of currentRoster) {
      const anim = animRef.current[f.key];
      if (!anim) continue;

      // "timeStop"-special powers (powerCatalog.js) freeze a fighter for a
      // duration — true freeze via dt=0 through the normal updateAnimation
      // call below (motion doesn't move since velocity*0=0, every timer
      // holds since nothing decrements by dt), not a special internal
      // branch inside updateAnimation itself.
      if (anim.timeFrozenTimer > 0) anim.timeFrozenTimer = Math.max(0, anim.timeFrozenTimer - dt);
      const frozen = anim.timeFrozenTimer > 0;

      // Face the opponent whenever genuinely at rest — no active motion
      // command and not mid-attack (an attack manages its own facing via
      // the dash/approach direction toward the opponent). Without this, a
      // fighter's facing was simply whatever it last was from their last
      // movement command — easy to end up "facing away" after returning
      // home, getting knocked back, or just never having moved yet — which
      // was the actual root cause behind fighters visually facing away
      // from each other at rest, and (since every attack pose in
      // characterAnimation.js mirrors off this same facing value) strikes
      // swinging in the wrong direction entirely.
      if (!frozen && f.alive && !anim.motion.command && !anim.attackPhase) {
        const opponent = currentRoster.find((o) => o.key !== f.key);
        const opponentAnim = opponent ? animRef.current[opponent.key] : null;
        const opponentX = opponentAnim ? opponentAnim.motion.x : opponent?.position.x;
        if (opponentX !== undefined && Math.abs(opponentX - anim.motion.x) > 1) {
          anim.motion.facing = opponentX >= anim.motion.x ? 1 : -1;
        }
      }

      const { impact, state } = updateAnimation(anim, frozen ? 0 : dt, MOTION_BOUNDS, anim.homeX, f.alive);
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
          triggerCameraEvent(cameraRef.current, "motion-blur", { intensity: 0.6 });
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
        triggerCameraEvent(cameraRef.current, "motion-blur", { intensity: 0.5 });
      }
      // A knockdown that carries into the arena wall (anim.knockdownWallSlam
      // — see updateAnimation) gets its own extra impact on top of whatever
      // the original hit already triggered: bigger shake, a debris/dust
      // burst at the wall, an extra flash — the "or hits the wall boundary"
      // half of the knockdown spec, distinct from just running out of
      // knockback distance and settling normally.
      if (anim.knockdownWallSlam) {
        emitParticles(particleSystemRef.current, "debris", anim.motion.x, anim.motion.y + TORSO_OFFSET_Y, { intensity: "high" });
        emitParticles(particleSystemRef.current, "dust", anim.motion.x, anim.motion.y, { intensity: "high" });
        triggerCameraEvent(cameraRef.current, "large-shake");
        triggerCameraEvent(cameraRef.current, "impact-flash", { intensity: 0.5 });
        triggerCameraEvent(cameraRef.current, "motion-blur", { intensity: 0.4 });
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
            const powerTier = PHYSICS_TIERS[p.payload.power?.tier] || PHYSICS_TIERS.medium;
            const dmgTier = impactTierFor(p.payload.damage);
            const combinedKnockback = dmgTier.mult * powerTier.knockback;
            if (dmgTier.falls) {
              triggerKnockdown(targetAnim, p.fromX, p.payload.damage, combinedKnockback);
            } else {
              applyHitReaction(targetAnim, p.fromX, p.payload.damage, combinedKnockback);
            }
            if (dmgTier.camera) triggerCameraEvent(cameraRef.current, dmgTier.camera);
            triggerHitstop(p.payload.damage, p.payload.result === "lethal");
            pushDamageNumber(p.toX, p.toY, p.payload.damage, HIT);
            triggerImpactFrame(p.toX, p.payload.damage, p.payload.result === "lethal", powerTier.impact);
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

    // Frame-by-frame scrub recording — every field here is a copied-out
    // primitive, never a reference to anim.motion / anim.attackPhase / a
    // projectile object (all mutated in place elsewhere in this file — a
    // stored reference would make every historical snapshot silently show
    // whatever the CURRENT state is, not its own moment in time).
    frameHistoryRef.current.push({
      fighters: currentRoster.map((f) => ({ key: f.key, hp: f.hp, energy: f.energy, alive: f.alive })),
      poses: Object.fromEntries(
        currentRoster.map((f) => {
          const anim = animRef.current[f.key];
          if (!anim) return [f.key, null];
          return [
            f.key,
            {
              x: anim.motion.x, y: anim.motion.y, facing: anim.motion.facing, state: anim.state,
              attackPhase: anim.attackPhase ? { variant: anim.attackPhase.variant, phase: anim.attackPhase.phase } : null,
              flashing: anim.flashTimer > 0, hitMagnitude: anim.lastHitDamage || 0,
              teleportAlpha: anim.motion.teleportAlpha, hitStagger: hitStaggerDegrees(anim),
              speedTrail: anim.motion.speedTrail, frozen: anim.timeFrozenTimer > 0, combo: anim.comboCount || 0,
            },
          ];
        })
      ),
      projectiles: projectileManagerRef.current.items.map((p) => ({ id: p.id, variant: p.variant, x: p.x, y: p.y, fromX: p.fromX, fromY: p.fromY, toX: p.toX, toY: p.toY, duration: p.duration, elapsed: p.elapsed, color: p.color, glowColor: p.glowColor })),
      camera: { x: cameraRef.current.x, zoom: cameraRef.current.zoom },
      round,
      t: performance.now(),
    });
    if (frameHistoryRef.current.length > FRAME_HISTORY_MAX + 30) {
      frameHistoryRef.current = frameHistoryRef.current.slice(-FRAME_HISTORY_MAX);
    }

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
    logRef.current = [];
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
    // Pre-fetched decision for whichever fighter's turn is coming up next —
    // kicked off near the bottom of the loop body, while the turn that was
    // JUST resolved is still animating, so the network/AI response time
    // overlaps with that animation instead of stacking after it. `.forKey`
    // guards against ever applying a pre-fetched decision to the wrong
    // fighter (e.g. after a skip — see below, pending is only ever set for
    // the fighter whose turn is actually coming up next).
    let pending = null; // { forKey, promise } | null

    // Never rejects — resolves to {ok:true, result} or {ok:false, error} —
    // so awaiting it is always safe regardless of whether it was awaited
    // fresh or picked up from `pending` after resolving in the background.
    function fetchDecision(fighter, opponent, round) {
      const recentTurns = logRef.current.filter((l) => !l.system).slice(-10);
      return apiBattleTurn(
        sessionId,
        fighter.key,
        round,
        { name: fighter.name, hp: fighter.hp, energy: fighter.energy, status: fighter.status.map((s) => s.type), combatStyle: fighter.combatStyle, personality: fighter.personality, weapon: fighter.weapon, aura: fighter.aura },
        { name: opponent.name, hp: opponent.hp, energy: opponent.energy, status: opponent.status.map((s) => s.type) },
        recentTurns,
        fighter.customPrompt
      )
        .then((result) => ({ ok: true, result }))
        .catch((error) => ({ ok: false, error }));
    }

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
        pending = null; // never pre-fetched for a disabled fighter in the first place (see the pre-fetch guard below) — this is just defensive
        turn = 1 - turn;
        if (turn === 0) { r += 1; setRound(r); }
        await sleep(TURN_PACING_MS);
        continue;
      }

      setThinkingKey(attacker.key);
      let outcome;
      if (pending && pending.forKey === attacker.key) {
        outcome = await pending.promise; // likely already resolved — this turn's fetch has been running in the background since the previous turn's animation started
      } else {
        outcome = await fetchDecision(attacker, defender, r); // no head start available (first turn, or right after a skip) — fetch fresh, same as before pipelining existed
      }
      pending = null;
      setThinkingKey(null);

      let action = null, reality = null, narration = null, verdict = null, turnFailure = null;
      if (outcome.ok) {
        ({ action, reality, narration, verdict } = outcome.result);
      } else {
        logError("runLoop:turn", { round: r, actor: attacker.name, message: outcome.error.message, envelope: outcome.error instanceof ApiError ? outcome.error.envelope : null });
        turnFailure = classifyTurnFailure(outcome.error);
      }

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
        await sleep(TURN_PACING_MS);
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
      // Immediate, not deferred — recentTurns (in fetchDecision above) and
      // the pre-fetch kicked off below both need this turn's entry right
      // away, not whenever the visible log (setLog, in the setTimeout
      // below) catches up. See logRef's own doc comment for why a plain
      // `log` read doesn't work here at all.
      logRef.current = [...logRef.current, entry];
      lastRealityRef.current = reality;

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

      // Nothing VISIBLE (hp bars, log text, the winner banner) updates
      // until the hit actually lands. stateRef.current already updated
      // immediately above — the next turn's decision-making needs the
      // real, current hp/energy right away — but setRoster, which is what
      // the hp bars actually render from, was firing in that same instant
      // too. That's what made damage (and, worse, the "you win" transition
      // on a finishing blow) appear to land before the attacker had even
      // reached the target — the exact bug being fixed here. LOG_SYNC_DELAY_MS
      // (see its own comment above) is what times this to the actual hit.
      const defenderDied = !defender.alive;
      if (defenderDied) runRef.current.stop = true; // stop the loop for real, immediately — no further turns attempted regardless of when the UI below catches up
      setTimeout(() => {
        setRoster(stateRef.current);
        setLog((prev) => [...prev, entry, ...(narration ? [{ system: true, text: `📣 ${narration}` }] : [])]);
        setLastEntry(entry);
        if (defenderDied) {
          setWinnerKey(attacker.key);
          setPhase("finished");
        }
      }, LOG_SYNC_DELAY_MS);

      if (defenderDied) break;

      turn = 1 - turn;
      if (turn === 0) { r += 1; setRound(r); }

      // Start fetching the NEXT turn's decision now, while the animation
      // just queued above is still playing out (windup + strike + recovery
      // — several hundred ms at minimum) — by the time it's actually
      // needed, at the top of the next iteration, it's very likely already
      // resolved. stateRef.current was just reassigned above, so the
      // upcoming attacker/defender's hp/energy/status read here is already
      // final — nothing stale about starting this early. Skipped for a
      // dead or already-disabled upcoming fighter, whose turn will just
      // skip immediately anyway (see the top of the loop).
      const nextAttacker = stateRef.current[turn];
      const nextDefender = stateRef.current[1 - turn];
      const nextAttackerAnimState = animRef.current[nextAttacker.key];
      if (nextAttacker.alive && !nextAttackerAnimState?.disabled) {
        pending = { forKey: nextAttacker.key, promise: fetchDecision(nextAttacker, nextDefender, r) };
      }

      await sleep(TURN_PACING_MS);
    }
  }

  function togglePause() {
    if (phase === "battle") {
      runRef.current.pause = true;
      setPhase("paused");
      // Default to the latest recorded frame — pausing shouldn't visually
      // jump anywhere; scrubbing backward from here is opt-in via the
      // controls this unlocks (see the scrub panel further down).
      setScrubIndex(Math.max(0, frameHistoryRef.current.length - 1));
    } else if (phase === "paused") {
      runRef.current.pause = false;
      setPhase("battle");
      setScrubIndex(null); // back to live — resuming continues the actual (live) simulation, not from wherever was being reviewed
    }
  }

  const scrubMax = Math.max(0, frameHistoryRef.current.length - 1);
  function stepScrub(delta) {
    setScrubIndex((i) => {
      const base = i === null ? scrubMax : i;
      return Math.min(scrubMax, Math.max(0, base + delta));
    });
  }

  function startRecording() {
    setRecordingError("");
    const svgEl = arenaContainerRef.current?.querySelector("svg");
    const rec = createFightRecorder(svgEl, { fps: 30 });
    if (!rec) {
      setRecordingError("Recording isn't supported in this browser — MediaRecorder or an svg-capable canvas isn't available.");
      return;
    }
    recordingRef.current = rec;
    rec.start();
    setIsRecording(true);
  }

  async function stopRecording() {
    const rec = recordingRef.current;
    if (!rec) return;
    setIsRecording(false);
    const blob = await rec.stop();
    recordingRef.current = null;
    if (!blob || blob.size === 0) {
      setRecordingError("Recording produced no data — nothing to save.");
      return;
    }
    const filename = recordingFilename(roster[0]?.name, roster[1]?.name, extensionForMimeType(rec.mimeType));
    downloadBlob(blob, filename);
    setRecordingInfo((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { url: URL.createObjectURL(blob), filename };
    });
  }

  function reset() {
    runRef.current.stop = true;
    setPhase("setup");
    setLog([]);
    logRef.current = [];
    setRound(1);
    setWinnerKey(null);
    setLastEntry(null);
    setDamageNumbers([]);
    setScrubIndex(null);
    frameHistoryRef.current = [];
    if (recordingRef.current) {
      recordingRef.current.stop(); // discard — a reset mid-recording wasn't an explicit "save this" action
      recordingRef.current = null;
      setIsRecording(false);
    }
    if (recordingInfo?.url) URL.revokeObjectURL(recordingInfo.url);
    setRecordingInfo(null);
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
              teleportAlpha: anim.motion.teleportAlpha, hitStagger: hitStaggerDegrees(anim), speedTrail: anim.motion.speedTrail, frozen: anim.timeFrozenTimer > 0, knockdownTimer: anim.knockdownTimer || 0,
            }
          : { x: f.position.x, y: f.position.y, facing: 1, state: "idle", attackPhase: null, flashing: false, hitMagnitude: 0, vx: 0, vy: 0, grounded: true, mode: "idle", justHitWall: false, combo: 0, teleportAlpha: 1, hitStagger: 0, speedTrail: false, frozen: false, knockdownTimer: 0 },
      ];
    })
  );
  const statusVisualsByFighter = Object.fromEntries(roster.map((f) => [f.key, activeStatusVisuals(f.status)]));
  // Frame scrub: substitute the historical snapshot for live state when
  // actively scrubbing. Falls back to every live value above whenever not
  // scrubbing (scrubIndex null) or the index doesn't resolve (buffer
  // empty/trimmed past it) — scrubbing can never leave the arena with
  // nothing to render.
  const scrubFrame = scrubIndex !== null ? frameHistoryRef.current[scrubIndex] : null;
  const displayFighters = scrubFrame ? roster.map((f) => ({ ...f, ...(scrubFrame.fighters.find((sf) => sf.key === f.key) || {}) })) : roster;
  const displayPoses = scrubFrame ? scrubFrame.poses : poses;
  const displayCamera = scrubFrame ? { ...cameraRef.current, ...scrubFrame.camera } : cameraRef.current;
  const displayProjectiles = scrubFrame ? scrubFrame.projectiles : projectileManagerRef.current.items;
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
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
                style={{ background: isRecording ? "#3a1418" : PANEL, color: isRecording ? "#FF6B6B" : INK, border: `1px solid ${isRecording ? "#FF6B6B" : LINE}` }}
              >
                {isRecording ? <Square size={13} fill="#FF6B6B" /> : <Circle size={13} fill="#FF6B6B" color="#FF6B6B" />}
                {isRecording ? "Stop & Save" : "Record"}
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

        {recordingError && (
          <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded text-sm" style={{ background: "#2a1414", border: `1px solid ${HIT}`, color: "#ffb4ae" }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem" }}>{recordingError}</div>
          </div>
        )}
        {isRecording && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded text-sm" style={{ background: "#2a1418", border: "1px solid #FF6B6B", color: "#FF6B6B" }}>
            <Circle size={10} fill="#FF6B6B" className="animate-pulse" /> Recording the fight — hit "Stop & Save" when you're done.
          </div>
        )}
        {recordingInfo && !isRecording && (
          <div className="flex items-center justify-between gap-2 mb-4 px-3 py-2 rounded text-sm" style={{ background: PANEL, border: `1px solid ${LINE}`, color: DIM }}>
            <span>Recording saved: <span style={{ color: INK }}>{recordingInfo.filename}</span> (should have downloaded automatically)</span>
            <a href={recordingInfo.url} download={recordingInfo.filename} className="px-3 py-1 rounded text-xs font-medium shrink-0" style={{ background: GOLD, color: "#000" }}>
              Download again
            </a>
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

            <div className="mb-4" ref={arenaContainerRef}>
              <Arena
                fighters={displayFighters}
                poses={displayPoses}
                activeEffects={activeEffects}
                camera={displayCamera}
                projectiles={displayProjectiles}
                damageNumbers={scrubFrame ? [] : damageNumbers}
                particles={scrubFrame ? [] : livingParticles(particleSystemRef.current)}
                statusVisualsByFighter={statusVisualsByFighter}
                isWinnerByFighter={isWinnerByFighter}
              />
            </div>

            {phase === "paused" && (
              <div className="mb-4 rounded-lg p-4" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: INK }}>⏸ Frame Review</span>
                  <span className="text-xs" style={{ color: DIM }}>
                    {scrubFrame && frameHistoryRef.current[scrubMax] && scrubIndex !== scrubMax
                      ? `${((frameHistoryRef.current[scrubMax].t - scrubFrame.t) / 1000).toFixed(1)}s ago`
                      : "Live"}
                    {scrubFrame ? ` · Round ${scrubFrame.round}` : ""}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={scrubMax}
                  value={scrubIndex ?? scrubMax}
                  onChange={(e) => setScrubIndex(Number(e.target.value))}
                  className="w-full mb-3"
                  style={{ accentColor: GOLD }}
                />
                <div className="flex items-center justify-center gap-2">
                  <button onClick={() => stepScrub(-30)} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: "#1c2027", color: INK, border: `1px solid ${LINE}` }}>−30</button>
                  <button onClick={() => stepScrub(-1)} className="p-1.5 rounded" style={{ background: "#1c2027", color: INK, border: `1px solid ${LINE}` }} title="Previous frame"><ChevronLeft size={16} /></button>
                  <button
                    onClick={() => setScrubIndex(scrubMax)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium"
                    style={{ background: scrubIndex === scrubMax ? GOLD : "#1c2027", color: scrubIndex === scrubMax ? "#000" : INK, border: `1px solid ${LINE}` }}
                  >
                    <Play size={12} /> Live
                  </button>
                  <button onClick={() => stepScrub(1)} className="p-1.5 rounded" style={{ background: "#1c2027", color: INK, border: `1px solid ${LINE}` }} title="Next frame"><ChevronRight size={16} /></button>
                  <button onClick={() => stepScrub(30)} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: "#1c2027", color: INK, border: `1px solid ${LINE}` }}>+30</button>
                </div>
              </div>
            )}

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
