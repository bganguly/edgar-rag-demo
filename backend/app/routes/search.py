import time

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()

_tickers_cache: dict | None = None
_tickers_fetched_at: float = 0
_CACHE_TTL = 86_400  # 24 h


def _edgar_headers() -> dict[str, str]:
    return {
        "User-Agent": settings.edgar_user_agent,
        "Accept-Encoding": "gzip, deflate",
    }


async def _get_tickers() -> dict:
    global _tickers_cache, _tickers_fetched_at
    now = time.time()
    if _tickers_cache and now - _tickers_fetched_at < _CACHE_TTL:
        return _tickers_cache
    async with httpx.AsyncClient(headers=_edgar_headers(), timeout=30) as client:
        r = await client.get("https://www.sec.gov/files/company_tickers.json")
        r.raise_for_status()
        _tickers_cache = r.json()
        _tickers_fetched_at = now
    return _tickers_cache


def _pad_cik(cik: int | str) -> str:
    return str(int(cik)).zfill(10)


@router.get("/search")
async def search_filings(
    q: str = Query(..., min_length=1),
    form: str = Query(default="10-K"),
    start_year: int = Query(default=2015),
    end_year: int = Query(default=2025),
):
    tickers = await _get_tickers()
    q_upper = q.strip().upper()

    matches: list[dict] = []
    for _, info in tickers.items():
        ticker = info.get("ticker", "").upper()
        title = info.get("title", "").upper()
        if ticker == q_upper or q_upper in title or q_upper in ticker:
            matches.append({
                "cik": _pad_cik(info["cik_str"]),
                "ticker": info.get("ticker", ""),
                "name": info.get("title", ""),
            })
        if len(matches) >= 5:
            break

    if not matches:
        raise HTTPException(404, f"No company found matching '{q}'")

    best = matches[0]
    cik = best["cik"]

    async with httpx.AsyncClient(headers=_edgar_headers(), timeout=20) as client:
        r = await client.get(f"https://data.sec.gov/submissions/CIK{cik}.json")
        r.raise_for_status()
        data = r.json()

    entity_name = data.get("name", best["name"])
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    periods = recent.get("reportDate", [])
    accessions = recent.get("accessionNumber", [])
    docs = recent.get("primaryDocument", [])

    filings: list[dict] = []
    for i, f in enumerate(forms):
        if f != form:
            continue
        date_str = dates[i] if i < len(dates) else ""
        year = int(date_str[:4]) if date_str else 0
        if not (start_year <= year <= end_year):
            continue
        primary_doc = docs[i] if i < len(docs) else ""
        if not primary_doc:
            continue
        filings.append({
            "entity_name": entity_name,
            "ticker": best["ticker"],
            "cik": cik,
            "form": f,
            "file_date": date_str,
            "period": periods[i] if i < len(periods) else "",
            "accession_no": accessions[i] if i < len(accessions) else "",
            "primary_doc": primary_doc,
        })

    filings.sort(key=lambda x: x["file_date"], reverse=True)

    return {
        "company": {"name": entity_name, "ticker": best["ticker"], "cik": cik},
        "candidates": matches[1:],
        "filings": filings[:50],
    }
