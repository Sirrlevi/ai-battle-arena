// ---------- ANIMATION CONTROLLER MODULE ----------
// The orchestrator: one instance per fighter. Wraps a MovementController
// motion state, sequences melee windup/attack/recovery, tracks hit-reaction
// timers, and asks the state machine what the current pose state is. This
// is the module `App.jsx` actually talks to — it never touches motion or
// the state machine directly.

import { createMotionState, updateMotion, issueCommand } from "./movementController.js";
import { resolveAnimationState } from "./animationStateMachine.js";
import { getTierForDamage, getImpactForTier, DEFENSIVE_STANCE } from "./damageTiers.js";

// Contact distance per melee-style variant, derived from the actual rig
// geometry in characterAnimation.js (RIG.UPPER_ARM/LOWER_ARM/HAND_R for
// arm strikes ≈ 6.5 + 22 + 20 + 3.4 ≈ 52px from a fighter's root at
// near-full extension; RIG.UPPER_LEG/LOWER_LEG/FOOT_LEN for leg strikes ≈
// 4.5 + 28 + 25 + 11 ≈ 68.5px) plus a small overlap margin so the limb
// visually lands ON the defender's silhouette rather than stopping just
// short of it. Previously every variant shared one flat 92px range tuned
// for none of them — arm strikes in particular stopped ~35-40px short of
// the target, which is what read as "punching the air."
const MELEE_REACH = { punch: 56, slash: 56, uppercut: 56, kick: 72, roundhouse: 72 };
// Speedster dash speed: well above SPEEDS.dash (640 in movementController.js,
// the fastest normal approach) — "as fast as they want, obviously with
// limits" per spec: dramatically faster than anything else in the game,
// but still a finite, bounded number, not unlimited/instant.
const SPEEDSTER_DASH_SPEED = 1600;
const DEFAULT_MELEE_REACH = 56; // arm-based default, for categories (teleport/movement) that always land on an arm-style pose (poseCast/posePunch)
// How far above GROUND_Y (340, per battleState.js) fly/hover get during a
// movement-category attack. GROUND_Y leaves ~340px of headroom to the
// arena's top edge (ARENA_HEIGHT 420) in world space, so FLY_PEAK_ALTITUDE
// is well within bounds. Two different numbers, not one, because a single
// altitude can't serve both jobs: the strike needs to land at roughly the
// defender's own height (STRIKE_ALTITUDE — the punch itself only reaches
// ~50px, so contact needs to happen near ground level) while the
// *transit* should still read as dramatically airborne (FLY_PEAK_ALTITUDE)
// — see the two-stage "soar, then swoop down to strike" arc in
// queueAction and updateAnimation's approach-phase handling below.
const FLY_PEAK_ALTITUDE = 170; // dramatic mid-flight height, fly's transit only
const FLY_STRIKE_ALTITUDE = 34; // fly's actual contact height, low enough to land the punch correctly
const HOVER_STRIKE_ALTITUDE = 26; // hover never leaves this low, gentle height at all — no separate peak stage
function reachFor(variant) {
  return MELEE_REACH[variant] ?? DEFAULT_MELEE_REACH;
}

