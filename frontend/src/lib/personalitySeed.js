// ---------- PERSONALITY VISUALIZATION SEED ----------
// Phase 4, spec section 14: "Different personas should visibly behave
// differently." The AI never authors animation data, so this derives a
// small, deterministic set of pose-variance numbers from the fighter's own
// generated name + personality string (already produced by character
// generation, unchanged) via a simple string hash — same character always
// gets the same visual signature, two different characters almost always
// get visibly different ones, and nothing here is randomized per-frame.

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 0..1, deterministic, decorrelated across calls with different `salt`. */
function unit(hash, salt) {
  return ((hash ^ Math.imul(salt, 2654435761)) >>> 0) / 4294967295;
}

/**
 * Returns the variance object skeletonRig.js and auraSystem.js consume:
 * idleBobSpeed/Amp (how "twitchy" vs "still" the idle looks), stanceWidth
 * (wide brawler vs narrow duelist), auraPulseSpeed, leanBias (a forward-lean
 * "aggressive" personality vs a neutral/back-leaning "cautious" one).
 */
export function personalitySeed(fighterName, personality) {
  const h = hashString(`${fighterName || ""}::${personality || ""}`);
  return {
    idleBobSpeed: 1.1 + unit(h, 1) * 1.4, // 1.1 - 2.5
    idleBobAmp: 1.5 + unit(h, 2) * 3.5, // 1.5 - 5
    stanceWidth: 0.85 + unit(h, 3) * 0.4, // 0.85 - 1.25
    auraPulseSpeed: 0.8 + unit(h, 4) * 1.4, // 0.8 - 2.2
    leanBias: (unit(h, 5) - 0.5) * 10, // -5 - +5 degrees
  };
}
