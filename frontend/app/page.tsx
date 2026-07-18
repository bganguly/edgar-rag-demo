"use client";

import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import EdgarPanel from "@/components/EdgarPanel";
import { type Provider, PROVIDER_MODELS } from "@/lib/providers";

const PROVIDER_SHORT: Record<Provider, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Google",
  nim: "NIM",
};

export default function Home() {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState(PROVIDER_MODELS.anthropic[0].id);
  const [ticker, setTicker] = useState("");
  const [tab, setTab] = useState<"filings" | "chat">("filings");

  function switchProvider(p: Provider) {
    setProvider(p);
    setModel(PROVIDER_MODELS[p][0].id);
  }

  return (
    <div className="flex flex-col h-screen">
      <header
        className="flex items-center justify-between px-4 sm:px-6 py-2 border-b gap-3 flex-wrap"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="min-w-0 shrink-0">
          <span className="text-xs font-mono tracking-widest uppercase" style={{ color: "var(--accent)" }}>
            SEC EDGAR RAG
          </span>
          <h1 className="text-sm sm:text-base font-semibold" style={{ color: "var(--text)" }}>
            pgvector · LangChain · Vercel AI SDK
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {(Object.keys(PROVIDER_SHORT) as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => switchProvider(p)}
                className="px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-mono transition-colors"
                style={{
                  background: provider === p ? "var(--accent)" : "var(--bg)",
                  color: provider === p ? "#fff" : "var(--text-2)",
                  border: `1px solid ${provider === p ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {PROVIDER_SHORT[p]}
              </button>
            ))}
          </div>

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="text-xs font-mono rounded px-2 py-1"
            style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            {PROVIDER_MODELS[provider].map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </header>

      <div
        className="flex sm:hidden border-b"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {(["filings", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-xs font-mono uppercase tracking-wider"
            style={{
              color: tab === t ? "var(--accent)" : "var(--text-2)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {t === "filings" ? "Filings" : "Chat"}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`${tab === "filings" ? "flex" : "hidden"} sm:flex w-full sm:w-96 shrink-0 border-r overflow-y-auto flex-col`}
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <EdgarPanel
            onReady={(t) => {
              setTicker(t);
              setTab("chat");
            }}
          />
        </div>
        <div className={`${tab === "chat" ? "flex" : "hidden"} sm:flex flex-1 overflow-hidden flex-col`}>
          <ChatPanel provider={provider} model={model} ticker={ticker} />
        </div>
      </div>
    </div>
  );
}
