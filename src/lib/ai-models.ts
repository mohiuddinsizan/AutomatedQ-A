/** The models an admin can pick in Settings. Safe on server and browser. */
export const MODEL_CHOICES = {
  openai: [
    { id: "gpt-5.4-nano", label: "GPT-5.4 nano — cheapest, fast (recommended)" },
    { id: "gpt-5-nano", label: "GPT-5 nano — very cheap, slower" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 nano — very cheap, no reasoning" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini — better answers, ~5× the cost" },
    { id: "gpt-5-mini", label: "GPT-5 mini — better answers, ~5× the cost" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini — good, mid cost" },
    { id: "gpt-5.4", label: "GPT-5.4 — best quality, expensive" },
  ],
  gemini: [
    { id: "gemini-flash-latest", label: "Gemini Flash (latest) — recommended" },
    { id: "gemini-flash-lite-latest", label: "Gemini Flash Lite — lighter, often less busy" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
} as const;

export type ModelProvider = keyof typeof MODEL_CHOICES;
export const isAllowedModel = (p: ModelProvider, id: string) => MODEL_CHOICES[p].some((m) => m.id === id);