// How far into the STRIKE phase (0-1) the actual impact fires, timed to
// when characterAnimation.js's pose for that variant is at or near its
// peak forward reach — worked out from the same joint-angle formulas as
// the pose functions themselves (posePunch/poseSlash/poseKick/
// poseRoundhouse all sweep monotonically toward their most-extended angle
// at the very end of the strike keyframe, so 0.85 catches them just before
// that; poseUppercut's arm sweeps THROUGH horizontal (its actual peak
// horizontal reach) partway through and then keeps rising past it toward
// a finishing angle well above horizontal, so its peak is earlier — solved
// from mix(-70, 168, prog) = 90 -> prog ≈ 0.672). Previously impact fired
// at prog 0 of strike — literally the cocked-back end of the windup pose,
// before the limb had moved toward the target at all.
const MELEE_IMPACT_FRACTION = { punch: 0.85, slash: 0.85, kick: 0.85, roundhouse: 0.9, uppercut: 0.67 };
const DEFAULT_IMPACT_FRACTION = 0.8;
const ATTACK_DURATIONS = { windup: 0.16, strike: 0.12, recovery: 0.26 };
const HIT_REACT_DURATION = 0.25;
const FLASH_DURATION = 0.18;
const BLOCK_DURATION = 0.6;
const KNOCKBACK_SPEED = 260;
const TRANSFORM_PAUSE_DURATION = 0.9; // spec section 7: "pause combat briefly"
// Knockdown sequence phase durations — fixed rather than tier-scaled, to
// keep this reasonably simple; the KNOCKBACK DISTANCE (which does scale
// with tier — see IMPACT_TIERS in App.jsx) already carries most of the
// visual differentiation between a 20-damage knockdown and an 80-damage one.
const KNOCKDOWN_FALL_DURATION = 0.32; // toppling-over animation length
const KNOCKDOWN_DOWN_DURATION = 0.7; // lying on the ground before getting up starts
const KNOCKDOWN_GETUP_DURATION = 0.55; // slow rise back to standing

export function createAnimState(x, y, groundY) {
  return {
    motion: createMotionState(x, y, groundY),
    attackPhase: null, // { variant, phase: 'windup'|'strike'|'recovery', t }
    pendingImpact: null, // { targetKey, damage, result } fired partway through 'strike', near peak reach — see MELEE_IMPACT_FRACTION
    blockTimer: 0,
    hitTimer: 0,
    flashTimer: 0,
    transformTimer: 0, // Phase 3.95: >0 while a transformation animation is playing
    statusVisuals: [], // Phase 3.95: active status-effect visuals (see statusVisuals.js), refreshed each turn
    lastHitDamage: 0, // Phase 4A: cosmetic only — read by characterAnimation.js to scale hit-reaction pose (light flinch vs heavy stagger). Never read by any damage/combat logic.
    hitDir: 0, // which way (1 | -1) they were last knocked — cosmetic only, feeds hitStaggerDegrees below
    approachStyle: null, // "fly" | "hover" | null — set by queueAction's movement branch, read by the recovery-phase return trip below so a fighter who flew in also flies home instead of walking
    timeFrozenTimer: 0, // seconds remaining frozen by a "timeStop"-special power (powerCatalog.js) — App.jsx's tick loop calls updateAnimation with dt=0 for this fighter while it's active, a true freeze rather than a special internal branch
    // Damage-tiered knockdown sequence (spec: heavy hits should send a
    // fighter down, not just stagger). null = not in a knockdown sequence;
    // otherwise one of "falling" | "down" | "gettingUp" | "defensive".
    // knockdownTimer counts down within whichever phase is active; the
    // sequence is driven entirely by updateAnimation below, and — unlike
    // every other state here — is checked FIRST by animationStateMachine
    // (see its own comment) since it's an explicit, App.jsx-triggered
    // sequence rather than something derived from motion/attack state.
    knockdownPhase: null,
    knockdownTimer: 0,
    knockdownWallSlam: false, // one-shot, recomputed fresh every frame in updateAnimation — true for exactly the frame a "falling" knockdown carries into the arena wall
    pendingDescend: null, // { targetX, targetY } | null — fly's second arc stage (swoop down to strike height), consumed by the "approach" phase check below once the first (soar up) command completes
    comboCount: 0, // Phase 4D, spec section 13: consecutive-turn hit streak for THIS fighter's own actions, cosmetic only (badge + minor pose flourish) — never read by any damage/combat logic.
    homeX: x,
  };
}

/** Phase 3.95 section 7: called when an Animation Event Bus "Transformation" event fires — briefly freezes the fighter's pose (the state machine's "transforming" rule takes over) before combat resumes. */
export function triggerTransformation(anim) {
  anim.transformTimer = TRANSFORM_PAUSE_DURATION;
}

// Phase 4B, spec section 4: prefers the Combat Engine's own element
// classification (entry.verdict.ability.element — authoritative when a
// verdict exists) over the actionInterpreter keyword guess, extending
// Phase 3.95's "engine beats guesswork" rule to projectile visuals, which
// were 100% keyword-guessed even when a full verdict was available. Falls
// back to the keyword guess whenever there's no verdict or no element
// this table covers — never a hard failure, same as every other fallback
// in this codebase.
const ELEMENT_PROJECTILE_VARIANT = { fire: "fireball", ice: "ice_shard", lightning: "lightning_bolt", void: "void_sphere" };

