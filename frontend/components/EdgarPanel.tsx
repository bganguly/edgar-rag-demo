"use client";

import { useRef, useState } from "react";

const CURRENT_YEAR = new Date().getFullYear();

export interface Filing {
  entity_name: string;
  ticker: string;
  cik: string;
  form: string;
  file_date: string;
  period: string;
  accession_no: string;
  primary_doc: string;
}

type FStatus = "idle" | "fetching" | "chunking" | "storing" | "done" | "error";
interface FState { status: FStatus; chunks?: number; errorMsg?: string; startedAt?: number }

const INGEST_STEPS: { after: number; label: string }[] = [
  { after: 0,  label: "Fetching…" },
  { after: 8,  label: "Parsing HTML…" },
  { after: 18, label: "Chunking…" },
  { after: 30, label: "Storing embeddings…" },
];

function stepLabel(elapsed: number) {
  return [...INGEST_STEPS].reverse().find((s) => elapsed >= s.after)?.label ?? "Fetching…";
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const FORM_OPTIONS = ["10-K", "10-Q", "8-K", "DEF 14A"];

const RANGE_PRESETS = [
  { label: "5Y",  years: 5 },
  { label: "10Y", years: 10 },
  { label: "20Y", years: 20 },
  { label: "All", years: CURRENT_YEAR - 1993 },
];

export default function EdgarPanel({ onReady }: { onReady: (ticker: string) => void }) {
  const [query, setQuery]       = useState("");
  const [form, setForm]         = useState("10-K");
  const [startYear, setStartYear] = useState(CURRENT_YEAR - 5);
  const [endYear, setEndYear]   = useState(CURRENT_YEAR);

  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [company, setCompany]   = useState<{ name: string; ticker: string; cik: string } | null>(null);
  const [filings, setFilings]   = useState<Filing[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fStates, setFStates]   = useState<Record<string, FState>>({});
  const [ingesting, setIngesting] = useState(false);
  const [totalChunks, setTotalChunks] = useState(0);
  const [tick, setTick]         = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef  = useRef(0);

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      tickRef.current += 1;
      setTick(tickRef.current);
    }, 1000);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function setF(acc: string, u: Partial<FState>) {
    setFStates((p) => ({ ...p, [acc]: { ...p[acc], ...u } }));
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchErr("");
    setFilings([]);
    setCompany(null);
    setSelected(new Set());
    setFStates({});

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        form,
        start_year: String(startYear),
        end_year: String(endYear),
      });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Search failed");
      setCompany(data.company);
      setFilings(data.filings ?? []);
      if (!data.filings?.length) setSearchErr("No filings found in that range.");
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSearching(false);
    }
  }

  function applyPreset(years: number) {
    const end = CURRENT_YEAR;
    const start = Math.max(1993, end - years);
    setStartYear(start);
    setEndYear(end);
  }

  function toggleAll() {
    if (selected.size === filings.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filings.map((f) => f.accession_no)));
    }
  }

  function toggle(acc: string) {
    if (ingesting) return;
    setSelected((p) => {
      const n = new Set(p);
      n.has(acc) ? n.delete(acc) : n.add(acc);
      return n;
    });
  }

  const selectedFilings = filings.filter((f) => selected.has(f.accession_no));
  const doneAccs = filings.filter((f) => fStates[f.accession_no]?.status === "done").map((f) => f.accession_no);
  const allSelectedDone = selectedFilings.length > 0 && selectedFilings.every((f) => fStates[f.accession_no]?.status === "done");

  async function loadSelected() {
    const batch = selectedFilings.filter((f) => fStates[f.accession_no]?.status !== "done");
    if (!batch.length) return;
    setIngesting(true);
    startTimer();
    let acc = totalChunks;

    for (const f of batch) {
      setF(f.accession_no, { status: "fetching", startedAt: Date.now() });
      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cik: f.cik,
            accession_no: f.accession_no,
            primary_doc: f.primary_doc,
            entity_name: f.entity_name,
            ticker: f.ticker,
            form: f.form,
            period: f.period,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
        acc += data.chunks ?? 0;
        setTotalChunks(acc);
        setF(f.accession_no, { status: "done", chunks: data.chunks });
      } catch (e) {
        setF(f.accession_no, { status: "error", errorMsg: e instanceof Error ? e.message : "failed" });
      }
    }

    stopTimer();
    setIngesting(false);
    if (company) onReady(company.ticker);
  }

  async function clearIndex() {
    setFStates({});
    setTotalChunks(0);
    setSelected(new Set());
    await fetch("/api/reset", { method: "DELETE" }).catch(() => null);
  }

  const sp = SPINNER[tick % SPINNER.length];
  const ingestBatch = selectedFilings.filter((f) => fStates[f.accession_no]?.status !== "done");

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 flex flex-col gap-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div>
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text-2)" }}>SEC EDGAR</span>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>Ticker symbol or company name</p>
        </div>

        <form onSubmit={search} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="AAPL · MSFT · Berkshire Hathaway"
            className="flex-1 rounded px-3 py-2 text-sm min-w-0"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            disabled={ingesting}
          />
          <button
            type="submit"
            disabled={searching || ingesting || !query.trim()}
            className="px-3 py-2 rounded text-xs font-medium shrink-0 transition-opacity"
            style={{ background: "var(--accent)", color: "#fff", opacity: searching || ingesting || !query.trim() ? 0.5 : 1 }}
          >
            {searching ? "…" : "Find"}
          </button>
        </form>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {FORM_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => setForm(f)}
                disabled={ingesting}
                className="px-2 py-1 rounded text-[10px] font-mono transition-colors"
                style={{
                  background: form === f ? "var(--accent)" : "var(--bg)",
                  color: form === f ? "#fff" : "var(--text-2)",
                  border: `1px solid ${form === f ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={startYear}
              onChange={(e) => setStartYear(Number(e.target.value))}
              min={1993}
              max={endYear}
              className="w-16 rounded px-2 py-1 text-xs text-center font-mono"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              disabled={ingesting}
            />
            <span className="text-xs" style={{ color: "var(--text-2)" }}>–</span>
            <input
              type="number"
              value={endYear}
              onChange={(e) => setEndYear(Number(e.target.value))}
              min={startYear}
              max={CURRENT_YEAR}
              className="w-16 rounded px-2 py-1 text-xs text-center font-mono"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              disabled={ingesting}
            />
          </div>
          <div className="flex gap-1">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.years)}
                disabled={ingesting}
                className="px-2 py-1 rounded text-[10px] font-mono transition-colors"
                style={{ background: "var(--bg)", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {searchErr && (
        <div className="px-5 py-3 text-xs" style={{ color: "var(--text-2)" }}>{searchErr}</div>
      )}

      {filings.length > 0 && (
        <>
          <div
            className="flex items-center justify-between px-5 py-2 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono font-semibold truncate" style={{ color: "var(--accent)" }}>
                {company?.name}
              </span>
              {company?.ticker && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(var(--accent-rgb),0.1)", color: "var(--accent)", border: "1px solid rgba(var(--accent-rgb),0.25)" }}>
                  {company.ticker}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px]" style={{ color: "var(--text-2)" }}>{filings.length} filings</span>
              <button
                onClick={toggleAll}
                disabled={ingesting}
                className="text-[10px] underline"
                style={{ color: "var(--text-2)" }}
              >
                {selected.size === filings.length ? "None" : "All"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filings.map((f) => {
              const st = fStates[f.accession_no] ?? { status: "idle" };
              const isSel = selected.has(f.accession_no);
              const isActive = st.status === "fetching" || st.status === "chunking" || st.status === "storing";
              const isDone = st.status === "done";
              const isErr = st.status === "error";
              const elapsed = isActive && st.startedAt ? Math.floor((Date.now() - st.startedAt) / 1000) : 0;

              return (
                <button
                  key={f.accession_no}
                  onClick={() => toggle(f.accession_no)}
                  disabled={ingesting && !isActive}
                  className="w-full flex items-start gap-3 px-5 py-2.5 text-left border-b transition-colors hover:opacity-90"
                  style={{
                    borderColor: "var(--border)",
                    background: isSel ? "rgba(var(--accent-rgb),0.06)" : "transparent",
                    borderLeft: `3px solid ${isDone ? "#22c55e" : isErr ? "#ef4444" : isSel ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  <div
                    className="w-3.5 h-3.5 rounded border shrink-0 mt-0.5 flex items-center justify-center"
                    style={{
                      borderColor: isDone ? "#22c55e" : isSel ? "var(--accent)" : "var(--border)",
                      background: isDone ? "#22c55e22" : isSel ? "rgba(var(--accent-rgb),0.15)" : "transparent",
                    }}
                  >
                    {isDone && <span className="text-[8px]" style={{ color: "#22c55e" }}>✓</span>}
                    {isSel && !isDone && <span className="text-[8px]" style={{ color: "var(--accent)" }}>✓</span>}
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold" style={{ color: isDone ? "#22c55e" : isErr ? "#ef4444" : isSel ? "var(--accent)" : "var(--text)" }}>
                        {f.form} · {f.period || f.file_date.slice(0, 4)}
                      </span>
                      <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--text-2)" }}>
                        {f.file_date}
                      </span>
                    </div>

                    {isDone && (
                      <span className="text-[10px] font-mono" style={{ color: "#22c55e" }}>
                        ✓ {st.chunks} chunks indexed
                      </span>
                    )}
                    {isErr && (
                      <span className="text-[10px]" style={{ color: "#ef4444" }}>{st.errorMsg}</span>
                    )}
                    {isActive && (
                      <span className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>
                        {sp} {stepLabel(elapsed)} ({elapsed}s)
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
            {totalChunks > 0 && (
              <div className="text-xs text-center font-mono" style={{ color: "var(--text-2)" }}>
                {doneAccs.length} filing{doneAccs.length !== 1 ? "s" : ""} indexed · {totalChunks} chunks total
              </div>
            )}

            {allSelectedDone ? (
              <>
                <div className="text-xs rounded py-1.5 text-center" style={{ color: "#22c55e", border: "1px solid #22c55e33" }}>
                  ✓ Ready — ask questions in the chat
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelected(new Set())}
                    className="flex-1 text-xs py-1.5 rounded border"
                    style={{ color: "var(--text-2)", borderColor: "var(--border)" }}
                  >
                    Load more
                  </button>
                  <button
                    onClick={clearIndex}
                    className="flex-1 text-xs py-1.5 rounded"
                    style={{ color: "#ef4444", border: "1px solid #ef444433" }}
                  >
                    ✕ Clear index
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={loadSelected}
                disabled={ingesting || ingestBatch.length === 0}
                className="rounded py-2 text-sm font-medium transition-opacity"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  opacity: ingesting || ingestBatch.length === 0 ? 0.5 : 1,
                }}
              >
                {ingesting
                  ? `Indexing ${ingestBatch.length} filing${ingestBatch.length !== 1 ? "s" : ""}…`
                  : ingestBatch.length === 0
                  ? "Select filings above"
                  : `Load ${ingestBatch.length} filing${ingestBatch.length !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </>
      )}

      {filings.length === 0 && !searchErr && (
        <div className="flex-1 flex flex-col justify-end p-5">
          <p className="text-[10px] font-mono leading-relaxed" style={{ color: "var(--text-2)", opacity: 0.5 }}>
            EDGAR hosts all public company filings since 1993. You can index
            a single quarter or a 20-year range of 10-Ks and ask cross-year questions.
          </p>
        </div>
      )}
    </div>
  );
}
