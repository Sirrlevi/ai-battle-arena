// ---------- CAMERA CONTROLLER MODULE ----------
// Phase 3 base: keeps every living fighter on screen with a simple
// smooth-follow. Phase 3.95 adds cinematic camera EVENTS (spec section 8)
// on top — shake/zoom-out/motion-blur/snap/dynamic-zoom — as a decaying
// offset layered onto the same follow/zoom target, so nothing about the
// original follow behavior changes when no event is active.

const SHAKE_MAGNITUDE = { "small-shake": 4, "medium-shake": 9, "large-shake": 16 };
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function createCamera(centerX) {
  return {
    x: centerX, zoom: 1, targetX: centerX, targetZoom: 1,
    // Phase 3.95 additions:
    shakeIntensity: 0, shakeOffsetX: 0, shakeOffsetY: 0,
    zoomOutBoost: 0, motionBlur: 0, snapFlash: 0,
    clashFreeze: 0, // Phase 4B: >0 while a beam-clash hitstop is active (see App.jsx's frame loop)
    // Impact-frame additions: a hit-scaled flash separate from snapFlash
    // (which stays teleport-only, always full intensity), and a brief
    // directed "punch" toward the impact point layered additively on top
    // of the normal follow/zoom target — same decaying-offset pattern as
    // shakeOffsetX/Y above, just aimed instead of random.
    impactFlash: 0,
    punchInIntensity: 0, punchInDir: 0, punchInZoom: 0,
  };
}

/** Called from the Animation Event Bus (see App.jsx) whenever a resolved turn implies a camera reaction. Never decides combat outcomes — purely cosmetic. */
export function triggerCameraEvent(camera, kind, opts = {}) {
  switch (kind) {
    case "small-shake":
    case "medium-shake":
    case "large-shake":
      camera.shakeIntensity = Math.max(camera.shakeIntensity, SHAKE_MAGNITUDE[kind] || 4);
      break;
    case "zoom-out":
      camera.zoomOutBoost = Math.max(camera.zoomOutBoost, 0.28);
      break;
    case "motion-blur":
      camera.motionBlur = Math.max(camera.motionBlur, opts.intensity ?? 1);
      break;
    case "camera-snap":
      camera.snapFlash = 1;
      break;
    case "dynamic-zoom":
      camera.zoomOutBoost = Math.max(camera.zoomOutBoost, 0.12);
      camera.shakeIntensity = Math.max(camera.shakeIntensity, SHAKE_MAGNITUDE["small-shake"]);
      break;
    case "beam-clash":
      // Spec section 5: "camera zoom" + "push mechanic" on collision.
      camera.zoomOutBoost = Math.max(camera.zoomOutBoost, 0.24);
      camera.shakeIntensity = Math.max(camera.shakeIntensity, SHAKE_MAGNITUDE["medium-shake"]);
      camera.clashFreeze = 1;
      break;
    case "impact-flash":
      // A quick, hit-scaled flash for a heavy/critical/lethal strike — the
      // "impact frame" itself. opts.intensity should be pre-scaled by the
      // caller (damage magnitude); this just takes the strongest one active.
      camera.impactFlash = Math.max(camera.impactFlash, clamp(opts.intensity ?? 0.5, 0, 1));
      break;
    case "impact-zoom": {
      // A brief directed "punch" toward the hit, layered additively on top
      // of (not replacing) the normal follow/zoom target in updateCamera
      // below — reads as a quick camera reaction to the impact rather than
      // fighting the follow logic. opts.x is the world-x of the impact;
      // opts.intensity (0-1ish) scales how much extra zoom-in it gets.
      const dir = (opts.x ?? camera.x) - camera.x;
      const pull = clamp(Math.abs(dir) * 0.3, 0, 26);
      if (pull > camera.punchInIntensity) {
        camera.punchInIntensity = pull;
        camera.punchInDir = dir >= 0 ? 1 : -1;
      }
      camera.punchInZoom = Math.max(camera.punchInZoom, opts.intensity ?? 0.05);
      break;
    }
    default:
      break;
  }
}

export function updateCamera(camera, fighters, arenaWidth, dt) {
  const alive = fighters.filter((f) => f.alive !== false);
  const xs = (alive.length ? alive : fighters).map((f) => f.motion?.x ?? f.position?.x ?? arenaWidth / 2);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spread = maxX - minX;

  camera.targetX = (minX + maxX) / 2;
  // Zoom out modestly as fighters get far apart, zoom back toward 1 as they close in.
  camera.targetZoom = Math.max(0.75, Math.min(1.05, arenaWidth / Math.max(spread + 260, arenaWidth * 0.6))) - camera.zoomOutBoost;

  const followLerp = Math.min(1, dt * 3);
  camera.x += (camera.targetX - camera.x) * followLerp;
  camera.zoom += (camera.targetZoom - camera.zoom) * followLerp;

  // Decay every event-driven layer independently so overlapping events
  // (e.g. a heavy hit during a zoom-out) blend instead of interrupting.
  camera.shakeIntensity = Math.max(0, camera.shakeIntensity - dt * 30);
  camera.shakeOffsetX = camera.shakeIntensity > 0 ? (Math.random() * 2 - 1) * camera.shakeIntensity : 0;
  camera.shakeOffsetY = camera.shakeIntensity > 0 ? (Math.random() * 2 - 1) * camera.shakeIntensity : 0;
  camera.zoomOutBoost = Math.max(0, camera.zoomOutBoost - dt * 0.35);
  camera.motionBlur = Math.max(0, camera.motionBlur - dt * 2.5);
  camera.snapFlash = Math.max(0, camera.snapFlash - dt * 4);
  camera.clashFreeze = Math.max(0, camera.clashFreeze - dt * 3);
  camera.impactFlash = Math.max(0, camera.impactFlash - dt * 5); // snappier than snapFlash — a punch, not a cut
  camera.punchInIntensity = Math.max(0, camera.punchInIntensity - dt * 90); // fast — a quick jab toward the hit, not a held zoom
  camera.punchInZoom = Math.max(0, camera.punchInZoom - dt * 0.35);
  if (camera.punchInIntensity <= 0) camera.punchInDir = 0;

  return camera;
}
