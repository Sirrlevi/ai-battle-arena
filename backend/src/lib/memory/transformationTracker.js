// ---------- TRANSFORMATION TRACKER MODULE ----------
// Logs form changes / power evolutions as they're detected (via the Reality
// Interpreter's eventType classification, see lib/authority/). Kept as its
// own short list rather than folded into Power Memory because a
// transformation changes the fighter's *state* going forward (current
// form), not just their move list.

export function createTransformationMemory() {
  return { currentForm: "base", history: [] }; // history: [{round, form, trigger}]
}

export function recordTransformation(transformationMemory, { round, form, trigger }) {
  transformationMemory.currentForm = form || transformationMemory.currentForm;
  transformationMemory.history.push({ round, form: transformationMemory.currentForm, trigger: trigger || "" });
  // Cap history — this is a rare event compared to regular turns, so a
  // small cap is generous while still bounding memory over a long battle.
  if (transformationMemory.history.length > 12) {
    transformationMemory.history = transformationMemory.history.slice(-12);
  }
}
