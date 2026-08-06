
// ---------- ANIMATION CONTROLLER MODULE - M1 PHYSICS REWRITE ----------
// Orchestrator with real physics: impact system, correct fall direction, slide for down, no pop-up, separation force

import { createMotionState, updateMotion, issueCommand, setPhysicsProfile, applyKnockback } from "./movementController.js";
import { resolveAnimationState } from "./animationStateMachine.js";
import { calculateImpact, getFallAnimation } from "./impactSystem.js";
import { resolveAllOverlaps } from "./collisionSystem.js";

const MELEE_REACH = { punch: 56, slash: 56, uppercut: 56, kick: 72, roundhouse: 72 };
const SPEEDSTER_DASH_SPEED = 1600;
const DEFAULT_MELEE_REACH = 56;
const FLY_PEAK_ALTITUDE = 170;
const FLY_STRIKE_ALTITUDE = 34;
const HOVER_STRIKE_ALTITUDE = 26;
function reachFor(variant) { return MELEE_REACH[variant] ?? DEFAULT_MELEE_REACH; }

const MELEE_IMPACT_FRACTION = { punch: 0.85, slash: 0.85, kick: 0.85, roundhouse: 0.9, uppercut: 0.67 };
const DEFAULT_IMPACT_FRACTION = 0.8;
const ATTACK_DURATIONS = { windup: 0.16, strike: 0.12, recovery: 0.26 };
const HIT_REACT_DURATION = 0.25;
const FLASH_DURATION = 0.18;
const BLOCK_DURATION = 0.6;
const KNOCKBACK_SPEED = 260;
const TRANSFORM_PAUSE_DURATION = 0.9;
const KNOCKDOWN_FALL_DURATION = 0.32;
const KNOCKDOWN_DOWN_DURATION = 0.7;
const KNOCKDOWN_GETUP_DURATION = 0.55;

export function createAnimState(x, y, groundY, physicsProfile = null) {
  return {
    motion: createMotionState(x, y, groundY, physicsProfile),
    attackPhase: null,
    pendingImpact: null,
    blockTimer: 0,
    hitTimer: 0,
    flashTimer: 0,
    transformTimer: 0,
    statusVisuals: [],
    lastHitDamage: 0,
    hitDir: 0,
    approachStyle: null,
    timeFrozenTimer: 0,
    knockdownPhase: null,
    knockdownTimer: 0,
    knockdownWallSlam: false,
    pendingDescend: null,
    comboCount: 0,
    homeX: x,
    physicsProfile: physicsProfile,
    isSliding: false,
    slideTarget: null,
    impactData: null, // M1: last impact for correct fall
    fallDirection: null, // 'back' | 'front'
  };
}

export function setAnimPhysicsProfile(anim, physicsProfile) {
  anim.physicsProfile = physicsProfile;
  setPhysicsProfile(anim.motion, physicsProfile);
}

export function triggerTransformation(anim) {
  anim.transformTimer = TRANSFORM_PAUSE_DURATION;
}

const ELEMENT_PROJECTILE_VARIANT = { fire: "fireball", ice: "ice_shard", lightning: "lightning_bolt", void: "void_sphere" };
function resolveProjectileVariant(entry, keywordVariant) {
  const element = entry?.verdict?.ability?.element;
  if (element === "gravity") {
    const text = `${entry.ability_name || ""} ${entry.description || ""}`.toLowerCase();
    return text.includes("black hole") || text.includes("singularity") ? "black_hole" : "gravity_orb";
  }
  if (element && ELEMENT_PROJECTILE_VARIANT[element]) return ELEMENT_PROJECTILE_VARIANT[element];
  return keywordVariant;
}

const TELEPORT_ELEMENT_VARIANT = { fire: "fire", ice: "ice", lightning: "lightning", void: "shadow" };
const TELEPORT_KEYWORD_VARIANT = [
  { variant: "lightning", words: ["thunder", "lightning", "electric", "static", "spark"] },
  { variant: "fire", words: ["fire", "flame", "blaze", "ember"] },
  { variant: "wind", words: ["wind", "gust", "gale", "air current"] },
  { variant: "shadow", words: ["shadow", "dark", "void", "umbral", "night"] },
  { variant: "ice", words: ["ice", "frost", "glacial", "crystal"] },
  { variant: "temporal", words: ["time travel", "time warp", "through time", "chrono", "temporal", "rewind"] },
];
function resolveTeleportVariant(entry) {
  const element = entry?.verdict?.ability?.element;
  if (element && TELEPORT_ELEMENT_VARIANT[element]) return TELEPORT_ELEMENT_VARIANT[element];
  const text = `${entry.ability_name || ""} ${entry.description || ""}`.toLowerCase();
  for (const { variant, words } of TELEPORT_KEYWORD_VARIANT) {
    if (words.some((w) => text.includes(w))) return variant;
  }
  return "arcane";
}

