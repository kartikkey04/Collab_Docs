/**
 * ai.service.ts
 *
 * AI writing assistance powered by Groq API (FREE tier: console.groq.com).
 *
 * ACTIONS:
 *   rewrite      — rewrite selected text per an instruction (or generally clearer)
 *   summarise    — produce a concise summary of the selection
 *   autocomplete — continue the text naturally from where it ends
 *   fix_grammar  — correct grammar/spelling without changing meaning
 *
 * STREAMING:
 *   Returns an async generator that yields text chunks from the API.
 *   The route handler pipes these chunks to the client via Server-Sent Events.
 *   This gives instant feedback — the user sees words appearing as they arrive.
 *
 * RATE LIMITING:
 *   Each action is guarded by the existing HTTP rate limiter (per-IP).
 *   Groq is FREE for light use (30 RPM, 14k TPM); add your key to env as GROQ_API_KEY.
 *
 * SETUP:
 *   1. Signup: https://console.groq.com → "API Keys" → Copy key.
 *   2. env.js: export const GROQ_API_KEY = "gsk_...";
 *   3. Limits: https://console.groq.com → Dashboard.
 */

import { config } from "../../config/env.js";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";

type AiAction = "rewrite" | "summarise" | "autocomplete" | "fix_grammar";

const SYSTEM_PROMPTS: Record<AiAction, string> = {
  rewrite:      "Rewrite the following text to be clearer and more concise. Output ONLY the rewritten text, no explanation or extra text.",
  summarise:    "Summarise the following text in 2-3 sentences. Output ONLY the summary, no explanation or extra text.",
  autocomplete: "Continue the following text naturally in 1-3 sentences. Output ONLY the continuation, do not repeat the original text.",
  fix_grammar:  "Fix all grammar, spelling and punctuation in the following text without changing the meaning. Output ONLY the corrected text, no explanation or extra text.",
};

export async function* streamAiAction(
  action: AiAction,
  selection: string,
  instruction?: string,
): AsyncGenerator<string> {
  let systemPrompt = SYSTEM_PROMPTS[action];
  if (action === "rewrite" && instruction) {
    systemPrompt += ` Specific instruction: "${instruction}"`;
  }

  const response = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.xaiApiKey}`,  // Set in env.js as GROQ_API_KEY
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",  // FREE & blazing fast (500+ tokens/sec)
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: selection },
      ],
      max_tokens: 1024,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok || !response.body) {
    const err = await response.text().catch(() => "Unknown error");
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith("data: ")) continue;
      const data = trimmedLine.slice(6).trim();
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        if (parsed.choices?.[0]?.delta?.content) {
          const delta = parsed.choices[0].delta.content;
          if (delta) yield delta;
        }
      } catch {
        /* skip malformed lines */
      }
    }
  }
}
