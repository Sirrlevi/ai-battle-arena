// ---------- AUTHORITY MANAGER MODULE ----------
// Owns which Reality Authority mode a session is running under. Default is
// "engine" — the exact behavior every prior phase already has — so a
// session that never touches this system is 100% unaffected. Switching
// modes is an explicit, per-session opt-in.

export const AUTHORITY_MODES = ["engine", "ai", "hybrid"];
export const DEFAULT_AUTHORITY_MODE = "engine";

export function getAuthorityMode(session) {
  return session.authorityMode || DEFAULT_AUTHORITY_MODE;
}

export function setAuthorityMode(session, mode) {
  if (!AUTHORITY_MODES.includes(mode)) return false;
  session.authorityMode = mode;
  return true;
}

export function resetAuthority(session) {
  session.authorityMode = DEFAULT_AUTHORITY_MODE;
  session.refereeEnabled = false;
  session.lastRealityEvent = null;
}

export function getRefereeEnabled(session) {
  return !!session.refereeEnabled;
}

export function setRefereeEnabled(session, enabled) {
  session.refereeEnabled = !!enabled;
}
