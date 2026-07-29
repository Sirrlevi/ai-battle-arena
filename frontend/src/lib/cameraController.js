// ---------- CAMERA CONTROLLER MODULE ----------
// Phase 3 base: keeps every living fighter on screen with a simple
// smooth-follow. Phase 3.95 adds cinematic camera EVENTS (spec section 8)
// on top — shake/zoom-out/motion-blur/snap/dynamic-zoom — as a decaying
// offset layered onto the same follow/zoom target, so nothing about the
// original follow behavior changes when no event is active.

const SHAKE_MAGNITUDE = { "small-shake": 4, "medium-shake": 9, "large-shake": 16 };

export function createCamera(centerX) {
  return {
    x: centerX, zoom: 1, targetX: centerX, targetZoom: 1,
    // Phase 3.95 additions:
    shakeIntensity: 0, shakeOffsetX: 0, shakeOffsetY: 0,
    zoomOutBoost: 0, motionBlur: 0, snapFlash: 0,
    clashFreeze: 0, // Phase 4B: >0 while a beam-clash hitstop is active (see App.jsx's frame loop)
  };
}

/** Called from the Animation Event Bus (see App.jsx) whenever a resolved turn implies a camera reaction. Never decides combat outcomes — purely cosmetic. */
export function triggerCameraEvent(camera, kind) {
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
      camera.motionBlur = 1;
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

  return camera;
}
