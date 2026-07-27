// ---------- ANIMATION DEBUG PANEL (DEVELOPER MODE) ----------
// Phase 3.95, spec section 14. Shows the last resolved turn's Animation
// Event queue, whether it came from the Combat Engine's verdict or the
// pre-3.95 keyword fallback, live movement/camera state, and the last
// particle bursts — everything needed to verify the renderer is actually
// synchronized with the engine rather than improvising.

import { X } from "lucide-react";

const PANEL = "#12151A";
const LINE = "#23282f";
const DIM = "#7C8590";
const INK = "#EDEAE3";
const GOLD = "#E8B94A";
const VOID = "#0A0C0F";

export default function AnimationDebugPanel({ open, snapshot, camera, poses, onClose }) {
  if (!open) return null;

  return (
    <div className="rounded-lg mb-4" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${LINE}` }}>
        <span className="text-xs uppercase tracking-widest" style={{ color: GOLD, fontFamily: "'IBM Plex Mono', monospace" }}>🎬 Animation Sync (debug)</span>
        <button onClick={onClose}><X size={14} style={{ color: DIM }} /></button>
      </div>

      <div className="p-3 space-y-3 text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <div className="rounded p-2" style={{ background: VOID, border: `1px solid ${LINE}` }}>
          <div style={{ color: DIM, marginBottom: 4 }}>LAST ANIMATION QUEUE</div>
          {!snapshot ? (
            <div style={{ color: DIM }}>No turn resolved yet this battle.</div>
          ) : (
            <>
              <div>
                <span style={{ color: DIM }}>Round {snapshot.round} — </span>
                <span style={{ color: INK }}>{snapshot.actor}</span>
                <span style={{ color: DIM }}> used </span>
                <span style={{ color: INK }}>"{snapshot.ability}"</span>
              </div>
              <div>
                <span style={{ color: DIM }}>Animation Source: </span>
                <span style={{ color: snapshot.source === "engine" ? "#3ECF8E" : GOLD }}>{snapshot.source}</span>
                <span style={{ color: DIM }}> · Verdict code: </span>
                <span style={{ color: INK }}>{snapshot.verdictCode || "—"}</span>
              </div>
              <div className="mt-2" style={{ color: DIM }}>Event queue (in order):</div>
              <ol className="ml-4 list-decimal">
                {snapshot.events.map((e) => (
                  <li key={e.id} style={{ color: INK }}>
                    <span style={{ color: GOLD }}>{e.type}</span>
                    <span style={{ color: DIM }}> [{e.category}, id {e.id}, {e.source}]</span>
                  </li>
                ))}
              </ol>
              {snapshot.physicsSync && (
                <div className="mt-2">
                  <span style={{ color: DIM }}>Physics Sync: </span>
                  knockback {snapshot.physicsSync.knockback ?? 0}px, impact radius {snapshot.physicsSync.impactRadius ?? 0}
                  {snapshot.physicsSync.terrainDamage ? ", terrain damaged" : ""}
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded p-2" style={{ background: VOID, border: `1px solid ${LINE}` }}>
          <div style={{ color: DIM, marginBottom: 4 }}>MOVEMENT STATE</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {Object.entries(poses || {}).map(([key, pose]) => (
              <div key={key}>
                <span style={{ color: GOLD }}>{key}</span>
                <span style={{ color: DIM }}> — state: </span>
                <span style={{ color: INK }}>{pose.state}</span>
                <span style={{ color: DIM }}> · x: </span>
                <span style={{ color: INK }}>{Math.round(pose.x)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded p-2" style={{ background: VOID, border: `1px solid ${LINE}` }}>
          <div style={{ color: DIM, marginBottom: 4 }}>CAMERA EVENTS</div>
          <div style={{ color: INK }}>
            shake: {(camera?.shakeIntensity ?? 0).toFixed(1)} · zoom-out boost: {(camera?.zoomOutBoost ?? 0).toFixed(2)} ·
            {" "}motion blur: {(camera?.motionBlur ?? 0).toFixed(2)} · snap flash: {(camera?.snapFlash ?? 0).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
