
// ---------- ANIMATION STATE MACHINE MODULE - M1 REWRITE ----------
// Priority-ordered rules with new states for physics

export const STATES = [
  "dead",
  "transforming",
  "knockdownFalling",
  "knockdownDown",
  "knockdownGettingUp",
  "sliding", // M1 new: down opponent slide (Bug4)
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
  { name: "sliding", test: (ctx) => ctx.isSliding || ctx.motion?.isSliding },
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
