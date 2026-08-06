
// ---------- BACKEND PHYSICS PROFILE - M1 ----------
// Server-side version for combat engine physics readout

export const WEIGHT_CLASSES = {
  Tiny: { mass: 8, density: 0.4 },
  Light: { mass: 45, density: 0.9 },
  Medium: { mass: 75, density: 1.0 },
  Heavy: { mass: 140, density: 1.2 },
  Titan: { mass: 450, density: 1.6 },
  Colossal: { mass: 2500, density: 2.2 },
  Planetary: { mass: 15000, density: 3.5 },
  Cosmic: { mass: 50000, density: 0.1, isCosmic:true },
  Energy: { mass: 35, density: 0.2, isEnergy:true },
  Ethereal: { mass: 12, density: 0.05, isEthereal:true },
};

const TIER_TO_WEIGHT = {
  Human: ['Light','Medium'],
  'Peak Human': ['Medium','Heavy'],
  Superhuman: ['Heavy','Titan'],
  Building: ['Heavy','Titan'],
  City: ['Titan','Colossal'],
  Mountain: ['Colossal','Planetary'],
  Country: ['Colossal','Planetary'],
  Planet: ['Planetary','Cosmic'],
  Star: ['Planetary','Cosmic'],
  Galaxy: ['Cosmic','Energy'],
  Universal: ['Cosmic','Energy'],
  Multiversal: ['Cosmic','Energy','Ethereal'],
  Conceptual: ['Ethereal','Energy','Cosmic'],
  Narrative: ['Ethereal','Cosmic'],
  Author: ['Ethereal','Cosmic'],
};

function pickWeightClass(combatProfile) {
  const tier = combatProfile?.combatTier || 'Peak Human';
  const options = TIER_TO_WEIGHT[tier] || ['Medium'];
  const strength = combatProfile?.strength ?? 4;
  const durability = combatProfile?.durability ?? 4;
  const species = (combatProfile?.species || '').toLowerCase();
  if (species.includes('ghost')||species.includes('spirit')) return 'Ethereal';
  if (species.includes('energy')) return 'Energy';
  const score = (strength+durability)/2;
  if (score>=8 && options.length>1) return options[options.length-1];
  if (score<=3 && options.length>1) return options[0];
  return options[Math.floor(options.length/2)] || 'Medium';
}

export function generateBackendPhysicsProfile(combatProfile) {
  const weightClass = pickWeightClass(combatProfile);
  const def = WEIGHT_CLASSES[weightClass];
  const mass = def.mass * (0.85 + (combatProfile?.strength||4)/10*0.3);
  const density = def.density * (0.7 + (combatProfile?.durability||4)/10*0.6);
  const knockbackResistance = mass * density * (0.5 + (combatProfile?.durability||4)/10);
  return {
    weightClass,
    mass,
    density,
    knockbackResistance,
    isEthereal: !!def.isEthereal,
    isEnergy: !!def.isEnergy,
    isCosmic: !!def.isCosmic,
    tier: combatProfile?.combatTier,
  };
}

export function computeImpactPhysics({ damage, attackerProfile, defenderProfile, attackerTierIndex }) {
  const attPhys = generateBackendPhysicsProfile(attackerProfile);
  const defPhys = generateBackendPhysicsProfile(defenderProfile);
  if (damage<=0) return { knockback:0, impactRadius: attackerProfile?.areaOfEffect?3:1, attackerPhysics: attPhys, defenderPhysics: defPhys };
  
  const baseKnockback = Math.round(Math.min(60, damage * 0.9 + attackerTierIndex * 2));
  // weight class adjustment
  const weightMult = defPhys.isEthereal ? 1.8 : defPhys.isEnergy ? 1.3 : 1.0;
  const massMult = Math.max(0.3, Math.min(1.8, 75 / defPhys.mass));
  const knockback = Math.round(baseKnockback * weightMult * massMult * (1 + (attPhys.mass/5000)));
  
  const impactRadius = attackerProfile?.areaOfEffect ? Math.max(3, Math.round(damage/12)) : 1;
  return {
    knockback,
    impactRadius,
    terrainDamage: damage>25 && attPhys.mass>200,
    attackerPhysics: attPhys,
    defenderPhysics: defPhys,
    massRatio: attPhys.mass / defPhys.mass,
  };
}