function resolveProjectileVariant(entry, keywordVariant) {
  const element = entry?.verdict?.ability?.element;
  if (element === "gravity") {
    // "gravity" covers both spec's "Gravity Orb" and "Black Hole" — the
    // element alone doesn't distinguish them, so for purely cosmetic
    // purposes (same spirit as the melee-variant keyword guess) a nudge
    // from the ability's own flavor text picks between the two looks.
    const text = `${entry.ability_name || ""} ${entry.description || ""}`.toLowerCase();
    return text.includes("black hole") || text.includes("singularity") ? "black_hole" : "gravity_orb";
  }
  if (element && ELEMENT_PROJECTILE_VARIANT[element]) return ELEMENT_PROJECTILE_VARIANT[element];
  return keywordVariant;
}

// Teleport visual flavor: which of the vanish/arrive particle looks (see
// App.jsx's TELEPORT_PARTICLES) reads as this specific teleport, picked the
// same way resolveProjectileVariant above picks a projectile look — engine
// element first, ability flavor text as a fallback, "arcane" if neither says
// anything more specific.
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

/**
 * Kicks off the visual sequence for a resolved turn. `intent` comes from
 * actionInterpreter; `opponentAnim` is the other fighter's live anim state
 * (read for positioning, never mutated here).
 */
