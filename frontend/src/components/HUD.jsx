// ---------- HUD MODULE ----------
// One stat panel per fighter. Purely presentational — reads the same
// fighter shape the renderer and engine use, renders nothing arena-related.

import { Heart, Zap, Skull, Trophy } from "lucide-react";

const PANEL = "#12151A";
const LINE = "#23282f";
const DIM = "#7C8590";
const HIT = "#E4443B";
const OK = "#3ECF8E";
const GOLD = "#E8B94A";
const INK = "#EDEAE3";

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

export default function HUD({ fighter, isWinner = false }) {
  const f = fighter;
  return (
    <div className="rounded-lg p-4 space-y-2" style={{ background: PANEL, border: `1px solid ${f.hp === 0 ? HIT : LINE}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: f.color }} />
          <span className="font-semibold text-sm" style={{ color: INK }}>{f.name}</span>
          {!f.alive && <Skull size={14} style={{ color: HIT }} />}
          {isWinner && <Trophy size={14} style={{ color: GOLD }} />}
        </div>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            color: f.alive ? OK : HIT,
            border: `1px solid ${f.alive ? OK : HIT}`,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {f.alive ? "ALIVE" : "DEAD"}
        </span>
      </div>
      <div className="text-xs" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
        {f.combatStyle || "—"}{f.weapon ? ` · ${f.weapon}` : ""}
      </div>
      <Bar value={f.hp} max={f.maxHp ?? 100} color={f.hp > 30 ? OK : HIT} icon={<Heart size={13} style={{ color: DIM }} />} />
      <Bar value={f.energy} max={f.maxEnergy ?? 100} color={f.color} icon={<Zap size={13} style={{ color: DIM }} />} />
      <div className="flex items-center gap-1.5 flex-wrap min-h-[18px]">
        {f.status.length === 0 ? (
          <span className="text-xs" style={{ color: LINE }}>—</span>
        ) : (
          f.status.map((s, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#0A0C0F", color: DIM, border: `1px solid ${LINE}`, fontFamily: "'IBM Plex Mono', monospace" }}>
              {s.type}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
