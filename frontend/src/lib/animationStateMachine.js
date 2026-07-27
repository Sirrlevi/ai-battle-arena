// ---------- ANIMATION STATE MACHINE MODULE ----------
// Not a strict transition table — a priority-ordered list of rules, each
// testing the fighter's current physical/combat context. The first rule
// that matches wins. Adding a new state later (e.g. "Staggered", "Casting")
// is just inserting a new { name, test } entry at the right priority — no
// existing rule has to change.

export const STATES = [
  "dead",
  "transforming",
  "hit",
  "attacking",
  "blocking",
  "rolling",
  "crouching",
  "jumping",
  "falling",
  "flying",
  "hovering",
  "running",
  "walking",
  "idle",
];

const ROLL_LIKE_MODES = new Set(["roll", "slide", "backDash", "sideDash"]);

const RULES = [
  { name: "dead", test: (ctx) => !ctx.alive },
  { name: "transforming", test: (ctx) => ctx.transformTimer > 0 },
  { name: "hit", test: (ctx) => ctx.hitTimer > 0 },
  { name: "attacking", test: (ctx) => !!ctx.attackPhase },
  { name: "blocking", test: (ctx) => ctx.blocking },
  { name: "rolling", test: (ctx) => ROLL_LIKE_MODES.has(ctx.mode) },
  { name: "crouching", test: (ctx) => ctx.mode === "crouch" },
  { name: "flying", test: (ctx) => ctx.mode === "fly" },
  { name: "hovering", test: (ctx) => ctx.mode === "hover" },
  { name: "jumping", test: (ctx) => !ctx.grounded && ctx.vy < 0 },
  { name: "falling", test: (ctx) => !ctx.grounded && ctx.vy >= 0 },
  { name: "running", test: (ctx) => ctx.grounded && Math.abs(ctx.vx) > 180 },
  { name: "walking", test: (ctx) => ctx.grounded && Math.abs(ctx.vx) > 4 },
  { name: "idle", test: () => true },
];

export function resolveAnimationState(ctx) {
  for (const rule of RULES) {
    if (rule.test(ctx)) return rule.name;
  }
  return "idle";
}
