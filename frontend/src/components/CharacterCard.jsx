// ---------- CHARACTER CARD MODULE ----------
// Shows the structured JSON a fighter's AI generated before the battle
// starts: name, stickman color, aura, weapon, combat style, and intro line.

const PANEL = "#12151A";
const LINE = "#23282f";
const DIM = "#7C8590";
const INK = "#EDEAE3";

export default function CharacterCard({ fighter }) {
  const f = fighter;
  return (
    <div className="rounded-lg p-4 flex gap-3" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
      <div className="w-10 h-10 rounded-full shrink-0 mt-0.5" style={{ background: f.color, boxShadow: `0 0 16px ${f.color}88` }} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm" style={{ color: INK }}>{f.name}</span>
          {f.aura && (
            <span className="text-xs" style={{ color: f.color, fontFamily: "'IBM Plex Mono', monospace" }}>{f.aura} aura</span>
          )}
        </div>
        <div className="text-xs mt-0.5" style={{ color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
          {f.combatStyle || "—"}{f.weapon ? ` · wields ${f.weapon}` : ""}
        </div>
        {f.intro && <p className="text-sm italic mt-1.5" style={{ color: INK }}>"{f.intro}"</p>}
      </div>
    </div>
  );
}
