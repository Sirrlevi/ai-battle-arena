
export const WEIGHT_CLASSES = {
  Tiny: { mass: 8, density: 0.4, label: 'Tiny' },
  Light: { mass: 45, density: 0.9, label: 'Light' },
  Medium: { mass: 75, density: 1.0, label: 'Medium' },
  Heavy: { mass: 140, density: 1.2, label: 'Heavy' },
  Titan: { mass: 450, density: 1.6, label: 'Titan' },
  Colossal: { mass: 2500, density: 2.2, label: 'Colossal' },
  Planetary: { mass: 15000, density: 3.5, label: 'Planetary' },
  Cosmic: { mass: 50000, density: 0.1, label: 'Cosmic', isCosmic: true },
  Energy: { mass: 35, density: 0.2, label: 'Energy', isEnergy: true },
  Ethereal: { mass: 12, density: 0.05, label: 'Ethereal', isEthereal: true },
};
const TIER_TO_WEIGHT = {
  Human: ['Light','Medium'], 'Peak Human': ['Medium','Heavy'], Superhuman: ['Heavy','Titan'], Building: ['Heavy','Titan'],
  City: ['Titan','Colossal'], Mountain: ['Colossal','Planetary'], Country: ['Colossal','Planetary'],
  Planet: ['Planetary','Cosmic'], Star: ['Planetary','Cosmic'], Galaxy: ['Cosmic','Energy'],
  Universal: ['Cosmic','Energy'], Multiversal: ['Cosmic','Energy','Ethereal'], Conceptual: ['Ethereal','Energy','Cosmic'],
  Narrative: ['Ethereal','Cosmic'], Author: ['Ethereal','Cosmic'],
};
function pickWeightClass(combatProfile, character) {
  const tier = combatProfile?.combatTier || 'Peak Human';
  const options = TIER_TO_WEIGHT[tier] || ['Medium'];
  const strength = combatProfile?.strength ?? 4;
  const durability = combatProfile?.durability ?? 4;
  const species = (combatProfile?.species || character?.species || '').toLowerCase();
  const persona = `${character?.name||''} ${character?.combatStyle||''} ${combatProfile?.species||''}`.toLowerCase();
  if (species.includes('ghost')||species.includes('spirit')||species.includes('wraith')||persona.includes('ethereal')||persona.includes('intangible')) return 'Ethereal';
  if (species.includes('energy')||persona.includes('pure energy')||persona.includes('living light')) return 'Energy';
  if (persona.includes('tiny')||persona.includes('fairy')||persona.includes('pixie')) return 'Tiny';
  const score = (strength + durability) / 2;
  if (score >= 8 && options.length >1) return options[options.length-1];
  if (score <= 3 && options.length >1) return options[0];
  return options[Math.floor(options.length/2)] || 'Medium';
}
function deriveBodyType(combatProfile, character) {
  const s = `${combatProfile?.species||''} ${character?.combatStyle||''} ${character?.weapon||''} ${character?.aura||''}`.toLowerCase();
  if (s.includes('robot')||s.includes('mech')||s.includes('cyborg')) return 'mechanical';
  if (s.includes('dragon')||s.includes('beast')||s.includes('monster')) return 'beast';
  if (s.includes('energy')) return 'energy';
  if (s.includes('ghost')||s.includes('spirit')) return 'ethereal';
  if (s.includes('giant')||s.includes('titan')||s.includes('colossal')) return 'giant';
  if (combatProfile?.flight) return 'aerial';
  const mob = combatProfile?.mobility ?? 5;
  if (mob >= 8) return 'agile';
  if ((combatProfile?.strength??4) >= 7) return 'brute';
  return 'humanoid';
}
export function generatePhysicsProfile(combatProfile, character = {}) {
  const weightClassName = pickWeightClass(combatProfile, character);
  const weightDef = WEIGHT_CLASSES[weightClassName];
  const strength = combatProfile?.strength ?? 4;
  const durability = combatProfile?.durability ?? 4;
  const speed = combatProfile?.speed ?? 4;
  const mobility = combatProfile?.mobility ?? 4;
  const combatSkill = combatProfile?.combatSkill ?? 4;
  const densityBase = weightDef.density;
  const density = Math.max(0.05, densityBase * (0.7 + (durability/10)*0.6));
  const massVariance = 0.85 + (strength/10)*0.3;
  const mass = weightDef.mass * massVariance;
  let heightFactor = 1.0;
  if (weightClassName === 'Tiny') heightFactor = 0.55;
  else if (weightClassName === 'Light') heightFactor = 0.9;
  else if (weightClassName === 'Heavy') heightFactor = 1.15;
  else if (weightClassName === 'Titan') heightFactor = 1.45;
  else if (weightClassName === 'Colossal') heightFactor = 1.9;
  else if (weightClassName === 'Planetary') heightFactor = 2.6;
  else if (weightClassName === 'Cosmic') heightFactor = 2.2;
  else if (weightClassName === 'Energy') heightFactor = 1.1;
  else if (weightClassName === 'Ethereal') heightFactor = 1.0;
  heightFactor *= (0.9 + (mobility/10)*0.2);
  const height = 80 * heightFactor;
  const reach = (weightClassName === 'Titan' || weightClassName === 'Colossal') ? 78 : weightClassName === 'Tiny' ? 32 : 52 + (mobility*1.5) + (strength*1.2);
  const balance = Math.min(1, Math.max(0.2, (combatSkill + durability)/20 + (weightClassName==='Ethereal'?0.3:0)));
  const agility = Math.min(1, (speed + mobility)/20 + (weightClassName==='Light'?0.15:0));
  const mobilityNorm = Math.min(1, mobility/10);
  const groundGrip = weightDef.isEthereal ? 0.1 : weightDef.isEnergy ? 0.35 : Math.min(1, 0.3 + (durability/10)*0.5 + (mass/5000));
  const groundPressure = mass / 100;
  const impactResistance = Math.min(0.95, durability/10*0.7 + (mass/10000)*0.3);
  const knockbackResistance = mass * density * (0.5 + balance);
  const landingForce = mass * 0.12;
  const jumpModifier = weightDef.isEthereal ? 2.5 : weightDef.isEnergy ? 1.8 : weightDef.isCosmic ? 1.5 : Math.max(0.4, 1.6 - mass/3000);
  const flightPhysics = { canFly: !!combatProfile?.flight, canHover: !!combatProfile?.flight || (mobility>=8 && speed>=7), lift: combatProfile?.flight ? 1.0 + (mobility/10)*0.5 : 0, drag: weightDef.isEthereal ? 0.02 : weightDef.isEnergy ? 0.08 : 0.12, maxAltitude: combatProfile?.flight ? 300 : 80, airControl: agility * 0.8 + 0.2, };
  const collisionBehaviour = { separationForce: Math.max(4, Math.min(25, mass*0.02 + 5)), wallBounceRestitution: weightDef.isEthereal ? 0.05 : weightDef.isEnergy ? 0.15 : Math.max(0.1, Math.min(0.5, 0.5 - mass/10000)), groundFriction: groundGrip, canOverlap: weightDef.isEthereal, };
  const hitboxScale = heightFactor;
  const centerOfMass = { x: 0, y: -55 };
  const proceduralAnimationPreset = { stanceWidth: 0.85 + (balance*0.3) + (weightClassName==='Heavy'?0.15:0), lean: (strength>=7?-2:2), strideScale: 0.8 + agility*0.4, crouchOnHeavy: weightClassName==='Heavy'||weightClassName==='Titan', };
  const ragdollPreset = { root: 'hips', pivotStiffness: Math.min(0.95, 0.4 + impactResistance*0.5), fallStyle: weightClassName==='Ethereal' ? 'float' : weightClassName==='Energy' ? 'disperse' : 'weighted', hipsAnchor: true, };
  return { weightClass: weightClassName, weightDef, bodyType: deriveBodyType(combatProfile, character), bodySize: heightFactor <0.7?'small':heightFactor>1.8?'huge':heightFactor>1.3?'large':'medium', mass, density, height, reach, balance, mobility: mobilityNorm, agility, groundGrip, groundPressure, impactResistance, knockbackResistance, landingForce, jumpModifier, flightPhysics, collisionBehaviour, hitboxScale, centerOfMass, proceduralAnimationPreset, ragdollPreset, derivedFrom: { tier: combatProfile?.combatTier, strength, durability, speed, mobility }, generatedAt: Date.now(), };
}
export function shouldRegeneratePhysicsProfile(eventType, description='') {
  const text = `${eventType||''} ${description||''}`.toLowerCase();
  const triggers = ['transform','evolve','mutate','fuse','grow','shrink','change form','enlarge','giant','colossal','tiny','new form','ascend'];
  return triggers.some(t=>text.includes(t));
}
export function weightClassMultiplier(weightClass) {
  const map = { Tiny:0.5, Light:0.8, Medium:1.0, Heavy:1.25, Titan:1.6, Colossal:2.1, Planetary:3.0, Cosmic:2.8, Energy:0.9, Ethereal:0.4 };
  return map[weightClass] ?? 1.0;
}
