import { getMaterialResistance } from "./materialSystem.js";
import { generatePhysicsProfile } from "./physicsProfile.js";
export function calculateForce({ attackerProfile, defenderProfile, ability, distance, velocity, positions }) {
  const attPhys = generatePhysicsProfile(attackerProfile,{});
  const defPhys = generatePhysicsProfile(defenderProfile,{});
  const strength = attackerProfile?.strength ?? 4;
  const speed = attackerProfile?.speed ?? 4;
  const selfX = positions?.self?.x || 0;
  const enemyX = positions?.enemy?.x || 100;
  const rawDx = enemyX - selfX;
  const dist = Math.abs(rawDx) || 1;
  const momentum = attPhys.mass * (speed*15+50)*0.01;
  const targetResistance = defPhys.knockbackResistance || 75;
  const materialRes = getMaterialResistance('concrete', momentum*10);
  const tierMult = { Human:0.5,'Peak Human':0.7,Superhuman:1,Building:1.4,City:2,Mountain:3,Country:5,Planet:10,Star:20,Galaxy:40,Universal:80,Multiversal:150,Conceptual:300,Narrative:500,Author:1000 }[attackerProfile?.combatTier||'Peak Human'] || 1;
  let force = (strength*8*tierMult + speed*3 + momentum*0.5)*(attackerProfile?.combatSkill*0.1+0.5);
  if (distance?.value>260 && !ability?.isProjectile) force*=0.3;
  const energyTransfer = force * (75/Math.max(10,targetResistance)) * Math.max(0.3, 1-materialRes.resistance*0.001);
  const damage = Math.max(1, Math.round(energyTransfer*0.15));
  return { force, momentum, impactVector:{x:rawDx/dist,y:0}, targetResistance, materialResistance: materialRes.resistance, remainingMomentum: Math.max(0, momentum-energyTransfer*0.1), energyTransfer, damage, attackerPhysics: attPhys, defenderPhysics: defPhys, tierMultiplier:tierMult, side: rawDx>0?'right':'left', distance: dist };
}
