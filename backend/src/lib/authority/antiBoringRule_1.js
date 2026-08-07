// ---------- ANTI-BORING RULE MODULE ----------
// Even under full AI Authority, a fighter declaring "I instantly win" ends
// the game and the fun. This module (a) supplies the prompt instruction
// that discourages it up front, and (b) softens a claim after the fact if
// the LLM ignores that instruction anyway.

export const ANTI_BORING_PROMPT_CLAUSE =
  "Even with great or unlimited power, do not declare instant, absolute outcomes " +
  '(e.g. "I instantly win", "I erase everything", "the battle is over"). ' +
  "Prefer creative escalation, adaptation, counterplay, and interesting interactions " +
  "over ending the fight in one uninterruptible move.";

const INSTANT_WIN_PATTERNS = [
  /instantly win/i,
  /i (automatically )?win/i,
  /erase (everything|the opponent|all existence)/i,
  /battle (is )?over/i,
  /instantly kill/i,
  /one[- ]?shot/i,
  /game over/i,
];

export function looksLikeInstantWinClaim(text) {
  return INSTANT_WIN_PATTERNS.some((re) => re.test(text || ""));
}

/**
 * If a reality event's narrative claim reads as an instant/absolute win,
 * cap its severity instead of rejecting it outright — the fighter still
 * gets an escalated, powerful moment, just not a game-ending one.
 */
export function softenIfInstantWin(realityEvent) {
  if (!looksLikeInstantWinClaim(`${realityEvent.rawClaim || ""}`)) return realityEvent;
  return {
    ...realityEvent,
    intensity: "extreme",
    softened: true,
    softenNote: 'Claim read as an instant/absolute outcome — capped to "extreme" instead of guaranteed victory to keep the battle going.',
  };
}