export function queueAction(anim, intent, opponentAnim, entry) {
  anim.knockdownPhase = null;
  anim.isSliding = false;

  if (intent.category === "block") {
    anim.blockTimer = BLOCK_DURATION;
    return;
  }

  if (intent.category === "projectile") {
    const variant = resolveProjectileVariant(entry, intent.variant);
    anim.attackPhase = { variant, phase: "windup", t: 0 };
    const isBeamClash = entry.defense?.chosenResponse === "counter" && (entry.counterDamage || 0) > 0;
    anim.pendingImpact = isBeamClash
      ? { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, spawnBeamClash: true, projectileVariant: variant, counterVariant: "energy", counterDamage: entry.counterDamage, power: intent.power }
      : { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, projectileVariant: variant, spawnProjectile: true, power: intent.power };
    return;
  }

  if (intent.category === "teleport") {
    const variant = resolveTeleportVariant(entry);
    anim.motion.teleportVariant = variant;
    const targetX = opponentAnim ? opponentAnim.motion.x + (anim.motion.facing >=0 ? -40 : 40) : anim.motion.x;
    const targetY = opponentAnim ? opponentAnim.motion.y : anim.motion.y;
    // use teleport command for proper fade
    issueCommand(anim.motion, "teleport", targetX, targetY);
    anim.attackPhase = { variant: "teleport", phase: "windup", t: 0 };
    anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, power: intent.power };
    return;
  }

  if (intent.category === "movement") {
    const v = intent.variant;
    if (v === "fly") {
      issueCommand(anim.motion, "fly", opponentAnim.motion.x, opponentAnim.motion.y - FLY_PEAK_ALTITUDE);
      anim.pendingDescend = { targetX: opponentAnim.motion.x, targetY: opponentAnim.motion.y - FLY_STRIKE_ALTITUDE };
      anim.approachStyle = "fly";
    } else if (v === "hover") {
      issueCommand(anim.motion, "hover", opponentAnim.motion.x, opponentAnim.motion.y - HOVER_STRIKE_ALTITUDE);
      anim.approachStyle = "hover";
    } else {
      const speed = v === "dash" ? SPEEDSTER_DASH_SPEED : undefined;
      const reach = reachFor(intent.meleeHint || intent.variant);
      const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
      const stopX = opponentAnim.motion.x - dir * reach;
      issueCommand(anim.motion, intent.variant || "run", stopX, undefined, speed);
      anim.approachStyle = null;
    }
    anim.attackPhase = { variant: intent.variant, phase: "approach", t: 0 };
    anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, power: intent.power };
    return;
  }

  // melee
  const variant = intent.variant || "punch";
  const reach = reachFor(variant);
  const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
  const stopX = opponentAnim.motion.x - dir * reach;
  const dist = Math.abs(opponentAnim.motion.x - anim.motion.x);
  if (dist > reach + 8) {
    issueCommand(anim.motion, "run", stopX);
    anim.attackPhase = { variant, phase: "approach", t: 0 };
  } else {
    anim.attackPhase = { variant, phase: "windup", t: 0 };
  }
  anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, power: intent.power };
}