export function queueAction(anim, intent, opponentAnim, entry) {
  // Whatever this fighter is about to do — attack, defend, cast — it's
  // their actual turn now, which always supersedes a still-playing
  // knockdown recovery (triggerKnockdown/its phase advancement in
  // updateAnimation, above). The turn engine is never blocked waiting for
  // that sequence to finish; this is what makes that safe.
  anim.knockdownPhase = null;

  if (intent.category === "block") {
    anim.blockTimer = BLOCK_DURATION;
    return;
  }

  if (intent.category === "projectile") {
    const variant = resolveProjectileVariant(entry, intent.variant);
    anim.attackPhase = { variant, phase: "windup", t: 0 };
    // Phase 4B, spec section 5: the one reachable "two beams, one
    // exchange" case — see spawnBeamClashPair's doc comment in
    // projectileManager.js for why this is the only scenario the battle
    // loop's strict turn alternation can actually produce.
    const isBeamClash = entry.defense?.chosenResponse === "counter" && (entry.counterDamage || 0) > 0;
    anim.pendingImpact = isBeamClash
      ? { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, spawnBeamClash: true, projectileVariant: variant, counterVariant: "energy", counterDamage: entry.counterDamage, power: intent.power }
      : { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, projectileVariant: variant, spawnProjectile: true, power: intent.power };
    return;
  }

  if (intent.category === "teleport") {
    // Where to reappear: the ability's own flavor text picks the shape
    // (behind the opponent, retreating away, or the default — arriving at
    // striking range) — the same "read the generated description" approach
    // resolveProjectileVariant/resolveTeleportVariant above already use for
    // cosmetic choices, not a new decision system.
    const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
    const text = `${entry.ability_name || ""} ${entry.description || ""}`.toLowerCase();
    let destX;
    if (text.includes("behind")) {
      destX = opponentAnim.motion.x + dir * (DEFAULT_MELEE_REACH + 24);
    } else if ((text.includes("retreat") || text.includes("away") || text.includes("distance")) && !text.includes("close")) {
      destX = anim.motion.x - dir * 180;
    } else {
      destX = opponentAnim.motion.x - dir * DEFAULT_MELEE_REACH;
    }
    anim.motion.teleportVariant = resolveTeleportVariant(entry);
    issueCommand(anim.motion, "teleport", destX, anim.motion.y);
    anim.motion.facing = opponentAnim.motion.x >= destX ? 1 : -1;

    // A pure reposition (engine classified this as a non-damage "teleport"
    // event) ends here — no forced punch. Only chain into a strike if the
    // resolved turn actually carries damage (a teleport-strike combo ability).
    const dealsDamage = (entry.damage || 0) > 0;
    if (dealsDamage) {
      anim.attackPhase = { variant: "teleport_strike", phase: "approach", t: 0 };
      anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result };
    }
    return;
  }

  if (intent.category === "movement") {
    // Pure repositioning flourish (dash/jump/fly/hover) that still resolves
    // as an attack in the battle engine — move with the requested style,
    // then land the hit at contact range just like melee.
    const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
    const approachX = opponentAnim.motion.x - dir * DEFAULT_MELEE_REACH;
    anim.approachStyle = null; // only fly/hover set this — see the recovery-phase return trip in updateAnimation below
    anim.pendingDescend = null; // only fly's two-stage arc sets this — see the "approach" phase handling in updateAnimation below
    if (intent.variant === "jump") {
      issueCommand(anim.motion, "jump");
    } else if (intent.variant === "fly") {
      // Two-stage arc: soar up high across most of the distance, then
      // (once that leg completes — see the "approach" phase handling in
      // updateAnimation below) swoop down to strike at a height that
      // actually lines up with a grounded opponent. A single straight
      // shot to a 170px-high point would visually throw the punch well
      // above their head.
      const midX = anim.motion.x + (approachX - anim.motion.x) * 0.6;
      issueCommand(anim.motion, "fly", midX, anim.motion.y - FLY_PEAK_ALTITUDE);
      anim.pendingDescend = { targetX: approachX, targetY: anim.motion.groundY - FLY_STRIKE_ALTITUDE };
      anim.approachStyle = "fly";
    } else if (intent.variant === "hover") {
      // A single smooth glide, already at a strike-correct height — no
      // peak/descend staging, which is what makes it read as "soft" next
      // to fly's dramatic swoop.
      issueCommand(anim.motion, "hover", approachX, anim.motion.groundY - HOVER_STRIKE_ALTITUDE);
      anim.approachStyle = "hover";
    } else {
      issueCommand(anim.motion, "run", approachX);
    }
    anim.attackPhase = { variant: "punch", phase: "approach", t: 0 };
    anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result };
    return;
  }

  // melee (default)
  const dir = opponentAnim.motion.x >= anim.motion.x ? 1 : -1;
  const approachX = opponentAnim.motion.x - dir * reachFor(intent.variant);
  // Speedster-tagged powers (powerCatalog.js) get a real speed boost, not
  // just a different trail color — SPEEDSTER_DASH_SPEED is well above the
  // fastest normal movement (SPEEDS.dash in movementController.js), and
  // motion.speedTrail (consumed in Stickman.jsx) is what draws the
  // ghost-image trail behind them while it's active.
  if (intent.power?.speedster) {
    issueCommand(anim.motion, "dash", approachX, undefined, SPEEDSTER_DASH_SPEED);
    anim.motion.speedTrail = true;
  } else {
    issueCommand(anim.motion, "dash", approachX);
  }
  anim.attackPhase = { variant: intent.variant, phase: "approach", t: 0 };
  anim.pendingImpact = { targetKey: entry.defenderKey, damage: entry.damage, result: entry.result, power: intent.power };
}

// Max whole-body stagger rotation (degrees) on the heaviest hits — decays
// to 0 as hitTimer counts down, giving a brief "knocked off balance"
// impulse-and-settle on top of the joint-level flinch pose in
// characterAnimation.js's poseHit. Not a real physics simulation (nothing
// here is), just an authored decay curve in the same spirit as everything
// else in this file.
const MAX_HIT_STAGGER_DEGREES = 22;

