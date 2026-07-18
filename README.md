# SEC EDGAR RAG Demo — pgvector · LangChain · Vercel AI SDK

Index SEC 10-K / 10-Q filings by company and date range, then ask cross-filing questions
with grounded LLM answers. OpenAI `text-embedding-3-small` embeddings stored in **pgvector**,
retrieved via cosine similarity. Four providers with per-model selection at runtime.

**[→ Portfolio demo](https://bganguly.github.io/?open=edgar)**&nbsp;&nbsp;*Lambda cold-start · ~2–5 s on first request*

---

## Using the App

1. **Search** — enter a ticker (`AAPL`, `MSFT`) or company name in the left panel.
2. **Select form + date range** — choose 10-K / 10-Q, pick a year range (or use 5Y / 10Y / All presets).
3. **Find Filings** — retrieves the filing list from EDGAR's submissions API.
4. **Select filings** — check individual filings or use "All" to select the entire range.
5. **Load** — fetches each filing from EDGAR, strips HTML, chunks, embeds, stores in pgvector.
6. **Ask** — sample questions or type your own. Cross-year analysis works out of the box.

---

## Providers & Models

| Provider | Models |
|---|---|
| **Anthropic** | Haiku 4.5 · Sonnet 4.5 · Opus 4.8 |
| **OpenAI** | GPT-4o mini · GPT-4o · GPT-4.1 mini |
| **Google** | Gemini 2.0 Flash · Gemini 2.5 Flash · Gemini 1.5 Pro |
| **NVIDIA NIM** | Nemotron 49B · Llama 3.1 405B · Mixtral 8x22B |

---

## Running locally

```
cp .env.example .env
```

Fill in API keys, then:

```
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8002 --reload
```

```
cd frontend
npm install
npm run dev
```

Open [http://localhost:3011](http://localhost:3011).

---

## Architecture

| Component | Implementation |
|---|---|
| **Data source** | SEC EDGAR public API — no auth required; `company_tickers.json` for CIK lookup, `submissions/{CIK}.json` for filing list, `Archives/edgar/data/...` for filing documents |
| **Ingestion** | Fetch HTML filing → BeautifulSoup HTML strip → LangChain `RecursiveCharacterTextSplitter` (800 chars / 150 overlap) → OpenAI `text-embedding-3-small` → pgvector |
| **Metadata** | Each chunk tagged with `{ticker, form, period, entity_name, accession_no}` — used for per-ticker retrieve filtering |
| **Retrieval** | pgvector cosine similarity, top-5 chunks; optional ticker filter for focused queries |
| **Streaming** | Next.js API route retrieves chunks from FastAPI, builds financial analyst system prompt, streams via Vercel AI SDK `streamText` |
| **Provider abstraction** | `pickModel(provider, model)` in `app/api/chat/route.ts` — same call for Anthropic / OpenAI / Google / NVIDIA NIM |
| **Backend** | FastAPI 0.115 + Mangum (Lambda-compatible); EDGAR `User-Agent` header required |
| **Frontend** | Next.js 15 App Router, React 19, TypeScript 5.7, Tailwind CSS |

### Key design notes

- Embeddings always use OpenAI `text-embedding-3-small` regardless of LLM provider — same model must be used at ingest and query time
- EDGAR rate-limits unauthenticated requests; the backend respects this with sequential per-filing fetches
- 10-K filings average ~800–1 500 chunks each; 20 years of Apple 10-Ks ≈ 16 000 chunks — pgvector handles this well
- Cross-year questions ("how did revenue grow 2010–2023?") work because all filings share the same vector space
