import { useState, useRef, useEffect } from "react";
import { Swords, Zap, Heart, Play, Pause, RotateCcw, Skull, Trophy, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { createSession, setSessionKeys, generateCharacter as apiGenerateCharacter, battleTurn as apiBattleTurn, waitForBackend, API_BASE, ApiError } from "./api.js";

const INK = "#EDEAE3";
const VOID = "#0A0C0F";
const PANEL = "#12151A";
const LINE = "#23282f";
const DIM = "#7C8590";
const FIGHTER_COLORS = { A: "#7C6BFF", B: "#FF7A45" };
const HIT = "#E4443B";
const OK = "#3ECF8E";
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

// ---------- BATTLE ENGINE (deterministic, client-side, unchanged by the backend migration) ----------
function resolveAction(round, attacker, defender, action) {
  const entry = {
    round,
    actorKey: attacker.key,
    actorName: attacker.name,
    thought: action?.thought || "",
    action: action?.action || "Attack",
    ability_name: action?.ability_name || "Strike",
    description: action?.description || "",
    result: "hit",
    damage: 0,
    engineNote: "",
  };

  const round_available = attacker.cooldowns[entry.ability_name] || 0;
  if (round_available > round) {
    entry.result = "on_cooldown";
    entry.engineNote = `${entry.ability_name} is still on cooldown (ready round ${round_available}). Engine substitutes a basic strike.`;
    entry.ability_name = "Basic Strike";
  }

  let cost = Math.max(0, Math.min(Number(action?.energy_cost) || 12, 40));
  if (cost > attacker.energy) {
    entry.engineNote += ` Insufficient energy for full technique — engine caps output.`;
    cost = attacker.energy;
  }
  attacker.energy = Math.max(0, attacker.energy - cost);
  attacker.cooldowns[entry.ability_name] = round + 2;

  if (entry.action === "Defend") {
    attacker.status.push({ type: "guarding", rounds: 1 });
    entry.result = "defend";
    return entry;
  }

  const dodgeChance = 0.16 + (defender.status.some((s) => s.type === "slowed") ? -0.08 : 0);
  if (Math.random() < dodgeChance) {
    entry.result = "miss";
    return entry;
  }

  let dmg = Math.round(6 + cost * 0.85 + Math.random() * 9);
  if (defender.status.some((s) => s.type === "guarding")) dmg = Math.round(dmg * 0.35);
  if (entry.action === "Special") dmg = Math.round(dmg * 1.15);

  defender.hp = Math.max(0, defender.hp - dmg);
  entry.damage = dmg;
  entry.result = defender.hp === 0 ? "lethal" : "hit";
  return entry;
}

function tickStatus(fighter) {
  fighter.status = fighter.status
    .map((s) => ({ ...s, rounds: s.rounds - 1 }))
    .filter((s) => s.rounds > 0);
  fighter.energy = Math.min(100, fighter.energy + 12);
}

// ---------- UI PRIMITIVES ----------
function Bar({ value, max = 100, color, icon }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: LINE }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(0, (value / max) * 100)}%`, background: color }}
        />
      </div>
      <span className="text-xs w-8 text-right tabular-nums" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
        {value}
      </span>
    </div>
  );
}

function FighterSetup({ fighter, onChange, disabled, colorKey }) {
  const p = PROVIDERS.find((x) => x.id === fighter.provider);
  return (
    <div className="rounded-lg p-4 space-y-3" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: FIGHTER_COLORS[colorKey] }} />
        <span className="text-xs uppercase tracking-widest" style={{ color: FIGHTER_COLORS[colorKey], fontFamily: "'IBM Plex Mono', monospace" }}>
          Fighter {colorKey}
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

const initialFighter = (key) => ({
  key,
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: "",
  customPrompt: "",
  name: key === "A" ? "Fighter A" : "Fighter B",
  color: FIGHTER_COLORS[key],
  appearance: "",
  combat_style: "",
  personality: "",
  introduction: "",
  hp: 100,
  energy: 100,
  status: [],
  cooldowns: {},
});

export default function App() {
  const [fighterA, setFighterA] = useState(initialFighter("A"));
  const [fighterB, setFighterB] = useState(initialFighter("B"));
  const [phase, setPhase] = useState("setup"); // setup | generating | battle | paused | finished
  const [log, setLog] = useState([]);
  const [round, setRound] = useState(1);
  const [errorMsg, setErrorMsg] = useState("");
  const [winner, setWinner] = useState(null);
  const [thinking, setThinking] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [backendOk, setBackendOk] = useState(null); // null = checking, true/false once known
  const [wakeAttempt, setWakeAttempt] = useState(0);

  const runRef = useRef({ stop: false, pause: false });
  const stateRef = useRef({ a: fighterA, b: fighterB });
  const logEndRef = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);

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
    if (key === "A") setFighterA(val); else setFighterB(val);
  }

  async function generateCharacter(sid, fighter, key) {
    const character = await apiGenerateCharacter(sid, key, fighter.customPrompt);
    return {
      ...fighter,
      name: character.name || fighter.name,
      color: character.color || fighter.color,
      appearance: character.appearance || "",
      combat_style: character.combat_style || "",
      personality: character.personality || "",
      introduction: character.introduction || "",
      hp: 100,
      energy: 100,
      status: [],
      cooldowns: {},
    };
  }

  async function startBattle() {
    if (!sessionId) {
      setErrorMsg(backendOk === false ? "Backend is unreachable — can't start a battle." : "Still connecting to the backend — try again in a moment.");
      return;
    }
    if (!fighterA.apiKey || !fighterB.apiKey) {
      setErrorMsg("Both fighters need an API key before the battle can start.");
      return;
    }
    setErrorMsg("");
    setLog([]);
    setRound(1);
    setWinner(null);
    setPhase("generating");

    try {
      await setSessionKeys(sessionId, fighterA, fighterB);
    } catch (e) {
      logError("setSessionKeys", e);
      setErrorMsg(e.message);
      setPhase("setup");
      return;
    }

    const [resA, resB] = await Promise.allSettled([
      generateCharacter(sessionId, fighterA, "A"),
      generateCharacter(sessionId, fighterB, "B"),
    ]);

    if (resA.status === "rejected") logError("startBattle:fighterA", resA.reason);
    if (resB.status === "rejected") logError("startBattle:fighterB", resB.reason);

    if (resA.status === "rejected" || resB.status === "rejected") {
      const lines = [];
      if (resA.status === "rejected") lines.push(`Fighter A — ${resA.reason?.message || String(resA.reason)}`);
      if (resB.status === "rejected") lines.push(`Fighter B — ${resB.reason?.message || String(resB.reason)}`);
      setErrorMsg(lines.join("  |  "));
      setPhase("setup");
      return;
    }

    const a = resA.value;
    const b = resB.value;
    setFighterA(a);
    setFighterB(b);
    stateRef.current = { a: { ...a }, b: { ...b } };
    setLog([
      { system: true, text: `${a.name} enters the arena — "${a.introduction}"` },
      { system: true, text: `${b.name} enters the arena — "${b.introduction}"` },
    ]);
    runRef.current = { stop: false, pause: false };
    setPhase("battle");
    runLoop();
  }

  async function runLoop() {
    let turn = 0; // 0 = A's turn, 1 = B's turn
    let r = 1;
    while (!runRef.current.stop) {
      while (runRef.current.pause && !runRef.current.stop) {
        await sleep(250);
      }
      if (runRef.current.stop) break;

      const st = stateRef.current;
      const attacker = turn === 0 ? st.a : st.b;
      const defender = turn === 0 ? st.b : st.a;

      setThinking(attacker.name);
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
          { name: attacker.name, hp: attacker.hp, energy: attacker.energy, status: attacker.status.map((s) => s.type), combat_style: attacker.combat_style, personality: attacker.personality },
          { name: defender.name, hp: defender.hp, energy: defender.energy, status: defender.status.map((s) => s.type) },
          recent || "Battle just began.",
          attacker.customPrompt
        );
      } catch (e) {
        logError("runLoop:turn", { round: r, actor: attacker.name, message: e.message, envelope: e instanceof ApiError ? e.envelope : null });
        action = { action: "Attack", ability_name: "Basic Strike", thought: `(connection issue: ${e.message || "unknown error"})`, description: "", energy_cost: 10 };
      }
      setThinking(null);

      const entry = resolveAction(r, attacker, defender, action);
      tickStatus(attacker);
      stateRef.current = { ...stateRef.current };
      setFighterA({ ...stateRef.current.a });
      setFighterB({ ...stateRef.current.b });
      setLog((prev) => [...prev, entry]);

      if (defender.hp <= 0) {
        setWinner(attacker.key);
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
    setWinner(null);
    setFighterA((f) => ({ ...initialFighter("A"), provider: f.provider, model: f.model, apiKey: f.apiKey, customPrompt: f.customPrompt }));
    setFighterB((f) => ({ ...initialFighter("B"), provider: f.provider, model: f.model, apiKey: f.apiKey, customPrompt: f.customPrompt }));
  }

  const setupLocked = phase !== "setup";

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
            <FighterSetup fighter={fighterA} onChange={(v) => updateFighter("A", v)} disabled={setupLocked} colorKey="A" />
            <FighterSetup fighter={fighterB} onChange={(v) => updateFighter("B", v)} disabled={setupLocked} colorKey="B" />
          </div>
        )}

        {phase !== "setup" && (
          <>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {[fighterA, fighterB].map((f) => (
                <div key={f.key} className="rounded-lg p-4 space-y-2" style={{ background: PANEL, border: `1px solid ${f.hp === 0 ? HIT : LINE}` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: FIGHTER_COLORS[f.key] }} />
                      <span className="font-semibold text-sm">{f.name}</span>
                      {f.hp === 0 && <Skull size={14} style={{ color: HIT }} />}
                      {winner === f.key && <Trophy size={14} style={{ color: GOLD }} />}
                    </div>
                    <span className="text-xs" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>{f.combat_style}</span>
                  </div>
                  <Bar value={f.hp} color={f.hp > 30 ? OK : HIT} icon={<Heart size={13} style={{ color: DIM }} />} />
                  <Bar value={f.energy} color={FIGHTER_COLORS[f.key]} icon={<Zap size={13} style={{ color: DIM }} />} />
                  <div className="flex items-center gap-1.5 flex-wrap min-h-[18px]">
                    {f.status.length === 0 ? (
                      <span className="text-xs" style={{ color: LINE }}>—</span>
                    ) : (
                      f.status.map((s, i) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: VOID, color: DIM, border: `1px solid ${LINE}`, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {s.type}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs uppercase tracking-widest" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
                Round {round}
              </span>
              {thinking && (
                <span className="text-xs flex items-center gap-1.5" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
                  <Loader2 size={12} className="animate-spin" /> {thinking} is deciding…
                </span>
              )}
              {phase === "finished" && winner && (
                <span className="text-xs flex items-center gap-1.5" style={{ color: GOLD, fontFamily: "'IBM Plex Mono', monospace" }}>
                  <Trophy size={12} /> {winner === "A" ? fighterA.name : fighterB.name} wins
                </span>
              )}
            </div>

            <div className="rounded-lg p-4 mb-4 max-h-[420px] overflow-y-auto space-y-3" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
              {log.map((l, i) =>
                l.system ? (
                  <div key={i} className="text-xs italic" style={{ color: DIM }}>{l.text}</div>
                ) : (
                  <div key={i} className="pb-3" style={{ borderBottom: i < log.length - 1 ? `1px solid ${LINE}` : "none" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold" style={{ color: FIGHTER_COLORS[l.actorKey] }}>{l.actorName}</span>
                      <span className="text-xs" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>R{l.round} · {l.ability_name}</span>
                    </div>
                    {l.thought && <p className="text-xs italic mb-1" style={{ color: DIM }}>"{l.thought}"</p>}
                    {l.description && <p className="text-sm mb-1.5">{l.description}</p>}
                    <div className="flex items-center gap-2 text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      <ShieldCheck size={12} style={{ color: DIM }} />
                      <span style={{ color: DIM }}>ENGINE VERDICT:</span>
                      <span style={{
                        color: l.result === "hit" || l.result === "lethal" ? HIT : l.result === "miss" ? DIM : l.result === "defend" ? OK : GOLD,
                        fontWeight: 600,
                      }}>
                        {l.result === "hit" ? `HIT — ${l.damage} dmg` :
                         l.result === "lethal" ? `LETHAL — ${l.damage} dmg` :
                         l.result === "miss" ? "MISS" :
                         l.result === "defend" ? "GUARD RAISED" :
                         l.result === "on_cooldown" ? "COOLDOWN — SUBSTITUTED" : l.result}
                      </span>
                    </div>
                    {l.engineNote && <p className="text-xs mt-1" style={{ color: GOLD }}>{l.engineNote}</p>}
                  </div>
                )
              )}
              <div ref={logEndRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
