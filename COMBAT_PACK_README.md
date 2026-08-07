
# 120 Stickman Short-Range Combat Animations - M2 Pack

## Technical Requirements Implemented:
- Simple stickman body (head circle + body lines + limbs) - uses existing RIG system
- Extremely clear and readable poses even at small size - high contrast angles, strong silhouettes
- Strong attack impact frames - hitstop 25-95ms per move, impactFreeze defined
- Exaggerated weight and momentum - rootMotion 4-20px, knockbackMult, mass-based
- Sharp, snappy timing - anticipation 0.06s, windup 0.08s, strike 0.07s, recovery 0.18-0.28s
- Collision-ready - hitbox { activeFrame:0.82, radius:18-22, bone: hand/foot/knee/head }
- Full ragdoll / knockback / stagger / knockdown reactions - via impactSystem.js
- Root motion + in-place versions - rootMotion field, in-place = rootMotion 0
- Light / Medium / Heavy intensity versions - getIntensityVariant() gives 360 total variants
- Smooth combo linking - comboWindow [0.68,0.95], canCancelInto, canLinkMoves()
- High contrast poses - chestLean, waistLean exaggerated for readability
- Impact squash & stretch - squashStretch {x:1.25,y:0.8,duration:hitstop}
- Clean line work suitable for 2D stickman games - uses basePose() + procedural

## Files:
- frontend/src/lib/stickmanCombatPack.js - 120 moves + 360 variants, pose generator, hitbox, combo linking
- frontend/src/lib/combatAnimations.js - integration helper
- Patched: actionInterpreter.js - detects combat move names from AI ability_name
- Patched: characterAnimation.js - poseAttacking now uses combat pack poses

## Attack List - All 120 Implemented:

Basic Punches 1-15:
1. Jab_Light - lead arm 75°, 25ms hitstop, 6px root motion
2. Cross_Medium - rear arm 88°, 40ms
3. Lead Hook_Medium - 110° hook
4. Rear Hook_Medium - 115° hook
5. Uppercut_Heavy - 160° uppercut, 70ms hitstop
6. Overhand_Heavy - 95° overhand
7. Body Jab_Light - body level 60°
8. Body Cross_Medium - 70° body
9. Liver Shot_Medium - 80° liver
10. Short Uppercut_Medium - 140° short
11. Zap Uppercut_Heavy - 168° zap, 75ms
12. Corkscrew Punch_Medium - 90° corkscrew
13. Shovel Hook_Medium - 100° shovel
14. Double Jab_Light - combo, 2 hits
15. Jab-Cross_Medium - combo

Elbows 16-25:
16. Horizontal Elbow_Medium - 130°
17. Diagonal Elbow_Medium - 120° diagonal
18. Upward Elbow_Heavy - 160° upward
19. Spinning Elbow_Heavy - 200° spin, 18px root
20. Elbow to Head_Heavy - 135° head
21. Double Elbow_Heavy - both arms
22. Elbow to Body_Medium - 110° body
23. Rising Elbow_Medium - 150° rising
24. Back Elbow_Medium - 190° back
25. Elbow Combo_Heavy - combo

Head Attacks 26-35:
26. Front Headbutt_Medium - head tilt 25°, 60ms
27. Side Headbutt_Medium - 20°
28. Upward Headbutt_Heavy - 30° upward
29. Head Smash_Heavy - 35° smash
30. Running Headbutt_Heavy - 20px root motion run
31. Headbutt into Clinch_Medium - into clinch
32. Forehead Smash_Heavy - 28°
33. Head Whip_Light - quick whip
34. Double Headbutt_Heavy - combo
35. Headbutt + Knee_Heavy - head + knee combo

Short Range Kicks 36-55:
36. Front Kick_Medium - 80° front
37. Low Front Kick_Light - 60° low
38. Roundhouse Kick_Heavy - 110° roundhouse
39. Low Roundhouse_Medium - 90° low
40. Switch Kick_Medium - switch stance 100°
41. Swing Kick_Medium - 95° swing
42. Axe Kick_Heavy - 80° to -20° axe
43. Knee Strike_Medium - knee 70°
44. Flying Knee_Heavy - 18px jump
45. Side Kick_Heavy - 90° side
46. Hook Kick_Medium - 105° hook
47. Spinning Back Kick_Heavy - 180° spin
48. Low Sweep_Light - 40° sweep
49. Teep Kick_Light - 75° teep
50. Snap Kick_Light - 70° snap
51. Double Low Kick_Medium - combo low
52. Kick to Knee_Medium - 50° knee target
53. Close Head Kick_Heavy - 115° close head
54. Jumping Head Kick_Heavy - 120° jump head
55. Kick + Punch Combo_Medium - kick + punch

