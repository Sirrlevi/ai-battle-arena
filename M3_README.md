
# M3 - Damage Tiered Cinematic Reactions + Defensive Stance + Long/Short Range Definitions

## User Request Implemented:

### 1. Damage-based Reaction Tiers (0 to 100+):
- 0-5 damage: Light Tap - same as current flinch, 0.3 knockback, 20ms hitstop, no push
- 5-10: Light Hit - jyada shake, thoda piche 12px, tiny shake, 35ms hitstop, dust 0.2
- 10-20: Solid Hit - 28px piche, stagger, small-shake, 55ms hitstop, dust 0.4, debris 1
- 20-30: Heavy Blow - piche jake pade, real physics launch 180 speed, ragdoll start, medium-shake, 80ms, dust 0.7, debris 3, crack
- 30-40: Crushing Blow - 260 speed, airTime 0.28s, spin 15, wall tak, medium-shake, 100ms, shockwave, crater
- 40-60: Brutal Impact - wall slam, 340 speed, wallBounce, large-shake, 120ms, debris 8, crater
- 60-80: Devastating - ragdoll slam, 460 speed, wall+ground bounce, large-shake, 150ms, slow-mo 0.2, debris 12
- 80-100: Annihilating - 600 speed, full ragdoll, roll, extreme-shake, 180ms, zoom 1.15, slow-mo 0.35
- 100+: Godlike - 800 speed, wall to wall, godlike, 220ms, zoom 1.25, slow-mo 0.5

Each tier has: knockback, stagger, shake, hitstop, camera, anim (lean, crouch, hop, fallDirection, launchSpeed, airTime, spin, ragdoll, wallBounce), vfx (dust, debris, sparks, shockwave, crack, crater, screenFlash, slowMo, zoom)

Physics solid: massFactor, momentum, launchVelocity from impactSystem + damageTier

### 2. Defensive Stance After Fall:
- After knockdownPhase gettingUp, goes to defensive (not idle)
- defensiveTimer 1.2s, stays defensive until AI next move
- updateDefensiveStance(): keeps distance 120px from opponent, moves away if too close, slow movements 60% speed
- queueAction() clears defensive when new attack starts
- So character jaha gira waha se uthe, slow movements ke sath defensive stance le, opponent se duri banake rakhe, jab tak AI next move na kare

### 3. Long vs Short Range Clear Definitions:
- LONG RANGE: laser, beam, ray, heat vision, blast, fireball, energy bolt, arrow, bullet, missile, orb, sphere, wave, shockwave, lightning, ice shard, etc - can hit from far 0-900px, no need to close distance, projectile true
- SHORT RANGE: punch, jab, cross, hook, uppercut, kick, knee, elbow, headbutt, clinch, grapple, stab, slash, etc - MUST close distance to 60px, needsClose true, melee true, approachDistance 56
- classifyRange() function checks keywords
- AI forced to check distance: if short range and distance far, must include movement "close distance to opponent" else projectile

### 4. Character Forge -> Knows Combo Moves:
- COMBO_MOVES_CATALOG = 120 moves list
- getCharacterArchetype(): checks combatStyle + knownPowers keywords count
  - long_range_specialist: longCount > shortCount*1.5
  - hand_to_hand_specialist: shortCount > longCount*1.5
  - hybrid: else
- getAvailableMovesForArchetype():
  - hand_to_hand: primary = all 120, forcedToUseCombos true, comboUsage high, description "You KNOW all 120 close combat moves, MUST use them, forced to use combos not just basic strike"
  - long_range: primary = beams/blasts, secondary = first 30 hand-to-hand, comboUsage low
  - hybrid: mix of 40 combo + beams

### 5. AI Forced to Use Variety:
- recentPowers tracking: if repeated Basic Strike >=2, varietyClause warning: "You have repeated Basic Strike, MUST use different combo move now. Choose from: Jab, Cross, Hook..."
- combo_catalog: first 60 moves sent in user prompt
- attack_range_definitions: long and short definitions sent
- instruction: "NEVER repeat Basic Strike - forced to use variety from combo_catalog"
- System prompt includes comboClause: archetype + description + first 50 combo moves

### Files Changed:
- NEW: frontend/src/lib/damageTiers.js, backend/src/lib/combat/damageTiers.js - 9 tiers
- NEW: frontend/src/lib/attackDefinitions.js, backend/src/lib/combat/attackDefinitions.js - long/short definitions, 120 catalog, archetype
- PATCHED: frontend/src/lib/animationController.js - tiered applyHitReaction, defensive stance handling
- PATCHED: frontend/src/lib/animationStateMachine.js - defensive state
- PATCHED: frontend/src/App.jsx - imports damageTiers, attackDefinitions, tier-based camera shake, impact frames, defensive distance keeping
- PATCHED: backend/src/lib/memory/promptBuilder.js - includes archetype, combo moves, range definitions, forced variety
- PATCHED: backend/src/lib/combat/worldState.js - live positions with side, distance, teleport, isDown
- PATCHED: backend/src/routes/battleTurn.js + decisionEngine.js + frontend/src/api.js + App.jsx - position awareness

### How to Test:
- Hit with 5 damage: small shake, 12px push
- Hit with 15 damage: 28px push, stumble, small-shake camera
- Hit with 25 damage: falls back, launch 180, ragdoll start, medium-shake
- Hit with 45 damage: wall slam, 340 speed, bounce, large-shake, debris 8
- Hit with 70 damage: ragdoll slam, 460 speed, wall+ground bounce, slow-mo
- Hit with 90 damage: catastrophic, 600 speed, roll, zoom, extreme shake
- After fall: gets up slow, defensive stance, keeps 120px distance, slow movement until next AI move
- Long range: AI can shoot from far without closing
- Short range: AI must close to 60px, includes movement "close distance"
- Hand-to-hand character: AI knows 120 moves, forced to use combos, not repeat basic strike

All previous fixes retained: blank arena fixed, position awareness, 120 animations pack.
