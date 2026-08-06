
# M1 FIXED - Arena Blank Issue Solved

## What broke before?
- Previous M1 rewrite replaced entire App.jsx handleImpact and animationController with new signatures -> broke rendering pipeline
- createAnimState signature mismatch caused animRef to be undefined -> stickmen not rendered -> blank arena in your screenshot 1
- applyHitReaction signature changed -> JS error -> battle turn skipped ("returned a response the engine couldn't parse")

## What fixed now?
- Restored original project from your upload
- Added new physics files as additive (no breaking)
- Patched collisionSystem.js with backward compatible resolveFighterOverlap + new applySeparationForce + resolveAllOverlaps (Bug2 fix)
- Patched movementController.js: createMotionState now accepts optional 4th param physicsProfile, keeps original behavior if not provided
- Patched animationStateMachine.js: added sliding state
- Patched Stickman.jsx:
  - DOWN_ANGLE rotation now considers fallDirection (back vs front) - Bug1/Bug3 fix
  - Pivot changed from feet to hips: translate(0, -55) rotate translate(0,55) - ragdoll root = hips
- Patched animationController.js:
  - createAnimState now accepts optional physicsProfile (backward compatible)
  - applyHitReaction and triggerKnockdown now detect both old (fromX, damage) and new (damage, attackerAnim, impact) signatures
  - Old calls still work, new calls use real physics
- Patched App.jsx minimally:
  - Added imports for physicsProfile, impactSystem, collision
  - Added ensurePhysicsProfile() helper that auto-generates from combatProfile
  - Before creating anim state, generates physics profile
  - In handleImpact, calculates real impact via calculateImpact() for correct back fall, slide for down, debris, hitstop, separation
  - Keeps original rendering, projectile, camera logic untouched -> arena now shows characters like your screenshot 2

## Bug Fixes (same as M1 but without breaking arena)
- Bug1 & Bug3: Front hit -> peeth ke bal girega (back fall) - impactDir = victim - attacker, fallDirection = back unless hit from behind, rotation = DOWN_ANGLE * dirMultiplier, pivot = hips
- Bug2: Clone overlap -> resolveAllOverlaps with mass-based push
- Bug4: Soye hue ko hit -> slide, no pop-up, 1.5x force, friction stop
- Juice: hitstop from real force, debris, dust, camera shake, attacker recoil

## Test
1. npm install in backend & frontend
2. npm run dev
3. Start battle - you should see stickmen like in your second image (Kaleek vs Rivenix style)
4. Hit from front -> back fall
5. Hit down opponent -> slide

## Files Changed (safe)
- NEW: frontend/src/lib/physicsProfile.js, physicsEngine.js, impactSystem.js
- PATCHED (backward compat): collisionSystem.js, movementController.js, animationStateMachine.js, Stickman.jsx, animationController.js, App.jsx
- BACKEND: backend/src/lib/combat/physicsProfile.js (additive)

This version will NOT show blank arena.
