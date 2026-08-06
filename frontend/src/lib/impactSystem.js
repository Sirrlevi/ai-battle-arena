
// ---------- IMPACT SYSTEM - M1 ----------
// Calculate impact using Weight Class, Density, Speed, Strength, Impact Angle, Hit Location, Terrain, Current Motion
// Produce knockback, launch, wall bounce, ground bounce, stagger, camera shake, debris, cracks, dust

import { weightClassMultiplier } from "./physicsProfile.js";

function normalizeVec(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx/len, y: dy/len };
}

export function calculateImpact({
  attackerPos,
  defenderPos,
  attackerMotion,
  defenderMotion,
  attackerProfile,
  defenderProfile,
  damage,
  attackSpeed = 300,
  hitLocation = 'torso', // head, torso, legs
  terrain = 'flat',
  isDown = false,
}) {
  // Impact vector = Victim - Attacker (normalized) - FIX for Bug1/Bug3
  const rawDx = defenderPos.x - attackerPos.x;
  const rawDy = defenderPos.y - attackerPos.y;
  const impactDir = normalizeVec(rawDx, rawDy * 0.3); // keep mostly horizontal

  // Real physics factors
  const attackerMass = attackerProfile.mass || 75;
  const defenderMass = defenderProfile.mass || 75;
  const attackerDensity = attackerProfile.density || 1.0;
  const defenderDensity = defenderProfile.density || 1.0;
  const strengthFactor = (attackerProfile.derivedFrom?.strength||4)/4; // 0.25-2.5
  const speedFactor = Math.max(0.5, Math.min(2.5, attackSpeed/300));
  const weightMult = weightClassMultiplier(attackerProfile.weightClass);
  const densityFactor = attackerDensity / Math.max(0.1, defenderDensity);

  // Base force
  const baseForce = Math.max(5, damage) * 15; // -22 damage => 330 force as per report
  let knockbackForce = baseForce * strengthFactor * speedFactor * weightMult * densityFactor;

  // If defender is down (sleeping) - Bug4 fix: 1.5x more slide, no pop-up
  if (isDown) {
    knockbackForce *= 1.5;
  }

  // Knockback resistance reduces
  const resistance = defenderProfile.knockbackResistance || 75;
  const resistanceFactor = 75 / Math.max(10, resistance);
  knockbackForce *= resistanceFactor;

  // Impact angle - upper body goes back -> fall on back
  // Front hit -> back fall, Back hit -> front fall
  const attackerFacing = attackerMotion?.facing || (rawDx>=0?1:-1);
  const hitFromFront = (rawDx * attackerFacing) < 0 ? false : true; // if attacker facing defender, it's front
  // Actually simpler: if attacker is left of defender and facing right, it's front hit -> back fall
  // The report says front hit should be back fall always (unless hit from behind)
  const isFrontHit = Math.sign(rawDx) === Math.sign(attackerFacing) || Math.abs(rawDx) < 10;
  const fallDirection = isFrontHit ? 'back' : 'front'; // back = peeth ke bal

  // Hit location affects torque
  let torque = 0;
  if (hitLocation === 'head') torque = isFrontHit ? -1 : 1;
  else if (hitLocation === 'torso') torque = isFrontHit ? -0.8 : 0.6;
  else torque = isFrontHit ? -0.3 : 0.3;

  // Current motion adds to knockback
  const defenderVelFactor = (defenderMotion?.vx||0) * 0.1;
  knockbackForce += Math.abs(defenderVelFactor);

  // Launch velocity
  const launchVelocity = {
    x: impactDir.x * knockbackForce * 0.18,
    y: impactDir.y * knockbackForce * 0.08 - (isDown ? 0 : Math.min(180, knockbackForce*0.15)),
  };

  // Slide distance (especially for down)
  const groundFriction = defenderProfile.collisionBehaviour?.groundFriction || 0.6;
  const slideDistance = isDown 
    ? (knockbackForce / (groundFriction*120)) * 1.5
    : (knockbackForce / (groundFriction*180));

  // Wall bounce threshold
  const willWallBounce = knockbackForce > 280 && !defenderProfile.weightDef?.isEthereal;
  const willGroundBounce = knockbackForce > 400 && !isDown;

  // Camera shake based on force
  const cameraShake = knockbackForce > 500 ? 'large-shake' : knockbackForce > 250 ? 'medium-shake' : knockbackForce > 100 ? 'small-shake' : null;
  const shakeIntensity = Math.min(1.5, knockbackForce/400);

  // Hitstop duration - for juice
  const hitstop = Math.min(120, Math.max(20, damage*2.5 + knockbackForce*0.04)); // ms

  // Debris, cracks, dust
  const debrisCount = Math.floor(Math.min(12, knockbackForce/60));
  const crackIntensity = Math.min(1, knockbackForce/600);
  const dustAmount = isDown ? Math.min(1, slideDistance/100) : Math.min(0.8, knockbackForce/500);

  // Stagger duration
  const stagger = Math.min(0.8, knockbackForce/800);

  // Landing force for defender
  const landingForce = defenderProfile.mass * Math.abs(launchVelocity.y) * 0.001;

  return {
    impactDir,
    impactForce: knockbackForce,
    knockbackForce,
    launchVelocity,
    fallDirection, // 'back' or 'front' - FIXES Bug1 & Bug3
    torque,
    slideDistance,
    isDown,
    willWallBounce,
    willGroundBounce,
    cameraShake,
    shakeIntensity,
    hitstop,
    debrisCount,
    crackIntensity,
    dustAmount,
    stagger,
    landingForce,
    isFrontHit,
    // For animation controller
    shouldBackFall: fallDirection==='back',
    shouldSlide: isDown,
    noPopUp: isDown, // Bug4 fix
  };
}

// For use in animationController to set correct fall animation
export function getFallAnimation(impact) {
  if (impact.isDown) {
    return {
      animation: 'slide',
      direction: impact.impactDir.x,
      distance: impact.slideDistance,
      duration: Math.min(1.2, impact.slideDistance/80 + 0.3),
      noGetUp: 0.8, // seconds before allow get up
    };
  }
  if (impact.shouldBackFall) {
    return {
      animation: 'backFall',
      direction: impact.impactDir.x,
      isBackFall: true,
      isFaceFall: false,
    };
  } else {
    return {
      animation: 'frontFall',
      direction: impact.impactDir.x,
      isBackFall: false,
      isFaceFall: true,
    };
  }
}

// Juice effects
export function getHitJuice(impact) {
  return {
    hitstop: impact.hitstop,
    cameraShake: impact.cameraShake,
    shakeIntensity: impact.shakeIntensity,
    squashStretch: { x: 1.2, y: 0.8, duration: 80 },
    particles: {
      hitSpark: true,
      debris: impact.debrisCount,
      dust: impact.dustAmount,
    },
    attackerRecoil: impact.impactForce * 0.08, // attacker thoda piche
  };
}