Knees 56-65:
56. Straight Knee_Medium - 75° straight
57. Diagonal Knee_Medium - 80° diagonal
58. Flying Knee_Heavy - 85° flying
59. Clinch Knee_Medium - 70° clinch
60. Double Knee_Heavy - both knees
61. Knee to Body_Medium - 65° body
62. Knee to Head_Heavy - 85° head
63. Spinning Knee_Heavy - 170° spin knee
64. Jumping Knee_Heavy - 80° jump
65. Knee + Elbow_Heavy - knee + elbow

Clinch / Grapple 66-80:
66. Shoulder Smash_Medium - shoulder
67. Clinch Punch_Light - short clinch punch
68. Dirty Boxing_Medium - dirty boxing combo
69. Collar Tie Elbow_Medium - collar tie
70. Underhook Punch_Medium - underhook
71. Body Lock Knee_Medium - body lock
72. Thai Clinch Knees_Heavy - thai clinch
73. Head Control Elbow_Medium - head control
74. Frame Elbow_Light - frame
75. Arm Drag Punch_Medium - arm drag
76. Wrist Control Uppercut_Medium - wrist control
77. Clinch Headbutt_Medium - clinch headbutt
78. Break Clinch Counter_Heavy - break counter
79. Short Slam Setup_Heavy - slam setup
80. Clinch Combo_Heavy - clinch combo

Combos 81-110:
81. Jab-Cross-Hook_Heavy - 3-hit
82. Jab-Cross-Uppercut_Heavy
83. Hook-Uppercut-Hook_Heavy
84. Elbow-Knee-Elbow_Heavy
85. Punch-Elbow-Headbutt_Heavy
86. Low Kick-Cross-Hook_Heavy
87. Knee-Elbow-Knee_Heavy
88. Headbutt-Knee-Elbow_Heavy
89. Zap Uppercut-Hook-Cross_Heavy
90. Swing Kick-Punch-Elbow_Heavy
91. Double Jab-Overhand_Medium
92. Body-Uppercut-Hook_Heavy
93. Low Kick-Body-Head Kick_Heavy
94. Clinch Knee-Elbow-Headbutt_Heavy
95. Spin Elbow-Knee-Punch_Heavy
96. Front Kick-Punch_Medium
97. Triple Punch Burst_Medium
98. Elbow-Headbutt-Knee_Heavy
99. 4-Hit Punch Flurry_Heavy
100. Heavy Finisher_Heavy - Punch-Elbow-Knee-Headbutt, 90ms hitstop, 1.8x damage
101. Switch Kick-Cross-Hook_Heavy
102. Low-High Kick Combo_Heavy
103. Punch-Knee-Punch_Heavy
104. Double Elbow + Knee_Heavy
105. Head Kick into Clinch_Heavy
106. Uppercut-Elbow-Uppercut_Heavy
107. Body-Body-Head_Heavy
108. Jab Flurry into Uppercut_Heavy
109. Spinning Backfist into Knee_Heavy
110. Ultimate Close Combo_Heavy - Jab-Cross-Elbow-Knee-Headbutt, 2.0x damage, 95ms hitstop

Extra Stylish 111-120:
111. Superman Punch_Heavy - 20px jump punch
112. Backfist_Medium - backfist
113. Spinning Backfist_Heavy - 190° spin backfist
114. Hammerfist_Heavy - 20° hammer
115. Palm Strike_Medium - palm
116. Ridge Hand_Medium - ridge hand
117. Chop_Medium - chop
118. Double Palm_Heavy - double palm
119. Rising Palm_Medium - rising palm
120. Short Spinning Kick_Medium - short spin kick

Each move has Light/Medium/Heavy variants = 360 total animations.

Naming: AttackName_Intensity e.g. Jab_Light, Uppercut_Heavy, HeavyFinisher_Heavy

Game-ready: All poses clean, readable at small size, strong silhouettes, clear telegraphing, satisfying impact.

Usage:
import { COMBAT_MOVES, getPoseForMove, getMoveByName } from './stickmanCombatPack.js';
const move = getMoveByName('jab');
const pose = getPoseForMove(move, 'strike', 0.85, facing);