export function updateAnimation(anim, dt, allAnims = []) {
  // timers
  if (anim.blockTimer > 0) anim.blockTimer = Math.max(0, anim.blockTimer - dt);
  if (anim.hitTimer > 0) anim.hitTimer = Math.max(0, anim.hitTimer - dt);
  if (anim.flashTimer > 0) anim.flashTimer = Math.max(0, anim.flashTimer - dt);
  if (anim.transformTimer > 0) anim.transformTimer = Math.max(0, anim.transformTimer - dt);
  if (anim.timeFrozenTimer > 0) {
    anim.timeFrozenTimer = Math.max(0, anim.timeFrozenTimer - dt);
    return;
  }

  // knockdown sequence - M1 fixed with correct physics
  if (anim.knockdownPhase) {
    anim.knockdownTimer -= dt;
    if (anim.knockdownTimer <= 0) {
      if (anim.knockdownPhase === "falling") {
        anim.knockdownPhase = "down";
        anim.knockdownTimer = KNOCKDOWN_DOWN_DURATION;
        // ensure grounded for down
        anim.motion.y = anim.motion.groundY;
        anim.motion.vy = 0;
        anim.motion.grounded = true;
      } else if (anim.knockdownPhase === "down") {
        anim.knockdownPhase = "gettingUp";
        anim.knockdownTimer = KNOCKDOWN_GETUP_DURATION;
      } else if (anim.knockdownPhase === "gettingUp") {
        anim.knockdownPhase = null;
        anim.knockdownTimer = 0;
        anim.fallDirection = null;
      } else if (anim.knockdownPhase === "defensive") {
        anim.knockdownPhase = null;
      }
    }
    // update motion even during knockdown for wall bounce
    if (anim.knockdownPhase === "falling") {
      updateMotion(anim.motion, dt, { minX: 40, maxX: 960 });
      if (anim.motion.justHitWall) anim.knockdownWallSlam = true;
    }
    return;
  }

  // sliding (Bug4 fix)
  if (anim.isSliding) {
    const done = updateMotion(anim.motion, dt, { minX: 40, maxX: 960 });
    if (done) {
      anim.isSliding = false;
      anim.knockdownPhase = "down";
      anim.knockdownTimer = KNOCKDOWN_DOWN_DURATION * 0.6;
    }
    return;
  }

  // attack phases
  if (anim.attackPhase) {
    const ap = anim.attackPhase;
    ap.t += dt;

    if (ap.phase === "approach") {
      if (!anim.motion.command) {
        // arrived, or pending descend for fly
        if (anim.pendingDescend) {
          issueCommand(anim.motion, "fly", anim.pendingDescend.targetX, anim.pendingDescend.targetY);
          anim.pendingDescend = null;
          ap.t = 0;
        } else {
          ap.phase = "windup";
          ap.t = 0;
        }
      }
    } else if (ap.phase === "windup") {
      if (ap.t >= ATTACK_DURATIONS.windup) {
        ap.phase = "strike";
        ap.t = 0;
      }
    } else if (ap.phase === "strike") {
      const fracMap = { punch: 0.85, slash: 0.85, kick: 0.85, roundhouse: 0.9, uppercut: 0.67 };
      const impactFrac = fracMap[ap.variant] ?? 0.8;
      if (!ap._impactFired && ap.t / ATTACK_DURATIONS.strike >= impactFrac) {
        ap._impactFired = true;
        // impact will be handled by App.jsx via pendingImpact
      }
      if (ap.t >= ATTACK_DURATIONS.strike) {
        ap.phase = "recovery";
        ap.t = 0;
      }
    } else if (ap.phase === "recovery") {
      if (ap.t >= ATTACK_DURATIONS.recovery) {
        // return home if we flew
        if (anim.approachStyle === "fly" || anim.approachStyle === "hover") {
          issueCommand(anim.motion, anim.approachStyle, anim.homeX, anim.motion.groundY);
          anim.approachStyle = null;
        }
        anim.attackPhase = null;
        anim.pendingImpact = null;
      }
    }
  }

  // motion
  if (anim.motion.command || Math.abs(anim.motion.vx) > 1 || !anim.motion.grounded) {
    updateMotion(anim.motion, dt, { minX: 40, maxX: 960 });
  }

  // separation for all fighters (Bug2 fix) if we have list
  if (allAnims.length > 1) {
    // this will be handled in App.jsx loop, but we keep hook
  }
}

export function applyHitReaction(anim, damage, attackerAnim, entry, allFighters) {
  anim.lastHitDamage = damage;
  anim.hitTimer = HIT_REACT_DURATION;
  anim.flashTimer = FLASH_DURATION;

  const attackerPos = { x: attackerAnim.motion.x, y: attackerAnim.motion.y };
  const defenderPos = { x: anim.motion.x, y: anim.motion.y };
  const isDown = anim.knockdownPhase === "down" || anim.motion.isSliding;

  // M1: calculate real impact with physics profiles
  const impact = calculateImpact({
    attackerPos,
    defenderPos,
    attackerMotion: attackerAnim.motion,
    defenderMotion: anim.motion,
    attackerProfile: attackerAnim.physicsProfile || { mass: 75, density: 1, weightClass: 'Medium', derivedFrom:{strength:4}, weightDef:{}, collisionBehaviour:{} },
    defenderProfile: anim.physicsProfile || { mass: 75, density: 1, weightClass: 'Medium', knockbackResistance: 75, weightDef:{}, collisionBehaviour:{ groundFriction:0.6 } },
    damage,
    attackSpeed: entry?.power ? 320 : 260,
    hitLocation: damage > 25 ? 'torso' : 'torso',
    isDown,
  });

  anim.impactData = impact;
  anim.fallDirection = impact.fallDirection;
  anim.hitDir = impact.impactDir.x >=0 ? 1 : -1;

  // Apply knockback
  if (!isDown) {
    applyKnockback(anim.motion, impact.launchVelocity, false);
  } else {
    // Bug4 fix: slide, no pop-up
    const slideTargetX = anim.motion.x + impact.impactDir.x * impact.slideDistance;
    anim.isSliding = true;
    anim.motion.isSliding = true;
    issueCommand(anim.motion, "slide", slideTargetX);
    anim.motion.vx = impact.launchVelocity.x;
    // keep grounded
    anim.motion.y = anim.motion.groundY;
    anim.motion.grounded = true;
  }

  return impact;
}

export function triggerKnockdown(anim, damage, attackerAnim, entry) {
  const impact = anim.impactData || applyHitReaction(anim, damage, attackerAnim, entry);
  anim.knockdownPhase = "falling";
  anim.knockdownTimer = KNOCKDOWN_FALL_DURATION;
  anim.fallDirection = impact.fallDirection || 'back';
  // launch already applied via hitReaction
}

export function hitStaggerDegrees(damage) {
  return Math.min(18, Math.max(3, damage * 0.45));
}

export function registerTurnOutcome(anim, result) {
  if (result === "hit") anim.comboCount += 1;
  else if (result === "miss") anim.comboCount = 0;
}
