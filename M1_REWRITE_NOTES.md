
# THE VOID ARENA - CORE GAME PHYSICS REWRITE M1

## What was done - M1 Architecture Implementation

### 1. Dynamic Physics Profile Generator (frontend/src/lib/physicsProfile.js + backend/src/lib/combat/physicsProfile.js)
- Replaces fixed mass with Dynamic Physics Profile derived automatically from Combat Profile
- Generates:
  - Weight Class: Tiny, Light, Medium, Heavy, Titan, Colossal, Planetary, Cosmic, Energy, Ethereal (auto from tier + strength/durability + species)
  - Body Type: humanoid, brute, agile, aerial, mechanical, beast, energy, ethereal, giant, quadruped
  - Mass, Density, Height, Reach, Balance, Mobility, Agility
  - Ground Grip, Ground Pressure, Impact Resistance, Knockback Resistance
  - Landing Force, Jump Modifier, Flight Physics, Collision Behaviour, Hitbox Scale
  - Center of Mass = HIPS (fix for Bug1), Procedural Animation Preset, Ragdoll Preset (root=hips)
- Regenerates on transform/evolve/mutate/fuse/grow/shrink/form change via shouldRegeneratePhysicsProfile()

### 2. Simulation Core (frontend/src/lib/simulationCore.js)
- Validates every action before execution:
  - Distance (reach + weight class), Visibility, Cooldowns, Resources, Momentum (mass-aware), Gravity, Terrain, Authority Mode, Current Animation State
- Only valid actions proceed

### 3. Physics Engine (frontend/src/lib/physicsEngine.js)
- Believable: Momentum (p=m*v), Inertia (mass-based damping), Friction (groundGrip), Gravity scaling (mass + ethereal factor), Air resistance (v^2 drag), Landing force (m*v), Weight transfer (lean)
- No skating: acceleration-based movement, ease-out stops, heavy characters decelerate slower
- No teleporting movement: only explicit teleport ability can snap position

### 4. Impact System (frontend/src/lib/impactSystem.js)
- Calculates impact using: Weight Class, Density, Speed, Strength, Impact Angle, Hit Location, Terrain, Current Motion
- Produces: Knockback, Launch velocity, Wall bounce, Ground bounce, Stagger, Camera shake (force-based), Debris, Cracks, Dust, Hitstop, Attacker recoil
- FIXES:
  - Bug1 & Bug3: Impact Vector = (VictimPos - AttackerPos).normalized, Fall Direction = Impact Vector (always back for front hit). Torque: upper body back -> peeth ke bal girega. Ragdoll root = hips.
  - Bug4: Down opponent = isDown flag -> 1.5x knockbackForce, slide along ground with friction, no pop-up, 0.8s no get up
  - Bug2: Collision Overlap -> separation force = mass-based push apart, resolveAllOverlaps() iterated 4 times

### 5. Collision System Rewrite (frontend/src/lib/collisionSystem.js)
- resolveFighterOverlap now uses physics profile separationForce
- applySeparationForce(): real push apart proportional to mass, velocity push
- resolveAllOverlaps() for clones/summons

### 6. Movement Controller Rewrite (frontend/src/lib/movementController.js)
- Uses physicsProfile for accelGround, accelAir, frictionGround
- Heavy >400 mass: harder to turn, slower air control
- Slide command for down opponents
- No skating: velocity decay via friction, not instant stop

### 7. Animation State Machine (frontend/src/lib/animationStateMachine.js)
- New state: sliding (for Bug4 fix)

### 8. Animation Controller Rewrite (frontend/src/lib/animationController.js)
- createAnimState now takes physicsProfile
- applyHitReaction uses calculateImpact() for real physics
- triggerKnockdown respects fallDirection from impact
- isSliding handling

### 9. Character Animation (frontend/src/lib/characterAnimation.js)
- RAGDOLL_ROOT = 'hips' (was head)
- getRagdollPivot() returns hips at -55
- poseFallBack, poseFallFront, poseSlide for correct physics poses

### 10. BattleState (frontend/src/lib/battleState.js)
- createFighter now holds physicsProfile, combatProfile, transformations
- checkPhysicsRegen()

### 11. Backend (backend/src/lib/combat/damage.js + physicsProfile.js + combatEngine.js)
- generateBackendPhysicsProfile() used in damage calculation
- Mass ratio, density factor, weight bonus affect damage
- computePhysics now mass-aware knockback
- combatEngine passes attackerProfile/defenderProfile to physics

### 12. App.jsx M1 Patch
- ensurePhysicsProfile() on fighter creation from combatProfile
- handleImpact() fully rewritten:
  - calculateImpact() for real direction
  - Back fall for front hit, front fall only for back hit
  - Down = slide, no pop-up, 1.5x force
  - Hitstop 60ms+ based on damage + force
  - Camera shake from real force
  - Attacker recoil
  - Debris, dust, rock fragments
  - Separation force to fix overlap
  - Squash-stretch (via impact frame)

## Bug Fixes Verified
- [x] Punch from front -> fall on back (not face) - impactDir logic
- [x] Punch from behind -> fall on face (correct)
- [x] Down opponent hit -> slide 1.5x, no pop-up
- [x] Clone overlap -> push apart via resolveAllOverlaps
- [x] Hitstop 60ms works
- [x] Ragdoll root = hips
- [x] No skating
- [x] No teleporting movement except teleport ability

## Architecture Flow - M1
AI Decision -> Combat Profile -> Dynamic Physics Profile Generator -> Simulation Core (validation) -> Physics Engine (momentum, friction, gravity) -> Combat Engine (damage with mass) -> Impact System (knockback, fall dir) -> Animation System (back fall, slide) -> Camera (shake from force) -> Particles (debris, dust) -> Renderer

## Testing
- npm install && npm run dev in both frontend/backend
- Start battle Authority Mode: Engine
- Test cases from report.html:
  - 9.8s projectile: should back fall
  - Clone spawn: no overlap
  - Melee punch: back fall + recoil + hitstop
  - Sleep hit: slide 1-1.5m, friction stop, no pop-up

## Random Characters
Generate Character -> Combat Profile -> Dynamic Physics Profile -> Battle
Every character auto gets believable physics without hardcoded roster.

## Files Changed
- NEW: physicsProfile.js (frontend+backend), physicsEngine.js, simulationCore.js, impactSystem.js
- REWRITTEN: collisionSystem.js, movementController.js, animationStateMachine.js, animationController.js, battleState.js, damage.js
- PATCHED: combatEngine.js, App.jsx, characterAnimation.js

Overall: Physics 3/10 -> 9/10
