// ---------- BATTLE LOG MODULE ----------
// Scrollable turn-by-turn log. The current-turn/round indicator is rendered
// as a sticky header so it's always visible even while scrolling through a
// long log; the log itself auto-scrolls to the latest entry as it grows.

import { useEffect, useRef } from "react";
import { ShieldCheck, Loader2, Trophy } from "lucide-react";
import { effectEmoji } from "../lib/battleEngine.js";

const PANEL = "#12151A";
const LINE = "#23282f";
const DIM = "#7C8590";
const HIT = "#E4443B";
const OK = "#3ECF8E";
const GOLD = "#E8B94A";

const FIGHTER_COLOR_FALLBACK = "#7C6BFF";

export default function BattleLog({ log, round, thinkingName, phase, winnerName, fighterColors = {} }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);

  return (
    <div className="rounded-lg mb-4" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
      {/* Sticky current-turn header */}
      <div
        className="flex items-center justify-between px-4 py-2 sticky top-0 z-10"
        style={{ background: PANEL, borderBottom: `1px solid ${LINE}` }}
      >
        <span className="text-xs uppercase tracking-widest" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
          Round {round}
        </span>
        {thinkingName && (
          <span className="text-xs flex items-center gap-1.5" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
            <Loader2 size={12} className="animate-spin" /> {thinkingName} is deciding…
          </span>
        )}
        {phase === "finished" && winnerName && (
          <span className="text-xs flex items-center gap-1.5" style={{ color: GOLD, fontFamily: "'IBM Plex Mono', monospace" }}>
            <Trophy size={12} /> {winnerName} wins
          </span>
        )}
      </div>

      <div className="p-4 max-h-[360px] overflow-y-auto space-y-3">
        {log.map((l, i) =>
          l.system ? (
            <div key={i} className="text-xs italic" style={{ color: DIM }}>{l.text}</div>
          ) : (
            <div key={i} className="pb-3" style={{ borderBottom: i < log.length - 1 ? `1px solid ${LINE}` : "none" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: fighterColors[l.actorKey] || FIGHTER_COLOR_FALLBACK }}>{l.actorName}</span>
                <span className="text-xs" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
                  R{l.round} · {l.ability_name} {effectEmoji(l.effect) ? ` ${effectEmoji(l.effect)}` : ""}
                </span>
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
        <div ref={endRef} />
      </div>
    </div>
  );
}
