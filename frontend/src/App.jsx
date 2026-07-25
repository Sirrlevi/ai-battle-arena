import { useState, useRef, useEffect } from "react";
import { Swords, Play, Pause, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { createSession, setSessionKeys, generateCharacter as apiGenerateCharacter, battleTurn as apiBattleTurn, waitForBackend, API_BASE, ApiError } from "./api.js";
import { createFighter, resetFighterCombatState, computeSpawnPositions } from "./lib/battleState.js";
import { resolveAction, tickStatus } from "./lib/battleEngine.js";
import Arena from "./components/Arena.jsx";
import HUD from "./components/HUD.jsx";
import CharacterCard from "./components/CharacterCard.jsx";
import BattleLog from "./components/BattleLog.jsx";

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
// Phase 2 just seeds it with two fighters via the setup screen.
const ROSTER_KEYS = ["A", "B"];

function makeInitialRoster() {
  const positions = computeSpawnPositions(ROSTER_KEYS.length);
  return ROSTER_KEYS.map((key, index) =>
    createFighter({ key, index, total: ROSTER_KEYS.length, provider: "openai", model: "gpt-4o-mini", apiKey: "", customPrompt: "", position: positions[index] })
  );
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

  const runRef = useRef({ stop: false, pause: false });
  const stateRef = useRef(roster);

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
      const defender = st[1 - turn]; // two-fighter roster for Phase 2; N-fighter targeting is a Phase 3+ concern

      setThinkingKey(attacker.key);
      let action = null;
      try {
        const recent = log
          .filter((l) => !l.system)
          .slice(-4)
          .map((l) => `R${l.round} ${l.actorName} used "${l.ability_name}" (${l.action}) → ${l.result}${l.damage ? `, ${l.damage} dmg` : ""}.`)
          .join(" ");
        action = await apiBattleTurn(
          sessionId,
          attacker.key,
          r,
          { name: attacker.name, hp: attacker.hp, energy: attacker.energy, status: attacker.status.map((s) => s.type), combatStyle: attacker.combatStyle, personality: attacker.personality },
          { name: defender.name, hp: defender.hp, energy: defender.energy, status: defender.status.map((s) => s.type) },
          recent || "Battle just began.",
          attacker.customPrompt
        );
      } catch (e) {
        logError("runLoop:turn", { round: r, actor: attacker.name, message: e.message, envelope: e instanceof ApiError ? e.envelope : null });
        action = { action: "Attack", ability_name: "Basic Strike", thought: `(connection issue: ${e.message || "unknown error"})`, description: "", energy_cost: 10 };
      }
      setThinkingKey(null);

      const entry = resolveAction(r, attacker, defender, action);
      tickStatus(attacker);
      stateRef.current = st.map((f) => ({ ...f, status: [...f.status], cooldowns: { ...f.cooldowns } }));
      setRoster(stateRef.current);
      setLog((prev) => [...prev, entry]);
      setLastEntry(entry);

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
    setRoster((prev) => {
      const positions = computeSpawnPositions(prev.length);
      return prev.map((f, i) => createFighter({ key: f.key, index: i, total: prev.length, provider: f.provider, model: f.model, apiKey: f.apiKey, customPrompt: f.customPrompt, position: positions[i] }));
    });
  }

  const setupLocked = phase !== "setup";
  const thinkingFighter = thinkingKey ? fighterByKey(roster, thinkingKey) : null;
  const winnerFighter = winnerKey ? fighterByKey(roster, winnerKey) : null;
  const fighterColors = Object.fromEntries(roster.map((f) => [f.key, f.color]));
  const activeEffects = lastEntry?.effect ? { [lastEntry.actorKey]: lastEntry.effect } : {};

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
              <Arena fighters={roster} activeActorKey={thinkingKey} activeEffects={activeEffects} />
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
