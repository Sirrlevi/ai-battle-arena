import { loggedFetch } from "./loggedFetch.js";
import { ProviderError } from "../lib/errors.js";

export async function callGemini({ apiKey, model, systemPrompt, userPrompt }) {
  const m = model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
  const data = await loggedFetch({
    tag: "gemini",
    provider: "gemini",
    model: m,
    url,
    headers: { "content-type": "application/json" },
    bodyObj: {
      contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    },
  });

  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const blockReason = data?.promptFeedback?.blockReason;
    throw new ProviderError(
      `gemini: no candidates returned${blockReason ? ` (blocked: ${blockReason})` : ""}.`,
      { code: "PROVIDER_HTTP_ERROR", status: 422, provider: "gemini", model: m, upstreamStatus: null, upstreamBody: data }
    );
  }
  if (candidate.finishReason === "SAFETY") {
    throw new ProviderError(`gemini: response was blocked by safety filters (finishReason: SAFETY).`, {
      code: "PROVIDER_HTTP_ERROR",
      status: 422,
      provider: "gemini",
      model: m,
      upstreamStatus: null,
      upstreamBody: data,
    });
  }

  return candidate.content?.parts?.map((p) => p.text).join("\n") || "";
}
