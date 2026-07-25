# Phase 4 Render Pipeline + Cinematic VFX Engine

## Render Pipeline Architecture

```text
AI Decision
  -> Reality Interpreter (structured event: type, element, scale, renderer hints)
  -> Render Command Builder / VFX Script Engine
  -> Timeline Scheduler
  -> Animation Queue
  -> VFX Engine (particles, aura, beams, explosions, shockwaves, lighting)
  -> SVG Renderer Layers
  -> Canvas/Viewport
```

## Timeline Scheduler Architecture

```text
Timeline Definition
  -> Commands with startTime + delay + duration
  -> Scheduler advances timeline clock
  -> Eligible commands become active
  -> Animation Queue executes by layer/priority
  -> Commands expire, cancel, pause, resume, or loop independently
```

## VFX Engine Architecture

```text
Battle Event
  -> buildVfxTimeline(entry, poses)
  -> scheduleTimeline(engine.scheduler, timeline)
  -> updateVfxEngine(dt)
       |-- updateTimelineScheduler
       |-- enqueueAnimation
       |-- emitParticles through Object Pool
       |-- updateAnimationQueue
       |-- updateParticleEngine
  -> VFXLayer renders active structured commands
```

## Render Command API

Every visual effect is represented as a composable command object:

```ts
{
  id: string,
  type: "Move" | "Rotate" | "Scale" | "Jump" | "Fly" | "Dash" | "Attack" |
        "Punch" | "Kick" | "Beam" | "Projectile" | "Explosion" | "Teleport" |
        "Aura" | "Trail" | "Particle" | "Shockwave" | "Lighting" |
        "Screen Flash" | "Camera" | "Transformation" | "Environment" | "Sound",
  target: string | null,
  position: { x: number, y: number } | null,
  rotation: number,
  scale: number,
  duration: number,
  delay: number,
  startTime: number,
  layer: "background" | "environment" | "arena" | "characters" | "projectiles" |
         "effects" | "particles" | "aura" | "lighting" | "hud" | "debug",
  priority: number,
  opacity: number,
  blendMode: string,
  easing: string,
  metadata: Record<string, unknown>
}
```

## Automatic New-Power Animation

New AI-created powers do not require renderer modifications. The Reality Interpreter emits structured data such as translated type, element, scale, intensity, special effects, and renderer hints. The VFX Script Engine converts that data into generic Render Commands, the Timeline Scheduler times them, the Animation Queue layers them, and the VFXLayer executes the same command vocabulary for every power.

Example: `Entropy Dragon Cannon` can become `Aura -> Particle -> Camera -> Beam -> Explosion -> Shockwave -> Screen Flash` simply by composing commands with `kind: "void"` or `kind: "cosmic"`, higher scale, and different timings.

## Debug Controls

The developer panel exposes visual toggles for particles, aura, lighting, camera FX, trails, environment FX, hit FX, timeline, render bounds, and FPS/debug metrics. It also displays particle count, active commands, active timelines, and queue depth.
