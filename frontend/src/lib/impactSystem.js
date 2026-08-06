
import { weightClassMultiplier } from "./physicsProfile.js";
function normalizeVec(dx, dy){ const len=Math.hypot(dx,dy)||1; return {x:dx/len,y:dy/len}; }
export function calculateImpact({ attackerPos, defenderPos, attackerMotion, defenderMotion, attackerProfile, defenderProfile, damage, attackSpeed=300, hitLocation='torso', terrain='flat', isDown=false }){
  const rawDx = defenderPos.x - attackerPos.x;
  const rawDy = (defenderPos.y - attackerPos.y)*0.3;
  const impactDir = normalizeVec(rawDx, rawDy);
  const attackerMass = attackerProfile?.mass||75;
  const defenderMass = defenderProfile?.mass||75;
  const attackerDensity = attackerProfile?.density||1.0;
  const defenderDensity = defenderProfile?.density||1.0;
  const strengthFactor = (attackerProfile?.derivedFrom?.strength||4)/4;
  const speedFactor = Math.max(0.5, Math.min(2.5, attackSpeed/300));
  const weightMult = weightClassMultiplier(attackerProfile?.weightClass||'Medium');
  const densityFactor = attackerDensity / Math.max(0.1, defenderDensity);
  const baseForce = Math.max(5, damage)*15;
  let knockbackForce = baseForce * strengthFactor * speedFactor * weightMult * densityFactor;
  if (isDown) knockbackForce*=1.5;
  const resistance = defenderProfile?.knockbackResistance||75;
  const resistanceFactor = 75 / Math.max(10, resistance);
  knockbackForce*=resistanceFactor;
  const attackerFacing = attackerMotion?.facing || (rawDx>=0?1:-1);
  const isFrontHit = true; // front hit is default - back fall
  // If attacker behind defender, it's front fall (rare)
  const defenderFacing = defenderMotion?.facing || -attackerFacing;
  const behind = (rawDx * defenderFacing) > 0; // if defender facing away from attacker, hit from behind
  const fallDirection = behind ? 'front' : 'back';
  let torque = fallDirection==='back' ? -0.8 : 0.6;
  const launchVelocity = { x: impactDir.x * knockbackForce * 0.18, y: impactDir.y * knockbackForce * 0.08 - (isDown?0:Math.min(180, knockbackForce*0.15)) };
  const groundFriction = defenderProfile?.collisionBehaviour?.groundFriction||0.6;
  const slideDistance = isDown ? (knockbackForce / (groundFriction*120))*1.5 : (knockbackForce / (groundFriction*180));
  const willWallBounce = knockbackForce>280 && !defenderProfile?.weightDef?.isEthereal;
  const willGroundBounce = knockbackForce>400 && !isDown;
  const cameraShake = knockbackForce>500?'large-shake':knockbackForce>250?'medium-shake':knockbackForce>100?'small-shake':null;
  const shakeIntensity = Math.min(1.5, knockbackForce/400);
  const hitstop = Math.min(120, Math.max(20, damage*2.5 + knockbackForce*0.04));
  const debrisCount = Math.floor(Math.min(12, knockbackForce/60));
  const crackIntensity = Math.min(1, knockbackForce/600);
  const dustAmount = isDown ? Math.min(1, slideDistance/100) : Math.min(0.8, knockbackForce/500);
  const stagger = Math.min(0.8, knockbackForce/800);
  const landingForce = (defenderProfile?.mass||75) * Math.abs(launchVelocity.y) * 0.001;
  return { impactDir, impactForce: knockbackForce, knockbackForce, launchVelocity, fallDirection, torque, slideDistance, isDown, willWallBounce, willGroundBounce, cameraShake, shakeIntensity, hitstop, debrisCount, crackIntensity, dustAmount, stagger, landingForce, isFrontHit: !behind, shouldBackFall: fallDirection==='back', shouldSlide:isDown, noPopUp:isDown };
}
export function getFallAnimation(impact){
  if (impact.isDown) return { animation:'slide', direction:impact.impactDir.x, distance:impact.slideDistance, duration:Math.min(1.2, impact.slideDistance/80+0.3), noGetUp:0.8 };
  if (impact.shouldBackFall) return { animation:'backFall', direction:impact.impactDir.x, isBackFall:true, isFaceFall:false };
  return { animation:'frontFall', direction:impact.impactDir.x, isBackFall:false, isFaceFall:true };
}
export function getHitJuice(impact){ return { hitstop:impact.hitstop, cameraShake:impact.cameraShake, shakeIntensity:impact.shakeIntensity, squashStretch:{x:1.2,y:0.8,duration:80}, particles:{hitSpark:true,debris:impact.debrisCount,dust:impact.dustAmount}, attackerRecoil:impact.impactForce*0.08 }; }
