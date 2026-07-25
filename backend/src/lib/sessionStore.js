import { nanoid } from "nanoid";
import { SESSION_TTL_MS } from "../config.js";
import { logger } from "./logger.js";

// sessionId -> { fighters: { A: {provider, model, apiKey}, B: {...} }, createdAt, lastUsedAt }
const sessions = new Map();

export function createSession() {
  const sessionId = nanoid(24);
  sessions.set(sessionId, { fighters: {}, createdAt: Date.now(), lastUsedAt: Date.now() });
  logger.info("session:created", { sessionId });
  return sessionId;
}

export function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  s.lastUsedAt = Date.now();
  return s;
}

export function setFighterConfig(sessionId, fighterKey, config) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  s.fighters[fighterKey] = config; // { provider, model, apiKey }
  s.lastUsedAt = Date.now();
  return true;
}

export function deleteSession(sessionId) {
  return sessions.delete(sessionId);
}

// Periodic sweep of idle sessions so API keys don't sit in memory forever.
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastUsedAt > SESSION_TTL_MS) {
      sessions.delete(id);
      logger.info("session:expired", { sessionId: id });
    }
  }
}, Math.min(SESSION_TTL_MS, 5 * 60 * 1000)).unref();

export function sessionCount() {
  return sessions.size;
}
