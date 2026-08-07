// ---------- POWER CATALOG (Phase 5, spec item 8) ----------
//
// WHAT THIS IS: a VFX + physics-feel lookup for ~100 common power
// archetypes, keyed by keyword so it slots into the SAME cosmetic-
// classification pipeline actionInterpreter.js / animationController.js
// already use for every action — it does not change how abilities work.
//
// WHAT THIS DELIBERATELY IS NOT: a fixed list the AI has to pick from.
// The whole point of this engine is that each AI freely invents its own
// ability names and flavor text every turn (see promptBuilder.js) — nothing
// here restricts that, and nothing here is sent to the AI. This file only
// helps the RENDERER decide how to *show* whatever the AI already decided,
// the same way the existing (much smaller) EFFECT_KEYWORDS /
// CATEGORY_KEYWORDS / ELEMENT_PROJECTILE_VARIANT lookups elsewhere already
// do — just with far more coverage, and one place to tune it instead of
// four small ones. An ability that matches nothing here still renders
// fine: every call site below falls back to exactly what it did before
// this file existed (posePunch/poseCast, the "orb" projectile shape, the
// existing physics constants) — this file only ever narrows a good-enough
// default down to something more specific, never blocks on a miss.
//
// "Ragdoll": this renderer is hand-authored forward-kinematics, not a
// physics engine, and adding a real one is a genuine architecture change,
// not a data file. What IS real physics-feel data here is `tier`, which
// scales knockback distance, hitstop duration, and the impact-frame
// camera punch/flash intensity (see App.jsx's triggerImpactFrame and
// applyHitReaction's knockback) — i.e. how *hard* a hit reads, which is
// the part of "physics" a per-power data table can actually drive.

export const PHYSICS_TIERS = {
  // Multipliers applied on top of the existing base constants (KNOCKBACK_SPEED
  // in animationController.js, the damage-scaled impact-frame/hitstop curve
  // in App.jsx) — never a replacement for the damage-driven scaling that
  // already exists, just a per-power lean on top of it.
  light: { knockback: 0.75, impact: 0.8 }, // quick, low-commitment (jabs, darts, sparks)
  medium: { knockback: 1.0, impact: 1.0 }, // standard — the default if a power isn't in the catalog at all
  heavy: { knockback: 1.35, impact: 1.25 }, // hard-hitting (slams, blasts, breath weapons)
  massive: { knockback: 1.8, impact: 1.6 }, // overwhelming (ultimates, world-shaking hits)
};

