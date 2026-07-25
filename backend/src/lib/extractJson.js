export function extractJSON(text) {
  if (!text) return null;
  const stripped = text.trim().replace(/```json/gi, "```").replace(/```/g, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}
