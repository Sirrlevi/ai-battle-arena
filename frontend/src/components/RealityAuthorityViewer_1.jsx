// ---------- REALITY AUTHORITY VIEWER (DEBUG PANEL) ----------
// Shows the current Authority Mode, lets a developer switch it, and shows
// the last Reality Authority Layer decision: what the engine decided, what
// the AI claimed, and the final structured event that resulted.

import { X, RefreshCw } from "lucide-react";

const PANEL = "#12151A";
const LINE = "#23282f";
const DIM = "#7C8590";
const INK = "#EDEAE3";
const GOLD = "#E8B94A";
const VOID = "#0A0C0F";

const MODES = [
  { id: "engine", label: "Engine Authority", desc: "Default. Engine controls all outcomes; AI only chooses actions." },
  { id: "hybrid", label: "Hybrid Authority", desc: "AI has narrative authority; engine translates claims into balanced gameplay." },
  { id: "ai", label: "AI Authority", desc: "Free Reality Mode. AI-declared outcomes are trusted directly." },
];

export default function RealityAuthorityViewer({ open, mode, refereeEnabled, lastEvent, onChangeMode, onToggleReferee, onRefresh, loading, onClose }) {
  if (!open) return null;
  return (
    <div className="rounded-lg mb-4" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${LINE}` }}>
        <span className="text-xs uppercase tracking-widest" style={{ color: GOLD, fontFamily: "'IBM Plex Mono', monospace" }}>⚖️ Reality Authority (debug)</span>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="flex items-center gap-1 text-xs" style={{ color: DIM }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={onClose}><X size={14} style={{ color: DIM }} /></button>
        </div>
      </div>

      <div className="p-3 space-y-3 text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <div className="grid sm:grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => onChangeMode(m.id)}
              className="text-left rounded p-2"
              style={{
                background: mode === m.id ? "#1c2027" : VOID,
                border: `1px solid ${mode === m.id ? GOLD : LINE}`,
                color: mode === m.id ? GOLD : INK,
              }}
            >
              <div className="font-semibold">{m.label}</div>
              <div style={{ color: DIM, fontSize: "0.7rem", marginTop: 2 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2" style={{ color: DIM }}>
          <input type="checkbox" checked={!!refereeEnabled} onChange={(e) => onToggleReferee(e.target.checked)} />
          Enable AI Referee / Narrator (optional, rule-based by default — no extra API cost)
        </label>

        <div className="rounded p-2" style={{ background: VOID, border: `1px solid ${LINE}` }}>
          <div style={{ color: DIM, marginBottom: 4 }}>LAST REALITY EVENT</div>
          {!lastEvent ? (
            <div style={{ color: DIM }}>No action resolved yet this battle.</div>
          ) : (
            <>
              <div><span style={{ color: DIM }}>Engine Decision: </span>{lastEvent.engineDecision}</div>
              <div><span style={{ color: DIM }}>AI Decision: </span>{lastEvent.aiDecision || "—"}</div>
              <div className="mt-1" style={{ color: INK }}>
                <span style={{ color: DIM }}>Final Event: </span>
                {lastEvent.finalEvent?.eventType
                  ? `${lastEvent.finalEvent.eventType} · ${lastEvent.finalEvent.element || ""} · ${lastEvent.finalEvent.scale || ""} · intensity: ${lastEvent.finalEvent.intensity || "—"}`
                  : "engine-resolved (no override)"}
              </div>
              {lastEvent.finalEvent?.specialEffects?.length > 0 && (
                <div style={{ color: GOLD }}>Special effects: {lastEvent.finalEvent.specialEffects.join(", ")}</div>
              )}
              {lastEvent.finalEvent?.softened && (
                <div style={{ color: GOLD }}>⚠ {lastEvent.finalEvent.softenNote}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
