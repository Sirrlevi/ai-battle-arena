import { loggedFetch } from "./loggedFetch.js";

const ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  grok: "https://api.x.ai/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

export async function callOpenAICompatible({ provider, apiKey, model, systemPrompt, userPrompt, referer }) {
  const url = ENDPOINTS[provider];
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    // Recommended by OpenRouter so requests are attributed and not deprioritized/blocked.
    headers["HTTP-Referer"] = referer || "https://ai-battle-arena.local";
    headers["X-Title"] = "AI Battle Arena";
  }

  const data = await loggedFetch({
    tag: provider,
    provider,
    model,
    url,
    headers,
    bodyObj: {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
  });

  return data?.choices?.[0]?.message?.content || "";
}