// `shape` is one of Projectile.jsx's existing rendered silhouettes
// (laser | arrow | energy | fireball | ice_shard | lightning_bolt |
// gravity_orb | void_sphere | black_hole | orb — orb is the safe default
// shape for anything without a more specific silhouette). `color`/`glow`
// override that shape's default tint. `particle` is one of
// particleSystem.js's existing emitter types. `cat` is "projectile" |
// "melee" | "teleport" — teleport entries plug into the existing
// TELEPORT_KEYWORD_VARIANT flavor system in animationController.js rather
// than duplicating it.
export const POWER_CATALOG = [
  // ---- Fire ----
  { id: "fireball", cat: "projectile", shape: "fireball", color: "#FF7A45", glow: "#E4443B", particle: "fire", tier: "medium", words: ["fireball", "flame ball", "fire orb"] },
  { id: "flame_wave", cat: "projectile", shape: "energy", color: "#FF8A3D", glow: "#D9432B", particle: "fire", tier: "heavy", words: ["flame wave", "wave of fire", "firestorm"] },
  { id: "inferno_strike", cat: "melee", meleeHint: "punch", color: "#FF6A2E", particle: "fire", tier: "heavy", words: ["inferno strike", "blazing fist", "flame punch"] },
  { id: "phoenix_rising", cat: "projectile", shape: "fireball", color: "#FFB03D", glow: "#FF5A1F", particle: "fire", tier: "massive", words: ["phoenix", "rebirth flame", "rising flame"] },
  { id: "molten_fist", cat: "melee", meleeHint: "punch", color: "#FF7A45", particle: "fire", tier: "heavy", words: ["molten fist", "magma punch", "lava fist"] },

  // ---- Ice / Frost ----
  { id: "ice_shard", cat: "projectile", shape: "ice_shard", color: "#D8F5FF", glow: "#7DC8E8", particle: "ice", tier: "medium", words: ["ice shard", "frost shard", "icicle"] },
  { id: "frost_nova", cat: "projectile", shape: "energy", color: "#BEEFFF", glow: "#6FB8DE", particle: "ice", tier: "heavy", words: ["frost nova", "ice nova", "freezing burst"] },
  { id: "blizzard", cat: "projectile", shape: "energy", color: "#E4FAFF", glow: "#8FD6EE", particle: "ice", tier: "massive", words: ["blizzard", "snowstorm", "arctic storm"] },
  { id: "absolute_zero", cat: "projectile", shape: "void_sphere", color: "#CFF6FF", glow: "#4FA6D8", particle: "ice", tier: "massive", words: ["absolute zero", "deep freeze", "cryo collapse"] },
  { id: "ice_fist", cat: "melee", meleeHint: "punch", color: "#BEEFFF", particle: "ice", tier: "medium", words: ["ice fist", "frozen knuckle", "frost punch"] },

  // ---- Lightning / Electric ----
  { id: "lightning_bolt", cat: "projectile", shape: "lightning_bolt", color: "#FFF6B0", glow: "#7DC8FF", particle: "lightning", tier: "medium", words: ["lightning bolt", "thunderbolt", "lightning strike"] },
  { id: "thunder_clap", cat: "projectile", shape: "energy", color: "#FFEE99", glow: "#5FB8FF", particle: "lightning", tier: "heavy", words: ["thunder clap", "thunderclap", "sonic thunder"] },
  { id: "static_discharge", cat: "melee", meleeHint: "punch", color: "#FFF6B0", particle: "lightning", tier: "light", words: ["static discharge", "shock touch", "electric jolt"] },
  { id: "chain_lightning", cat: "projectile", shape: "lightning_bolt", color: "#C9F0FF", glow: "#8FE1FF", particle: "lightning", tier: "heavy", words: ["chain lightning", "arc lightning", "lightning chain"] },
  { id: "storm_call", cat: "projectile", shape: "energy", color: "#B8D4FF", glow: "#4A6FCC", particle: "lightning", tier: "massive", words: ["storm call", "call down lightning", "thunderstorm"] },

  // ---- Wind / Air ----
  { id: "gale_force", cat: "projectile", shape: "energy", color: "#E8F5EC", glow: "#9FCCA8", particle: "aura_trail", tier: "medium", words: ["gale force", "gust of wind", "wind blast"] },
  { id: "tornado_spin", cat: "melee", meleeHint: "roundhouse", color: "#E8F5EC", particle: "aura_trail", tier: "heavy", words: ["tornado spin", "cyclone kick", "spinning vortex"] },
  { id: "air_slash", cat: "melee", meleeHint: "slash", color: "#F0FFF5", particle: "aura_trail", tier: "medium", words: ["air slash", "wind blade", "cutting wind"] },
  { id: "pressure_wave", cat: "projectile", shape: "energy", color: "#DFF0E8", glow: "#8FC79F", particle: "dust", tier: "heavy", words: ["pressure wave", "shockwave of air", "compressed air blast"] },
  { id: "downdraft_slam", cat: "melee", meleeHint: "uppercut", color: "#E8F5EC", particle: "dust", tier: "heavy", words: ["downdraft", "wind slam", "air slam"] },

  // ---- Earth / Stone ----
  { id: "rock_throw", cat: "projectile", shape: "orb", color: "#8A7358", glow: "#5C4A35", particle: "rock_fragment", tier: "medium", words: ["rock throw", "boulder throw", "stone hurl"] },
  { id: "boulder_smash", cat: "melee", meleeHint: "punch", color: "#8A7358", particle: "rock_fragment", tier: "massive", words: ["boulder smash", "rock crush", "stone crusher"] },
  { id: "earthquake_stomp", cat: "melee", meleeHint: "kick", color: "#6B5A42", particle: "debris", tier: "massive", words: ["earthquake stomp", "ground pound", "seismic stomp"] },
  { id: "stone_spikes", cat: "projectile", shape: "orb", color: "#9A8468", glow: "#6B5A42", particle: "rock_fragment", tier: "heavy", words: ["stone spikes", "rock spikes", "earth spikes"] },
  { id: "landslide", cat: "projectile", shape: "energy", color: "#8A7358", glow: "#4A3D2C", particle: "debris", tier: "massive", words: ["landslide", "rockslide", "avalanche of stone"] },

  // ---- Water ----
  { id: "water_jet", cat: "projectile", shape: "energy", color: "#5AC8E8", glow: "#2E8FBF", particle: "ice", tier: "medium", words: ["water jet", "hydro blast", "water cannon"] },
  { id: "tidal_wave", cat: "projectile", shape: "energy", color: "#3AA8D8", glow: "#1E6F99", particle: "ice", tier: "massive", words: ["tidal wave", "tsunami", "wave crash"] },
  { id: "aqua_whip", cat: "melee", meleeHint: "slash", color: "#5AC8E8", particle: "ice", tier: "medium", words: ["aqua whip", "water whip", "water lash"] },
  { id: "steam_burst", cat: "projectile", shape: "energy", color: "#E8F5FF", glow: "#B8D8E8", particle: "smoke", tier: "medium", words: ["steam burst", "scalding steam", "steam blast"] },
  { id: "geyser", cat: "projectile", shape: "energy", color: "#4AA8D8", glow: "#2E6F99", particle: "ice", tier: "heavy", words: ["geyser", "water eruption", "water spout"] },

  // ---- Shadow / Dark ----
  { id: "shadow_strike", cat: "melee", meleeHint: "slash", color: "#3A2A5A", particle: "energy", tier: "medium", words: ["shadow strike", "dark slash", "shadow blade"] },
  { id: "dark_tendrils", cat: "projectile", shape: "void_sphere", color: "#1A1226", glow: "#B46BFF", particle: "energy", tier: "medium", words: ["dark tendrils", "shadow tendrils", "grasping shadows"] },
  { id: "umbral_blast", cat: "projectile", shape: "void_sphere", color: "#241A33", glow: "#8F4BDE", particle: "energy", tier: "heavy", words: ["umbral blast", "shadow blast", "void blast"] },
  { id: "void_rend", cat: "melee", meleeHint: "slash", color: "#1A1226", particle: "reality_fragment", tier: "heavy", words: ["void rend", "reality tear", "void claw"] },
  { id: "nightmare_grip", cat: "melee", meleeHint: "punch", color: "#2A1A3A", particle: "energy", tier: "medium", words: ["nightmare grip", "dread grasp", "terror touch"] },

  // ---- Light / Holy ----
  { id: "radiant_beam", cat: "projectile", shape: "laser", color: "#FFF6D8", glow: "#FFD966", particle: "energy", tier: "heavy", words: ["radiant beam", "light beam", "holy beam"] },
  { id: "holy_smite", cat: "melee", meleeHint: "uppercut", color: "#FFF0B8", particle: "energy", tier: "heavy", words: ["holy smite", "divine strike", "smite"] },
  { id: "divine_judgment", cat: "projectile", shape: "energy", color: "#FFF6D8", glow: "#FFCC55", particle: "stars", tier: "massive", words: ["divine judgment", "judgment", "wrath of light"] },
  { id: "solar_flare", cat: "projectile", shape: "fireball", color: "#FFDA6B", glow: "#FF9A2E", particle: "fire", tier: "massive", words: ["solar flare", "sunburst", "solar blast"] },
  { id: "purifying_light", cat: "projectile", shape: "energy", color: "#FFFDF0", glow: "#FFE9A8", particle: "healing", tier: "light", words: ["purifying light", "cleansing light", "sacred light"] },

  // ---- Psychic / Mind ----
  { id: "telekinetic_push", cat: "projectile", shape: "energy", color: "#C99CFF", glow: "#8F5CDE", particle: "reality_fragment", tier: "medium", words: ["telekinetic push", "psychic push", "mind push"] },
  { id: "mind_blast", cat: "projectile", shape: "energy", color: "#D9B8FF", glow: "#9C6BE0", particle: "energy", tier: "heavy", words: ["mind blast", "psychic blast", "psionic blast"] },
  { id: "psychic_crush", cat: "melee", meleeHint: "punch", color: "#C99CFF", particle: "reality_fragment", tier: "heavy", words: ["psychic crush", "mental crush", "psionic grip"] },
  { id: "confusion_wave", cat: "projectile", shape: "energy", color: "#E4CCFF", glow: "#B08CE0", particle: "reality_fragment", tier: "light", words: ["confusion wave", "disorient", "mind fog"] },
  { id: "psychic_lance", cat: "projectile", shape: "laser", color: "#C99CFF", glow: "#7C4BC9", particle: "energy", tier: "medium", words: ["psychic lance", "mind spike", "psionic lance"] },

  // ---- Sonic ----
  { id: "sonic_boom", cat: "projectile", shape: "energy", color: "#E8E8F5", glow: "#A8A8D8", particle: "aura_trail", tier: "heavy", words: ["sonic boom", "sound blast", "sonic wave"] },
  { id: "scream_wave", cat: "projectile", shape: "energy", color: "#F0F0FF", glow: "#B8B8E8", particle: "dust", tier: "medium", words: ["scream wave", "sonic scream", "banshee wail"] },
  { id: "sound_pulse", cat: "projectile", shape: "orb", color: "#D8D8F0", glow: "#9898C8", particle: "aura_trail", tier: "light", words: ["sound pulse", "sonic pulse", "echo blast"] },
  { id: "deafening_roar", cat: "melee", meleeHint: "punch", color: "#E8E8F5", particle: "dust", tier: "medium", words: ["deafening roar", "thunderous roar", "war cry"] },
  { id: "resonance_shatter", cat: "projectile", shape: "energy", color: "#F5F5FF", glow: "#C8C8E8", particle: "rock_fragment", tier: "heavy", words: ["resonance shatter", "shattering frequency", "resonant blast"] },

  // ---- Poison / Bio ----
  { id: "venom_spit", cat: "projectile", shape: "orb", color: "#7ED957", glow: "#4A9E2E", particle: "energy", tier: "light", words: ["venom spit", "poison spit", "venom shot"] },
  { id: "toxic_cloud", cat: "projectile", shape: "energy", color: "#8FE05A", glow: "#5CAD35", particle: "smoke", tier: "medium", words: ["toxic cloud", "poison cloud", "noxious gas"] },
  { id: "acid_spray", cat: "projectile", shape: "energy", color: "#B8E85A", glow: "#7CAD2E", particle: "energy", tier: "medium", words: ["acid spray", "corrosive spray", "acid blast"] },
  { id: "plague_touch", cat: "melee", meleeHint: "punch", color: "#6EBF4A", particle: "smoke", tier: "light", words: ["plague touch", "disease touch", "infect"] },
  { id: "corrosive_blast", cat: "projectile", shape: "orb", color: "#9CE85A", glow: "#5C9E2E", particle: "debris", tier: "heavy", words: ["corrosive blast", "acid burst", "melting blast"] },

  // ---- Gravity ----
  { id: "gravity_well", cat: "projectile", shape: "gravity_orb", color: "#9B7BFF", glow: "#4B2E8F", particle: "energy", tier: "heavy", words: ["gravity well", "gravity orb", "gravitational pull"] },
  { id: "crushing_field", cat: "projectile", shape: "gravity_orb", color: "#8A6BE8", glow: "#3A2470", particle: "debris", tier: "massive", words: ["crushing field", "gravity crush", "compression field"] },
  { id: "black_hole", cat: "projectile", shape: "black_hole", color: "#050308", glow: "#FF9A45", particle: "reality_fragment", tier: "massive", words: ["black hole", "singularity", "event horizon"] },
  { id: "meteor_pull", cat: "projectile", shape: "gravity_orb", color: "#A88BFF", glow: "#5C3EAD", particle: "rock_fragment", tier: "massive", words: ["meteor pull", "meteor call", "meteor strike"] },
  { id: "weight_slam", cat: "melee", meleeHint: "punch", color: "#9B7BFF", particle: "debris", tier: "massive", words: ["weight slam", "gravity slam", "crushing weight"] },

  // ---- Metal / Magnetism ----
  { id: "iron_fist", cat: "melee", meleeHint: "punch", color: "#C8CDD6", particle: "debris", tier: "heavy", words: ["iron fist", "steel fist", "metal punch"] },
  { id: "magnetic_pull", cat: "projectile", shape: "gravity_orb", color: "#A8B0C8", glow: "#5C6480", particle: "energy", tier: "medium", words: ["magnetic pull", "magnet pull", "magnetize"] },
  { id: "shrapnel_storm", cat: "projectile", shape: "energy", color: "#B8BFC9", glow: "#6E7688", particle: "debris", tier: "heavy", words: ["shrapnel storm", "shrapnel blast", "metal storm"] },
  { id: "steel_spikes", cat: "projectile", shape: "arrow", color: "#B8BFC9", glow: "#6E7688", particle: "debris", tier: "medium", words: ["steel spikes", "metal spikes", "iron spikes"] },
  { id: "armor_bash", cat: "melee", meleeHint: "uppercut", color: "#C8CDD6", particle: "debris", tier: "heavy", words: ["armor bash", "metallic slam", "steel slam"] },

  // ---- Nature / Plant ----
  { id: "vine_whip", cat: "melee", meleeHint: "slash", color: "#5FAD3E", particle: "aura_trail", tier: "medium", words: ["vine whip", "vine lash", "thorned vine"] },
  { id: "thorn_barrage", cat: "projectile", shape: "arrow", color: "#6EBF4A", glow: "#3A7A24", particle: "debris", tier: "medium", words: ["thorn barrage", "thorn volley", "spike barrage"] },
  { id: "root_snare", cat: "projectile", shape: "energy", color: "#5FAD3E", glow: "#2E5C1A", particle: "debris", tier: "light", words: ["root snare", "entangling roots", "root trap"] },
  { id: "overgrowth", cat: "projectile", shape: "energy", color: "#7ED957", glow: "#3A7A24", particle: "aura_trail", tier: "heavy", words: ["overgrowth", "wild growth", "bloom burst"] },
  { id: "spore_cloud", cat: "projectile", shape: "energy", color: "#B8D96E", glow: "#7A9E3A", particle: "smoke", tier: "light", words: ["spore cloud", "spore burst", "fungal cloud"] },

  // ---- Physical enhancement ----
  { id: "super_strength_punch", cat: "melee", meleeHint: "punch", color: "#FFD9A0", particle: "debris", tier: "massive", words: ["super strength", "mighty punch", "overwhelming punch"] },
  { id: "berserker_slam", cat: "melee", meleeHint: "uppercut", color: "#FF9A6B", particle: "debris", tier: "massive", words: ["berserker slam", "rage slam", "berserk strike"] },
  { id: "iron_grip_throw", cat: "melee", meleeHint: "uppercut", color: "#E8C89A", particle: "dust", tier: "heavy", words: ["iron grip throw", "grapple throw", "suplex"] },
  { id: "adrenaline_strike", cat: "melee", meleeHint: "punch", color: "#FFB86B", particle: "dust", tier: "heavy", words: ["adrenaline rush", "adrenaline strike", "surge punch"] },
  { id: "crushing_grip", cat: "melee", meleeHint: "punch", color: "#D9B88A", particle: "debris", tier: "heavy", words: ["crushing grip", "bone crush", "vice grip"] },

  // ---- Speed / Time ----
  // `speedster: true` gets the fast-dash + afterimage-trail treatment (see
  // App.jsx/animationController.js) on top of the normal melee pose —
  // genuinely faster movement, not just a different particle color.
  // `special` flags a power that needs its own dedicated mechanic beyond
  // color/tier: "timeStop" briefly freezes and desaturates the opponent
  // while the attacker keeps moving at normal speed (App.jsx), "timeSlow"
  // scales the whole game loop's dt down for a brief real slow-motion
  // window (not a full freeze — see triggerTimeSlow in App.jsx).
  { id: "sonic_dash", cat: "melee", meleeHint: "punch", color: "#8FE1FF", particle: "aura_trail", tier: "medium", speedster: true, words: ["sonic dash", "super speed strike", "blitz punch"] },
  { id: "time_slow", cat: "projectile", shape: "energy", color: "#B8D4FF", glow: "#5C7AC9", particle: "reality_fragment", tier: "medium", special: "timeSlow", words: ["time slow", "slow field", "time dilation"] },
  { id: "blitz_combo", cat: "melee", meleeHint: "roundhouse", color: "#8FE1FF", particle: "aura_trail", tier: "heavy", speedster: true, words: ["blitz combo", "flurry of blows", "rapid strikes"] },
  { id: "afterimage_strike", cat: "melee", meleeHint: "slash", color: "#A8E8FF", particle: "aura_trail", tier: "medium", speedster: true, words: ["afterimage strike", "afterimage", "phantom speed strike"] },
  { id: "flash_step_hit", cat: "melee", meleeHint: "punch", color: "#CFF6FF", particle: "aura_trail", tier: "light", speedster: true, words: ["flash step", "instant step strike", "blink strike"] },
  { id: "time_stop", cat: "melee", meleeHint: "uppercut", color: "#EAF6FF", particle: "reality_fragment", tier: "massive", special: "timeStop", speedster: true, words: ["time stop", "stop time", "frozen moment", "stopped clock"] },
  { id: "quantum_freeze", cat: "melee", meleeHint: "punch", color: "#DCEEFF", particle: "reality_fragment", tier: "heavy", special: "timeStop", speedster: true, words: ["quantum freeze", "temporal freeze", "freeze time"] },
  { id: "temporal_slam", cat: "melee", meleeHint: "punch", color: "#9CC8FF", particle: "aura_trail", tier: "heavy", speedster: true, words: ["temporal slam", "chrono strike", "time-warped punch"] },
  { id: "chrono_pulse", cat: "projectile", shape: "energy", color: "#B8CCFF", glow: "#5C7AC9", particle: "galaxy", tier: "medium", words: ["chrono pulse", "time pulse", "temporal wave"] },

  // ---- Force / Telekinesis ----
  { id: "force_push", cat: "projectile", shape: "energy", color: "#D8D8FF", glow: "#8080C8", particle: "reality_fragment", tier: "medium", words: ["force push", "kinetic push", "force blast"] },
  { id: "kinetic_barrier_bash", cat: "melee", meleeHint: "punch", color: "#C8C8FF", particle: "reality_fragment", tier: "medium", words: ["kinetic barrier", "force barrier bash", "energy shield slam"] },
  { id: "telekinetic_slam", cat: "projectile", shape: "gravity_orb", color: "#B8B8FF", glow: "#6060C0", particle: "debris", tier: "heavy", words: ["telekinetic slam", "psychic slam", "force slam"] },
  { id: "repulsion_blast", cat: "projectile", shape: "energy", color: "#D0D0FF", glow: "#7070D0", particle: "reality_fragment", tier: "heavy", words: ["repulsion blast", "repel blast", "push wave"] },
  { id: "gravity_pin", cat: "projectile", shape: "gravity_orb", color: "#9B7BFF", glow: "#4B2E8F", particle: "reality_fragment", tier: "medium", words: ["gravity pin", "pin down", "weight pin"] },

  // ---- Illusion ----
  { id: "mirror_image_strike", cat: "melee", meleeHint: "slash", color: "#D0C8FF", particle: "reality_fragment", tier: "light", words: ["mirror image", "illusory strike", "duplicate strike"] },
  { id: "phantom_strike", cat: "melee", meleeHint: "punch", color: "#C0B8F0", particle: "reality_fragment", tier: "medium", words: ["phantom strike", "phantom fist", "spectral punch"] },
  { id: "mind_trick", cat: "projectile", shape: "energy", color: "#E0D8FF", glow: "#A090D0", particle: "reality_fragment", tier: "light", words: ["mind trick", "illusion trick", "deceive"] },
  { id: "blinding_flash", cat: "projectile", shape: "energy", color: "#FFFFFF", glow: "#E0E0FF", particle: "stars", tier: "light", words: ["blinding flash", "flashbang", "dazzling light"] },
  { id: "duplicate_feint", cat: "melee", meleeHint: "kick", color: "#D0C8FF", particle: "reality_fragment", tier: "light", words: ["duplicate feint", "clone feint", "decoy strike"] },

  // ---- Blood ----
  { id: "blood_lash", cat: "melee", meleeHint: "slash", color: "#B8202E", particle: "blood", tier: "medium", words: ["blood lash", "blood whip", "crimson lash"] },
  { id: "hemorrhage_strike", cat: "melee", meleeHint: "slash", color: "#9E1826", particle: "blood", tier: "heavy", words: ["hemorrhage strike", "rend strike", "bleeding cut"] },
  { id: "crimson_drain", cat: "projectile", shape: "orb", color: "#B8202E", glow: "#6E0F1A", particle: "blood", tier: "medium", words: ["crimson drain", "blood drain", "life drain"] },
  { id: "blood_spikes", cat: "projectile", shape: "arrow", color: "#9E1826", glow: "#5C0E15", particle: "blood", tier: "medium", words: ["blood spikes", "crimson spikes", "gore spikes"] },
  { id: "life_siphon", cat: "melee", meleeHint: "punch", color: "#B8202E", particle: "blood", tier: "medium", words: ["life siphon", "vampiric strike", "blood siphon"] },

  // ---- Energy / Tech ----
  { id: "plasma_cannon", cat: "projectile", shape: "laser", color: "#7DE8FF", glow: "#2E9ED8", particle: "energy", tier: "heavy", words: ["plasma cannon", "plasma blast", "plasma beam"] },
  { id: "energy_blade", cat: "melee", meleeHint: "slash", color: "#B4E84A", particle: "energy", tier: "medium", words: ["energy blade", "photon blade", "laser sword"] },
  { id: "overcharge_blast", cat: "projectile", shape: "energy", color: "#FFF06B", glow: "#FF9A2E", particle: "lightning", tier: "massive", words: ["overcharge blast", "overcharge", "power surge blast"] },
  { id: "railgun_shot", cat: "projectile", shape: "laser", color: "#D8F0FF", glow: "#7DC8E8", particle: "energy", tier: "massive", words: ["railgun", "rail shot", "hypersonic shot"] },
  { id: "pulse_cannon", cat: "projectile", shape: "orb", color: "#B4E84A", glow: "#6EAD2E", particle: "energy", tier: "heavy", words: ["pulse cannon", "energy pulse", "pulse blast"] },
];

/**
 * Finds the best-matching catalog entry for a resolved action's flavor
 * text, or null on a miss (callers already have their own good-enough
 * fallback for that — see actionInterpreter.js / animationController.js).
 * Longer keyword phrases are checked first so a more specific match
 * ("chain lightning") wins over a shorter one that happens to be a
 * substring of it ("lightning").
 */
const SORTED_CATALOG = [...POWER_CATALOG].sort((a, b) => {
  const maxLenA = Math.max(...a.words.map((w) => w.length));
  const maxLenB = Math.max(...b.words.map((w) => w.length));
  return maxLenB - maxLenA;
});

export function matchPower(abilityName, description) {
  const text = `${abilityName || ""} ${description || ""}`.toLowerCase();
  for (const entry of SORTED_CATALOG) {
    if (entry.words.some((w) => text.includes(w))) return entry;
  }
  return null;
}
