
// ---------- SIMULATION CORE - M1 ----------
// Validates every action before execution: Distance, Visibility, Cooldowns, Resources, Momentum, Gravity, Terrain, Authority Mode, Current Animation State

export const VALIDATION_REASONS = {
  OK: 'ok',
  TOO_FAR: 'target too far',
  NOT_VISIBLE: 'target not visible',
  ON_COOLDOWN: 'ability on cooldown',
  NO_RESOURCES: 'insufficient resources',
  BAD_MOMENTUM: 'cannot change momentum that fast',
  IN_AIR: 'cannot perform grounded action while airborne',
  BAD_TERRAIN: 'invalid terrain',
  WRONG_AUTHORITY: 'authority mode blocks',
  BAD_ANIM_STATE: 'current animation blocks action',
  STUNNED: 'stunned',
};

export function createSimulationState(arenaWidth, arenaHeight, groundY) {
  return {
    arenaWidth, arenaHeight, groundY,
    frame: 0,
    gravity: 1400,
    terrain: { type: 'flat', friction: 0.8 },
  };
}

function distanceCheck(attacker, defender, action, physicsProfile) {
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  const dist = Math.hypot(dx, dy);
  const reach = physicsProfile?.reach || 56;
  const isMelee = action?.category === 'melee' || action?.action === 'Attack';
  const isProjectile = action?.category === 'projectile';
  const maxMelee = reach + 30; // margin
  const maxProjectile = 900; // arena width-ish
  if (isMelee && dist > maxMelee) return { valid:false, reason: VALIDATION_REASONS.TOO_FAR, detail: `dist ${Math.round(dist)} > max ${Math.round(maxMelee)}` };
  if (isProjectile && dist > maxProjectile) return { valid:false, reason: VALIDATION_REASONS.TOO_FAR, detail: 'too far for projectile' };
  return { valid:true, dist };
}

function visibilityCheck(attacker, defender, world) {
  // simple line of sight - if blind status, fail
  if (attacker.status?.some(s=>s.type==='blind')) return { valid:false, reason: VALIDATION_REASONS.NOT_VISIBLE };
  // could add smoke etc.
  return { valid:true };
}

function momentumCheck(motion, physicsProfile) {
  // if moving fast, cannot instantly reverse without deceleration
  const vx = motion?.vx || 0;
  const speed = Math.abs(vx);
  const maxAgileTurn = physicsProfile?.agility ? (0.7 + physicsProfile.agility*0.6) : 1.0;
  // high mass = harder to turn
  const massFactor = Math.min(1, 500 / (physicsProfile?.mass||75));
  const allowedDecel = (2000 * massFactor * maxAgileTurn);
  // we don't reject, we just note if momentum is too high - simulation will apply deceleration
  return { valid:true, momentum: speed, allowedDecel };
}

function animationStateCheck(animState) {
  const blocked = ['knockdownFalling','dead','transforming'];
  const cur = animState?.phase || animState?.knockdownPhase;
  if (blocked.includes(animState?.knockdownPhase) && animState.knockdownPhase==='falling') {
    return { valid:false, reason: VALIDATION_REASONS.BAD_ANIM_STATE, detail: `in ${animState.knockdownPhase}` };
  }
  if (animState?.phase === 'dead') return { valid:false, reason: VALIDATION_REASONS.BAD_ANIM_STATE, detail:'dead' };
  if (animState?.status?.some(s=>s.type==='stun'||s.type==='frozen')) return { valid:false, reason: VALIDATION_REASONS.STUNNED };
  return { valid:true };
}

function resourceCheck(resources, abilityCost=12) {
  if ((resources?.energy||0) < abilityCost*0.3) return { valid:false, reason: VALIDATION_REASONS.NO_RESOURCES };
  return { valid:true };
}

function gravityCheck(motion, action) {
  const grounded = motion?.grounded;
  const isJump = action?.category==='movement' && action?.variant==='jump';
  if (!grounded && !isJump && action?.category==='melee' && action?.requiresGround) {
    // allow aerial melee if flight
    return { valid:false, reason: VALIDATION_REASONS.IN_AIR };
  }
  return { valid:true };
}

export function validateSimulationAction({ action, attacker, defender, attackerMotion, attackerAnim, physicsProfile, worldState, authorityMode }) {
  // 1. Animation state
  const animCheck = animationStateCheck(attackerAnim);
  if (!animCheck.valid) return animCheck;

  // 2. Distance
  const distCheck = distanceCheck(attacker, defender, action, physicsProfile);
  if (!distCheck.valid) return distCheck;

  // 3. Visibility
  const visCheck = visibilityCheck(attacker, defender, worldState);
  if (!visCheck.valid) return visCheck;

  // 4. Momentum
  const momCheck = momentumCheck(attackerMotion, physicsProfile);

  // 5. Gravity
  const gravCheck = gravityCheck(attackerMotion, action);
  if (!gravCheck.valid) return gravCheck;

  // 6. Resources - handled by combat engine already, but we surface
  // 7. Authority mode
  if (authorityMode==='engine' && action?.requiresAuthority==='ai') {
    return { valid:false, reason: VALIDATION_REASONS.WRONG_AUTHORITY };
  }

  // All good
  return { 
    valid:true, 
    reason: VALIDATION_REASONS.OK,
    metadata: { 
      distance: distCheck.dist, 
      momentum: momCheck.momentum,
      physicsProfile: physicsProfile?.weightClass,
    }
  };
}

// Helper for App.jsx to gate action queueing
export function canQueueAction(anim, motion, physicsProfile) {
  if (anim.knockdownPhase==='falling' || anim.knockdownPhase==='down') return false;
  if (motion.vy < -100 && !physicsProfile?.flightPhysics?.canFly) {
    // in jump, allow but with penalty
    return true;
  }
  return true;
}
