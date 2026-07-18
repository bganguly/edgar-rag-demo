export type Provider = "anthropic" | "openai" | "google" | "nim";

export interface ModelOption {
  id: string;
  label: string;
}

export const PROVIDER_MODELS: Record<Provider, ModelOption[]> = {
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    { id: "claude-sonnet-4-5-20251001", label: "Sonnet 4.5" },
    { id: "claude-opus-4-8", label: "Opus 4.8" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  google: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  nim: [
    { id: "nvidia/llama-3.3-nemotron-super-49b-v1", label: "Nemotron 49B" },
    { id: "meta/llama-3.1-405b-instruct", label: "Llama 3.1 405B" },
    { id: "mistralai/mixtral-8x22b-instruct-v0.1", label: "Mixtral 8x22B" },
  ],
};
