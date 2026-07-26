// ---------- MEMORY VIEWER (DEBUG PANEL) ----------
// Developer/debug only. Renders whatever the backend's GET
// /api/session/:id/memory returns — it has no opinion about memory shape
// beyond "here's an object, show it readably" so it doesn't need to change
// when new memory fields are added in later phases.

import { useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";

const PANEL = "#12151A";
const LINE = "#23282f";
const DIM = "#7C8590";
const INK = "#EDEAE3";
const GOLD = "#E8B94A";

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0" style={{ borderColor: LINE }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-1.5 px-3 py-2 text-left">
        {open ? <ChevronDown size={13} style={{ color: DIM }} /> : <ChevronRight size={13} style={{ color: DIM }} />}
        <span className="text-xs uppercase tracking-wider" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>{title}</span>
      </button>
      {open && <div className="px-3 pb-3 text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace", color: INK }}>{children}</div>}
    </div>
  );
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="flex gap-2 py-0.5">
      <span style={{ color: DIM, minWidth: 120 }}>{label}</span>
      <span style={{ color: INK, wordBreak: "break-word" }}>{Array.isArray(value) ? value.join(", ") : String(value)}</span>
    </div>
  );
}

function FighterMemoryBlock({ mem }) {
  if (!mem) return <p style={{ color: DIM }}>No memory recorded yet.</p>;
  return (
    <div className="space-y-3">
      <Section title="Identity & Personality" defaultOpen>
        <Row label="Personality" value={mem.personality} />
        <Row label="Combat Style" value={mem.combatStyle} />
        <Row label="Weapon" value={mem.weapon} />
        <Row label="Aura" value={mem.aura} />
        <Row label="Current Goal" value={mem.currentGoal} />
        <Row label="Strategy Hint" value={mem.strategy?.hint} />
      </Section>
      <Section title="Self Memory">
        <Row label="HP / Energy" value={`${mem.self?.hp ?? "?"} / ${mem.self?.energy ?? "?"}`} />
        <Row label="Current Form" value={mem.self?.currentForm} />
        <Row label="Movement State" value={mem.self?.movementState} />
        <Row label="Known Abilities" value={mem.self?.knownAbilities} />
        <Row label="Recent Powers" value={mem.self?.recentPowers} />
        <Row label="Successful / Failed" value={`${mem.self?.successfulAttacks ?? 0} / ${mem.self?.failedAttacks ?? 0}`} />
      </Section>
      <Section title="Opponent Memory" defaultOpen>
        <Row label="Preferred Range" value={mem.opponent?.preferredRange} />
        <Row label="Aggression" value={mem.opponent?.aggressionLevel} />
        <Row label="Defense Pattern" value={mem.opponent?.defensePattern} />
        <Row label="Movement Habits" value={mem.opponent?.movementHabits} />
        <Row label="Healing Behavior" value={mem.opponent?.healingBehavior} />
        <Row label="Most Used" value={mem.opponent?.mostUsedPowers?.map((p) => `${p.name} (${p.count}x)`)} />
        <Row label="Most Successful" value={mem.opponent?.mostSuccessfulPowers?.map((p) => `${p.name} (${p.count}x)`)} />
        <Row label="Frequent Combos" value={mem.opponent?.frequentCombos?.map((c) => `${c.combo} (${c.count}x)`)} />
        <Row label="Strengths" value={mem.opponent?.strengths} />
        <Row label="Weaknesses" value={mem.opponent?.weaknesses} />
        <Row label="Adaptations" value={mem.opponent?.adaptations} />
      </Section>
      <Section title="Power Memory">
        {(mem.power?.entries || []).length === 0 && <p style={{ color: DIM }}>No powers recorded yet.</p>}
        {(mem.power?.entries || []).map((p) => (
          <Row key={p.name} label={p.name} value={`used ${p.timesUsed}x · ${p.category} · last: ${p.lastResult || "—"}`} />
        ))}
      </Section>
      <Section title="Transformation Memory">
        <Row label="Current Form" value={mem.transformation?.currentForm} />
        {(mem.transformation?.history || []).map((t, i) => (
          <Row key={i} label={`R${t.round}`} value={`${t.form} (via ${t.trigger})`} />
        ))}
      </Section>
      <Section title="Long-Term Summary">
        {(mem.longTermSummary || []).length === 0 && <p style={{ color: DIM }}>Not enough turns yet to summarize.</p>}
        <ul className="list-disc pl-4 space-y-0.5">
          {(mem.longTermSummary || []).map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </Section>
      <Section title={`Recent Turns (${(mem.shortTerm || []).length})`}>
        {(mem.shortTerm || []).slice().reverse().map((t, i) => (
          <div key={i} className="py-1 border-b" style={{ borderColor: LINE }}>
            <div>R{t.round} · {t.actorKey === mem.fighterKey ? "Self" : "Opponent"} · {t.ability_name} ({t.action}) → {t.result}{t.damage ? `, ${t.damage} dmg` : ""}</div>
            {t.thought && <div style={{ color: DIM, fontStyle: "italic" }}>"{t.thought}"</div>}
          </div>
        ))}
      </Section>
    </div>
  );
}

export default function MemoryViewer({ open, data, loading, fighters = [], onRefresh, onClose }) {
  if (!open) return null;
  return (
    <div className="rounded-lg mb-4" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${LINE}` }}>
        <span className="text-xs uppercase tracking-widest" style={{ color: GOLD, fontFamily: "'IBM Plex Mono', monospace" }}>🧠 Memory Viewer (debug)</span>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="flex items-center gap-1 text-xs" style={{ color: DIM }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={onClose}><X size={14} style={{ color: DIM }} /></button>
        </div>
      </div>
      <div className="p-3 max-h-[420px] overflow-y-auto grid md:grid-cols-2 gap-3">
        {fighters.map((f) => (
          <div key={f.key} className="rounded" style={{ border: `1px solid ${LINE}` }}>
            <div className="px-3 py-2 text-xs font-semibold" style={{ color: f.color, borderBottom: `1px solid ${LINE}` }}>{f.name} ({f.key})</div>
            <FighterMemoryBlock mem={data?.memory?.[f.key]} />
          </div>
        ))}
      </div>
      {data?.arena && (
        <div className="px-3 pb-3 text-xs" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
          Arena Memory — round {data.arena.round}, weather: {data.arena.weather}, gravity: {data.arena.gravity}
          {data.arena.events?.length > 0 && `, active events: ${data.arena.events.map((e) => e.label).join(", ")}`}
        </div>
      )}
    </div>
  );
}
