// ---------- CAMERA CONTROLLER MODULE ----------
// Keeps every living fighter on screen with a simple smooth-follow: track
// the midpoint of alive fighters' x positions, zoom out as they spread
// further apart. No cinematic behavior (cuts, shake, easing curves) yet —
// just a critically-damped lerp toward a target pan/zoom each frame.

export function createCamera(centerX) {
  return { x: centerX, zoom: 1, targetX: centerX, targetZoom: 1, shake: 0, shakeT: 0, snapX: null };
}

export function applyCameraEvent(camera, event = {}) {
  const shake = event.camera?.shake;
  if (shake === "large") camera.shake = Math.max(camera.shake, 16);
  else if (shake === "medium") camera.shake = Math.max(camera.shake, 9);
  else if (shake === "small") camera.shake = Math.max(camera.shake, 4);
  if (event.camera?.zoom === "out") camera.targetZoom = Math.min(camera.targetZoom, 0.68);
  if (event.camera?.zoom === "in") camera.targetZoom = Math.max(camera.targetZoom, 1.08);
  if (event.name === "Teleport" && Number.isFinite(event.x)) camera.x = event.x;
}

export function updateCamera(camera, fighters, arenaWidth, dt) {
  const alive = fighters.filter((f) => f.alive !== false);
  const xs = (alive.length ? alive : fighters).map((f) => f.motion?.x ?? f.position?.x ?? arenaWidth / 2);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spread = maxX - minX;

  camera.targetX = (minX + maxX) / 2;
  // Zoom out modestly as fighters get far apart, zoom back toward 1 as they close in.
  camera.targetZoom = Math.max(0.75, Math.min(1.05, arenaWidth / Math.max(spread + 260, arenaWidth * 0.6)));

  const followLerp = Math.min(1, dt * 3);
  camera.x += (camera.targetX - camera.x) * followLerp;
  camera.zoom += (camera.targetZoom - camera.zoom) * followLerp;
  if (camera.shake > 0) {
    camera.shakeT += dt * 42;
    camera.x += Math.sin(camera.shakeT) * camera.shake * 0.08;
    camera.shake = Math.max(0, camera.shake - dt * 28);
  }
  return camera;
}
