import { useState, useRef, useEffect } from "react";
import { Swords, Play, Pause, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { createSession, setSessionKeys, generateCharacter as apiGenerateCharacter, battleTurn as apiBattleTurn, waitForBackend, API_BASE, ApiError, getMemory, getAuthority, setAuthority as apiSetAuthority } from "./api.js";
import { createFighter, resetFighterCombatState, computeSpawnPositions, ARENA_WIDTH, GROUND_Y } from "./lib/battleState.js";
import { resolveAction, tickStatus } from "./lib/battleEngine.js";
import { interpretAction } from "./lib/actionInterpreter.js";
import { createAnimState, queueAction, updateAnimation, applyHitReaction, triggerTransformation } from "./lib/animationController.js";
import { createProjectileManager, spawnProjectile, updateProjectiles } from "./lib/projectileManager.js";
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
const TORSO_OFFSET_Y = -80; // where projectiles launch from / aim at, relative to a fighter's feet
let dmgNumberId = 1;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function logError(tag, info) {
  // eslint-disable-next-line no-console
  console.error(`[BattleArena] ✕ ${tag}`, info);
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

  // Phase 3.95: Animation Sync Engine
  const eventBusRef = useRef(createEventBus());
  const particleSystemRef = useRef(createParticleSystem());
  const animationTimelineRef = useRef([]); // spec section 11: one recorded entry per resolved turn, replayable
  const animDebugRef = useRef(null);
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

  function handleImpact(actorAnim, targetKey, impact) {
    const targetAnim = animRef.current[targetKey];
    if (!targetAnim) return;

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
      });
      return;
    }

    if (impact.result === "hit" || impact.result === "lethal") {
      applyHitReaction(targetAnim, actorAnim.motion.x);
      pushDamageNumber(targetAnim.motion.x, targetAnim.motion.y + TORSO_OFFSET_Y, impact.damage, HIT);
    }
  }

  // ---------- The Phase 3 game loop: runs independently of the turn-based
  // backend calls, so movement stays smooth while an AI is "thinking". ----------
  useAnimationFrame((dt) => {
    if (phase === "setup" || phase === "paused") return;

    const currentRoster = stateRef.current;
    for (const f of currentRoster) {
      const anim = animRef.current[f.key];
      if (!anim) continue;
      const { impact, state } = updateAnimation(anim, dt, MOTION_BOUNDS, anim.homeX, f.alive);
      anim.state = state;
      if (impact) handleImpact(anim, impact.targetKey, impact);
    }

    updateProjectiles(projectileManagerRef.current, dt, (p) => {
      if (p.payload?.result === "hit" || p.payload?.result === "lethal") {
        const targetAnim = animRef.current[p.targetKey];
        if (targetAnim) {
          applyHitReaction(targetAnim, p.fromX);
          pushDamageNumber(p.toX, p.toY, p.payload.damage, HIT);
        }
      }
    });

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

      setThinkingKey(attacker.key);
      let action = null;
      let reality = null;
      let narration = null;
      let verdict = null;
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
        action = { action: "Attack", ability_name: "Basic Strike", thought: `(connection issue: ${e.message || "unknown error"})`, description: "", energy_cost: 10 };
      }
      setThinkingKey(null);

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
          ? { x: anim.motion.x, y: anim.motion.y, facing: anim.motion.facing, state: anim.state, attackPhase: anim.attackPhase, flashing: anim.flashTimer > 0 }
          : { x: f.position.x, y: f.position.y, facing: 1, state: "idle", attackPhase: null, flashing: false },
      ];
    })
  );
  const statusVisualsByFighter = Object.fromEntries(roster.map((f) => [f.key, activeStatusVisuals(f.status)]));

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
