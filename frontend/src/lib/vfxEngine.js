import { createAnimationQueue, enqueueAnimation, updateAnimationQueue } from "./animationQueue.js";
import { createParticleEngine, emitParticles, updateParticleEngine } from "./particleEngine.js";
import { createTimelineScheduler, scheduleTimeline, updateTimelineScheduler } from "./timelineScheduler.js";
import { buildVfxTimeline } from "./vfxScriptEngine.js";
export function createVfxEngine() { return { scheduler: createTimelineScheduler(), queue: createAnimationQueue(), particles: createParticleEngine(), activeCommands: [], settings: { particles: true, aura: true, lighting: true, cameraFx: true, trails: true, environmentFx: true, hitFx: true, timeline: true, renderBounds: false, fps: true } }; }
export function enqueueBattleVfx(engine, entry, poses) { scheduleTimeline(engine.scheduler, buildVfxTimeline(entry, poses)); }
export function updateVfxEngine(engine, dt) {
  engine.particles.enabled = engine.settings.particles;
  updateTimelineScheduler(engine.scheduler, dt, (cmd) => {
    enqueueAnimation(engine.queue, cmd);
    if (cmd.type === "Particle") emitParticles(engine.particles, { x: cmd.position?.x, y: cmd.position?.y, kind: cmd.metadata?.kind, count: cmd.metadata?.count, speed: cmd.metadata?.speed });
  });
  engine.activeCommands = updateAnimationQueue(engine.queue, dt);
  updateParticleEngine(engine.particles, dt);
  return engine;
}
export function toggleVfxSetting(engine, key) { if (key in engine.settings) engine.settings[key] = !engine.settings[key]; }