export function applyHitReaction(anim, fromX, damage = 0, knockbackMultiplier = 1) {
  // M3: Damage-tiered reaction system
  let actualDamage = damage;
  let attackerAnim = null;
  let impact = null;
  let fromXVal = fromX;
  
  // Detect new signature: (anim, damage, attackerAnim, impact)
  if (typeof fromX === 'number' && typeof damage === 'object' && damage !== null && damage.motion) {
    actualDamage = fromX;
    attackerAnim = damage;
    impact = knockbackMultiplier;
    fromXVal = attackerAnim.motion.x;
  } else if (typeof fromX === 'number' && typeof damage === 'number' && typeof knockbackMultiplier === 'object') {
    actualDamage = fromX;
    attackerAnim = damage;
    impact = knockbackMultiplier;
    fromXVal = attackerAnim.motion ? attackerAnim.motion.x : 0;
  }
  
  const tier = getTierForDamage(actualDamage || 0);
  anim.lastHitDamage = actualDamage;
  anim.hitTimer = 0.15 + tier.knockback * 0.12;
  anim.flashTimer = 0.18;
  anim.lastDamageTier = tier;
  
  const dir = anim.motion.x >= (fromXVal||0) ? 1 : -1;
  anim.hitDir = dir;
  anim.fallDirection = tier.anim.fallDirection || 'back';
  
  // Tier-based knockback
  if (tier.min < 5) {
    // 0-5: same as before - tiny flinch
    const massFactor = anim.physicsProfile ? Math.max(0.4, 150/(anim.physicsProfile.mass||75)) : 1;
    anim.motion.vx = dir * 260 * tier.knockback * massFactor;
  } else if (tier.min < 10) {
    // 5-10: thoda jyada shake, 12px piche
    const massFactor = anim.physicsProfile ? Math.max(0.4, 150/(anim.physicsProfile.mass||75)) : 1;
    anim.motion.vx = dir * 260 * tier.knockback * massFactor;
    anim.hitTimer = 0.22;
  } else if (tier.min < 20) {
    // 10-20: aur jyada, 28px, stumble
    const massFactor = anim.physicsProfile ? Math.max(0.4, 150/(anim.physicsProfile.mass||75)) : 1;
    anim.motion.vx = dir * 300 * tier.knockback * massFactor;
    anim.hitTimer = 0.28;
  } else {
    // 20+: use impact system for launch
    if (impact && impact.launchVelocity) {
      const massFactor = anim.physicsProfile ? Math.max(0.4, 150/(anim.physicsProfile.mass||75)) : 1;
      anim.motion.vx = impact.launchVelocity.x * massFactor || dir * tier.knockback * 80;
      anim.motion.vy = impact.launchVelocity.y * 0.5 || tier.anim.hop * 10;
      if (tier.anim.airTime > 0.15) anim.motion.grounded = false;
    } else {
      const massFactor = anim.physicsProfile ? Math.max(0.4, 150/(anim.physicsProfile.mass||75)) : 1;
      anim.motion.vx = dir * (tier.anim.launchSpeed || tier.knockback*100) * massFactor;
      anim.motion.vy = tier.anim.hop * 10 || -100;
      if (tier.min >= 20) anim.motion.grounded = false;
    }
  }
  
  // Store tier for rendering
  anim.impactData = { ...impact, tier, damage: actualDamage };
  
  return { knockback: tier.knockback * 260, dir, tier, fallDirection: tier.anim.fallDirection };
}



/**
 * Heavier alternative to applyHitReaction, for a damage tier that should
 * send the fighter down (App.jsx's IMPACT_TIERS decides which) instead of
 * just a brief flinch-and-slide. Still applies real knockback velocity
 * (same KNOCKBACK_SPEED base, same friction/wall-bounds physics every
 * other motion already goes through — this doesn't add a new physics
 * system, just a much bigger multiplier and a longer animation sequence
 * layered on top) — the fighter genuinely flies back and can carry into
 * the arena wall, then lies down, then slowly gets back up into a held
 * defensive stance (animationStateMachine checks knockdownPhase before
 * anything else, so this pre-empts the normal hit/idle states until it
 * clears). Clears automatically the moment this fighter becomes an
 * attacker again (see the top of queueAction) — the turn engine is never
 * blocked waiting for this to finish playing out.
 */
export function triggerKnockdown(anim, fromX, damage, knockbackMultiplier) {
  anim.hitTimer = HIT_REACT_DURATION;
  anim.flashTimer = FLASH_DURATION;
  anim.lastHitDamage = damage;
  const dir = anim.motion.x >= fromX ? 1 : -1;
  anim.hitDir = dir;
  anim.motion.vx = dir * KNOCKBACK_SPEED * knockbackMultiplier;
  anim.knockdownPhase = "falling";
  anim.knockdownTimer = KNOCKDOWN_FALL_DURATION;
}

