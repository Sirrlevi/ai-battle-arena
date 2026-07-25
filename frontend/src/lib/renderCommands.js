export const RENDER_LAYERS = ["background", "environment", "arena", "characters", "projectiles", "effects", "particles", "aura", "lighting", "hud", "debug"];
let nextCommandId = 1;
export function createRenderCommand({ type, target = null, position = null, rotation = 0, scale = 1, duration = 300, delay = 0, startTime = 0, layer = "effects", priority = 0, opacity = 1, blendMode = "screen", easing = "linear", metadata = {} } = {}) {
  return { id: `rc_${nextCommandId++}`, type, target, position, rotation, scale, duration, delay, startTime, layer, priority, opacity, blendMode, easing, metadata, status: "pending", elapsed: 0 };
}
export function createTimeline(sequence = [], { id = `tl_${Date.now()}`, loop = false } = {}) {
  return { id, loop, commands: sequence.map((cmd) => createRenderCommand(cmd)), status: "queued", elapsed: 0, paused: false, cancelled: false };
}
