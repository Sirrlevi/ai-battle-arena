// ---------- ANIMATION STATE MACHINE MODULE ----------
// Not a strict transition table — a priority-ordered list of rules, each
// testing the fighter's current physical/combat context. The first rule
// that matches wins. Adding a new state later (e.g. "Staggered", "Casting")
// is just inserting a new { name, test } entry at the right priority — no
// existing rule has to change.

export const STATES = [
  "dead",
  "transforming",
  "knockdownFalling",
  "knockdownDown",
  "knockdownGettingUp",
  "defensive",
  "hit",
  "attacking",
  "blocking",
  "jumping",
  "falling",
  "flying",
  "hovering",
  "running",
  "walking",
  "idle",
];

const RULES = [
  { name: "dead", test: (ctx) => !ctx.alive },
  { name: "transforming", test: (ctx) => ctx.transformTimer > 0 },
  { name: "knockdownFalling", test: (ctx) => ctx.knockdownPhase === "falling" },
  { name: "knockdownDown", test: (ctx) => ctx.knockdownPhase === "down" },
  { name: "knockdownGettingUp", test: (ctx) => ctx.knockdownPhase === "gettingUp" },
  { name: "defensive", test: (ctx) => ctx.knockdownPhase === "defensive" },
  { name: "hit", test: (ctx) => ctx.hitTimer > 0 },
  { name: "attacking", test: (ctx) => !!ctx.attackPhase },
  { name: "blocking", test: (ctx) => ctx.blocking },
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