/**
 * Degrees to rotate the whole character this frame, on top of its normal
 * pose — a quick stagger in the knockback direction that eases back to
 * upright as anim.hitTimer runs out. 0 once the hit-react window ends.
 */
export function hitStaggerDegrees(anim) {
  if (!anim.hitTimer || anim.hitTimer <= 0) return 0;
  const t = anim.hitTimer / HIT_REACT_DURATION; // 1 -> 0 over the reaction window
  const magnitude = Math.max(0.3, Math.min(1, (anim.lastHitDamage || 0) / 45));
  return (anim.hitDir || 0) * magnitude * MAX_HIT_STAGGER_DEGREES * t;
}

/**
 * Phase 4D, spec section 13 ("combo system"). The spec's own example
 * ("Punch -> Kick -> Uppercut -> ... -> Ground Slam") describes chaining
 * within a single uninterrupted sequence — but this battle loop strictly
 * alternates the two fighters' turns (App.jsx's runLoop: `turn = 1 - turn`
 * every turn, with an API round-trip + ~900ms sleep between them), so by
 * the time a fighter gets to act again their own previous attackPhase has
 * already fully finished. There's no "mid-swing" moment to chain into.
 * What's real and trackable instead: a cross-turn hit streak — the same
 * fighter landing on consecutive turns of their own, opponent's replies in
 * between notwithstanding. That's what this tracks and what Stickman's
 * combo badge / the Debug Panel's combo readout both show. Purely
 * cosmetic — call this AFTER combat has already been resolved, never
 * before, and never let it feed back into damage/hit-chance.
 */
export function registerTurnOutcome(anim, landedHit) {
  anim.comboCount = landedHit ? (anim.comboCount || 0) + 1 : 0;
}

/**
 * Advances one fighter's animation by dt. Returns an "impact" event
 * ({targetKey, damage, result, spawnProjectileFrom}) at most once, timed to
 * when the strike pose is at or near peak forward reach (see
 * MELEE_IMPACT_FRACTION) — the caller (App.jsx) uses that to apply the hit
 * reaction to the defender and/or spawn a projectile.
 */
