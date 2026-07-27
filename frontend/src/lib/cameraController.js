// ---------- CAMERA CONTROLLER MODULE ----------
// Phase 3 base: keeps every living fighter on screen with a simple
// smooth-follow. Phase 3.95 adds cinematic camera EVENTS (spec section 8)
// on top — shake/zoom-out/motion-blur/snap/dynamic-zoom — as a decaying
// offset layered onto the same follow/zoom target, so nothing about the
// original follow behavior changes when no event is active.

const SHAKE_MAGNITUDE = { "small-shake": 4, "medium-shake": 9, "large-shake": 16, "ultimate-camera": 20, "death-camera": 12, "beam-clash-camera": 14 };

export function createCamera(centerX) {
  return {
    x: centerX, zoom: 1, targetX: centerX, targetZoom: 1,
    // Phase 3.95 additions:
    shakeIntensity: 0, shakeOffsetX: 0, shakeOffsetY: 0,
    zoomOutBoost: 0, motionBlur: 0, snapFlash: 0,
    // Phase 4 additions (spec section 11):
    impactZoomBoost: 0, timeScale: 1, deathDesat: 0,
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
    // Phase 4 (spec section 11):
    case "impact-zoom":
      camera.impactZoomBoost = Math.max(camera.impactZoomBoost, 0.16);
      camera.shakeIntensity = Math.max(camera.shakeIntensity, SHAKE_MAGNITUDE["medium-shake"]);
      break;
    case "slow-motion":
      camera.timeScale = 0.35;
      break;
    case "ultimate-camera":
      camera.zoomOutBoost = Math.max(camera.zoomOutBoost, -0.12); // zoom IN for an ultimate
      camera.shakeIntensity = Math.max(camera.shakeIntensity, SHAKE_MAGNITUDE["ultimate-camera"]);
      camera.timeScale = 0.5;
      break;
    case "death-camera":
      camera.shakeIntensity = Math.max(camera.shakeIntensity, SHAKE_MAGNITUDE["death-camera"]);
      camera.deathDesat = 1;
      camera.timeScale = 0.4;
      break;
    case "beam-clash-camera":
      camera.impactZoomBoost = Math.max(camera.impactZoomBoost, 0.1);
      camera.shakeIntensity = Math.max(camera.shakeIntensity, SHAKE_MAGNITUDE["beam-clash-camera"]);
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
  camera.targetZoom = Math.max(0.75, Math.min(1.05, arenaWidth / Math.max(spread + 260, arenaWidth * 0.6))) - camera.zoomOutBoost + camera.impactZoomBoost;

  const followLerp = Math.min(1, dt * 3);
  camera.x += (camera.targetX - camera.x) * followLerp;
  camera.zoom += (camera.targetZoom - camera.zoom) * followLerp;

  // Decay every event-driven layer independently (using REAL dt, never the
  // slow-motion-scaled dt App.jsx applies to gameplay) so the camera always
  // recovers even while time itself is dilated.
  camera.shakeIntensity = Math.max(0, camera.shakeIntensity - dt * 30);
  camera.shakeOffsetX = camera.shakeIntensity > 0 ? (Math.random() * 2 - 1) * camera.shakeIntensity : 0;
  camera.shakeOffsetY = camera.shakeIntensity > 0 ? (Math.random() * 2 - 1) * camera.shakeIntensity : 0;
  camera.zoomOutBoost = camera.zoomOutBoost > 0 ? Math.max(0, camera.zoomOutBoost - dt * 0.35) : Math.min(0, camera.zoomOutBoost + dt * 0.35);
  camera.impactZoomBoost = Math.max(0, camera.impactZoomBoost - dt * 0.5);
  camera.motionBlur = Math.max(0, camera.motionBlur - dt * 2.5);
  camera.snapFlash = Math.max(0, camera.snapFlash - dt * 4);
  camera.deathDesat = Math.max(0, camera.deathDesat - dt * 0.4);
  camera.timeScale = Math.min(1, camera.timeScale + dt * 0.8);

  return camera;
}
