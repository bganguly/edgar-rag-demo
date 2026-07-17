"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import type { Provider } from "@/app/page";

interface Chunk { content: string; source: string; score: number }

const SUGGESTED = [
  "What were the main revenue drivers this period?",
  "Summarize the business overview.",
  "What risks does management highlight?",
  "How did operating expenses change year over year?",
  "What is the company's cash and liquidity position?",
  "How did revenue grow across all indexed filings?",
  "What major events or acquisitions are described?",
];

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  nim: "NVIDIA NIM",
};

export default function ChatPanel({
  provider,
  model,
  ticker,
}: {
  provider: Provider;
  model: string;
  ticker: string;
}) {
  const [apiErrorMsg, setApiErrorMsg] = useState<string | null>(null);

  const { messages, input, handleInputChange, isLoading, error, setMessages, setInput, append } =
    useChat({
      api: "/api/chat",
      body: { provider, model, ticker },
      onError: async (err) => {
        const raw = (err as { responseBody?: string }).responseBody;
        if (raw) {
          try {
            const p = JSON.parse(raw);
            if (p.error) { setApiErrorMsg(p.error); return; }
          } catch {}
        }
        setApiErrorMsg(err.message ?? null);
      },
    });

  const [ctxByExchange, setCtxByExchange] = useState<Chunk[][]>([]);
  const [expanded, setExpanded]           = useState<Set<number>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function submitQuery(query: string) {
    const q = query.trim();
    if (!q || isLoading) return;
    setApiErrorMsg(null);
    const idx = messages.filter((m) => m.role === "user").length;
    setInput("");
    append({ role: "user", content: q });

    fetch("/api/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, k: 5, ticker }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.chunks?.length) {
          setCtxByExchange((prev) => { const n = [...prev]; n[idx] = data.chunks; return n; });
        }
      })
      .catch(() => null);
  }

  function toggleCtx(idx: number) {
    setExpanded((p) => { const n = new Set(p); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 py-2 border-b gap-2"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono uppercase tracking-wider shrink-0" style={{ color: "var(--text-2)" }}>Query</span>
          {ticker && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: "var(--accent)", background: "rgba(var(--accent-rgb),0.1)", border: "1px solid rgba(var(--accent-rgb),0.25)" }}>
              {ticker}
            </span>
          )}
        </div>
        <button
          onClick={() => { setMessages([]); setCtxByExchange([]); setExpanded(new Set()); }}
          className="text-xs px-2 py-1 rounded shrink-0"
          style={{ color: "var(--text-2)", border: "1px solid var(--border)" }}
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 mt-6 items-center text-center">
            {ticker ? (
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                <span className="font-mono" style={{ color: "var(--accent)" }}>{ticker}</span> filings indexed — ask anything.
              </p>
            ) : (
              <>
                <p className="text-sm" style={{ color: "var(--text-2)" }}>
                  Load SEC filings on the left, then ask cross-filing questions here.
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-2)", opacity: 0.55 }}>
                  Or ask now — the model will answer from its general knowledge.
                </p>
              </>
            )}
          </div>
        )}

        {messages.map((m, i) => {
          const usersBefore = messages.slice(0, i).filter((x) => x.role === "user").length;
          const exIdx = m.role === "user" ? usersBefore : usersBefore - 1;
          const chunks = ctxByExchange[exIdx];

          return (
            <div key={m.id} className="flex flex-col gap-1.5">
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed"
                  style={
                    m.role === "user"
                      ? { background: "var(--accent)", color: "#fff" }
                      : { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }
                  }
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>

              {m.role === "user" && chunks?.length > 0 && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] w-full">
                    <button
                      onClick={() => toggleCtx(exIdx)}
                      className="text-xs flex items-center gap-1.5 mb-1 ml-auto"
                      style={{ color: "var(--text-2)" }}
                    >
                      <span style={{ color: "var(--accent)" }}>⊙</span>
                      Retrieved {chunks.length} chunks
                      <span style={{ opacity: 0.5 }}>{expanded.has(exIdx) ? "▲" : "▼"}</span>
                    </button>
                    {expanded.has(exIdx) && (
                      <div
                        className="rounded text-xs flex flex-col divide-y overflow-hidden"
                        style={{ border: "1px solid var(--border)", "--tw-divide-color": "var(--border)" } as React.CSSProperties}
                      >
                        {chunks.map((c, ci) => (
                          <div key={ci} className="flex flex-col gap-1 p-2.5" style={{ background: "var(--bg)" }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono truncate" style={{ color: "var(--accent)" }}>
                                [{ci + 1}] {c.source}
                              </span>
                              <span className="shrink-0" style={{ color: "var(--text-2)" }}>score {c.score}</span>
                            </div>
                            <p className="leading-relaxed" style={{ color: "var(--text-2)" }}>
                              {c.content.length > 220 ? c.content.slice(0, 220) + "…" : c.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg px-4 py-2.5 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              <span className="animate-pulse">Generating…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="rounded-lg px-4 py-2.5 text-sm max-w-[80%]" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
              {apiErrorMsg
                ? `${PROVIDER_LABEL[provider]} error — ${apiErrorMsg}`
                : "An error occurred. Check your API key and try again."}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={() => setShowSuggestions((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-2"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-2)" }}>Sample questions</span>
          <span className="text-[10px] font-mono" style={{ color: "var(--text-2)" }}>{showSuggestions ? "▲" : "▼"}</span>
        </button>
        {showSuggestions && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {SUGGESTED.map((q) => (
              <button
                key={q}
                onClick={() => submitQuery(q)}
                disabled={isLoading}
                className="px-2.5 py-1 rounded text-xs text-left transition-opacity"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)", opacity: isLoading ? 0.4 : 1 }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submitQuery(input); }} className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder={ticker ? `Ask about ${ticker} filings…` : "Ask about the indexed filings…"}
          className="flex-1 rounded px-3 py-2 text-sm"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 rounded text-sm font-medium transition-opacity"
          style={{ background: "var(--accent)", color: "#fff", opacity: isLoading || !input.trim() ? 0.5 : 1 }}
        >
          Ask
        </button>
      </form>
    </div>
  );
}