export function updateAnimation(anim, dt, bounds, homeReturnX, alive = true) {
  updateMotion(anim.motion, dt, bounds);

  if (anim.blockTimer > 0) anim.blockTimer = Math.max(0, anim.blockTimer - dt);
  if (anim.hitTimer > 0) anim.hitTimer = Math.max(0, anim.hitTimer - dt);
  if (anim.flashTimer > 0) anim.flashTimer = Math.max(0, anim.flashTimer - dt);
  if (anim.transformTimer > 0) anim.transformTimer = Math.max(0, anim.transformTimer - dt);

  // Knockdown sequence (triggerKnockdown, above) — advances independently
  // of the attackPhase machinery below, driven by its own timer/phase
  // rather than motion/attack state. A wall hit during "falling"
  // (motion.justHitWall, already current — updateMotion ran above) cuts
  // the fall short into "down" immediately instead of waiting out the
  // full fall duration: hitting a wall should visibly stop the tumble,
  // not let it float through. knockdownWallSlam is a one-shot flag,
  // recomputed fresh every frame, for App.jsx to fire the extra
  // wall-impact VFX on exactly the frame it happens.
  anim.knockdownWallSlam = false;
  if (anim.knockdownPhase) {
    anim.knockdownTimer = Math.max(0, anim.knockdownTimer - dt);
    if (anim.knockdownPhase === "falling" && anim.motion.justHitWall) {
      anim.knockdownWallSlam = true;
      anim.knockdownTimer = 0;
    }
    if (anim.knockdownTimer <= 0) {
      if (anim.knockdownPhase === "falling") {
        anim.knockdownPhase = "down";
        anim.knockdownTimer = KNOCKDOWN_DOWN_DURATION;
      } else if (anim.knockdownPhase === "down") {
        anim.knockdownPhase = "gettingUp";
        anim.knockdownTimer = KNOCKDOWN_GETUP_DURATION;
      } else if (anim.knockdownPhase === "gettingUp") {
        anim.knockdownPhase = "defensive"; // held here — only queueAction (this fighter's own next turn) clears it, not a timer
      }
    }
  }

  let impact = null;

  if (anim.attackPhase) {
    const ap = anim.attackPhase;
    if (ap.phase === "approach") {
      if (!anim.motion.command) {
        if (anim.pendingDescend) {
          // Stage 1 (soar up) just finished — chain straight into stage 2
          // (swoop down to strike height) without leaving "approach", so
          // the state machine keeps reading this as one continuous flight
          // rather than a stop-start.
          issueCommand(anim.motion, "fly", anim.pendingDescend.targetX, anim.pendingDescend.targetY);
          anim.pendingDescend = null;
        } else {
          ap.phase = "windup";
          ap.t = 0;
          anim.motion.speedTrail = false; // the fast dash-in is done — trail only draws during that, not the strike itself
        }
      }
    } else {
      ap.t += dt;
      const dur = ATTACK_DURATIONS[ap.phase] ?? 0.2;

      // Fire the impact when the pose is actually at (or near) its peak
      // forward reach, not at the phase boundary — see
      // MELEE_IMPACT_FRACTION's comment above for why this specific
      // fraction per variant. This is what makes the hit-reaction/damage/
      // particles land in sync with the fist or foot actually arriving,
      // instead of the moment it's still cocked back in the windup pose.
      if (ap.phase === "strike" && anim.pendingImpact) {
        const frac = MELEE_IMPACT_FRACTION[ap.variant] ?? DEFAULT_IMPACT_FRACTION;
        if (ap.t >= dur * frac) {
          impact = anim.pendingImpact;
          anim.pendingImpact = null;
        }
      }

      if (ap.t >= dur) {
        if (ap.phase === "windup") {
          ap.phase = "strike";
          ap.t = 0;
        } else if (ap.phase === "strike") {
          ap.phase = "recovery";
          ap.t = 0;
          // Safety net: a big dt (lag spike) could in principle jump ap.t
          // past the fractional threshold above AND past `dur` in the
          // same call, in which case the block above already consumed
          // pendingImpact and this is a no-op — the null-check is what
          // makes that safe. If it somehow never fired, fire it now
          // rather than losing the hit entirely.
          if (anim.pendingImpact) {
            impact = anim.pendingImpact;
            anim.pendingImpact = null;
          }
          // Previously returned all the way to spawn position here after
          // every single attack — which is what forced a full re-approach
          // (and the resulting stop-start "hit, retreat to opposite
          // corners, opponent crosses the whole arena, hit, retreat"
          // rhythm) before the next exchange could even start. A grounded
          // fighter now just settles into idle wherever this attack left
          // them — already at striking range of the opponent, same as a
          // real fight staying "in the pocket" between exchanges instead
          // of resetting to a standoff every turn. Knockback already
          // pushes the defender back a natural amount on a real hit, so
          // spacing still varies — this only removes the artificial
          // full-arena retreat, not all repositioning. A fly/hover
          // attacker still needs to come back down (that's what triggers
          // the landing VFX and returns them to normal grounded idle —
          // without this they'd stay stuck hovering at strike altitude
          // forever) — but straight down at their current position, not a
          // flight back to spawn.
          if (anim.approachStyle === "fly" || anim.approachStyle === "hover") {
            issueCommand(anim.motion, anim.approachStyle, anim.motion.x, anim.motion.groundY);
          }
          anim.approachStyle = null;
        } else {
          anim.attackPhase = null;
        }
      }
    }
  }

  const state = resolveAnimationState({
    alive,
    hitTimer: anim.hitTimer,
    transformTimer: anim.transformTimer,
    knockdownPhase: anim.knockdownPhase,
    attackPhase: anim.attackPhase?.phase === "approach" ? null : anim.attackPhase,
    blocking: anim.blockTimer > 0,
    mode: anim.motion.mode,
    grounded: anim.motion.grounded,
    vx: anim.motion.vx,
    vy: anim.motion.vy,
  });

  return { impact, state };
}
