function ts() {
  return new Date().toISOString();
}

// Redacts anything that looks like a credential so API keys never hit stdout/log files.
function redact(obj) {
  if (obj == null) return obj;
  if (typeof obj === "string") return obj;
  try {
    return JSON.parse(
      JSON.stringify(obj, (key, value) => {
        if (/key|authorization|token|secret/i.test(key) && typeof value === "string") {
          return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-2)} (redacted)` : "(redacted)";
        }
        return value;
      })
    );
  } catch {
    return obj;
  }
}

function line(level, tag, data) {
  const payload = data !== undefined ? redact(data) : undefined;
  const prefix = `[${ts()}] [${level}] ${tag}`;
  if (payload !== undefined) {
    // eslint-disable-next-line no-console
    console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](prefix, JSON.stringify(payload));
  } else {
    // eslint-disable-next-line no-console
    console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](prefix);
  }
}

export const logger = {
  info: (tag, data) => line("INFO", tag, data),
  warn: (tag, data) => line("WARN", tag, data),
  error: (tag, data) => line("ERROR", tag, data),
};
