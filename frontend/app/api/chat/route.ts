import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

const nim = createOpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY ?? "",
});

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

function pickModel(provider: string, model: string) {
  switch (provider) {
    case "nim":      return nim(model);
    case "openai":   return openai(model);
    case "google":   return google(model);
    default:         return anthropic(model as Parameters<typeof anthropic>[0]);
  }
}

export async function POST(req: Request) {
  const { messages, provider = "anthropic", model, ticker = "" } = await req.json();
  const query = messages.at(-1)?.content ?? "";
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8002";

  let chunks: Array<{ content: string; source: string }> = [];
  let backendError = false;
  try {
    const r = await fetch(`${backendUrl}/api/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, k: 5, ticker }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) chunks = (await r.json()).chunks ?? [];
    else backendError = true;
  } catch { backendError = true; }

  const hasContext = !backendError && chunks.length > 0;

  const system = hasContext
    ? `You are a financial analyst assistant. Answer using only the SEC filing context below.
Cite filing sources like [1] when using them. If unsure, say so.

Context:
${chunks.map((c, i) => `[${i + 1}] (${c.source})\n${c.content}`).join("\n\n")}`
    : `You are a financial analyst assistant.
Begin your response with exactly: "**Generic LLM response** (no filing context loaded)"
Then answer from your general knowledge.`;

  try {
    const result = streamText({ model: pickModel(provider, model), system, messages });
    return result.toDataStreamResponse();
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
