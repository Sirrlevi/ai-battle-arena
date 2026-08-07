import { loggedFetch } from "./loggedFetch.js";

export async function callAnthropic({ apiKey, model, systemPrompt, userPrompt }) {
  const url = "https://api.anthropic.com/v1/messages";
  const data = await loggedFetch({
    tag: "anthropic",
    provider: "anthropic",
    model,
    url,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    bodyObj: {
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    },
  });

  return (data.content || []).map((b) => b.text || "").join("\n");
}
