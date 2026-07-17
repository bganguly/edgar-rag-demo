import asyncio
import re

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel

from app.config import settings
from app.db import get_vector_store

router = APIRouter()

_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
MAX_TEXT_BYTES = 8_000_000  # 8 MB cap after HTML strip


def _edgar_headers() -> dict[str, str]:
    return {
        "User-Agent": settings.edgar_user_agent,
        "Accept-Encoding": "gzip, deflate",
    }


def _strip_html(raw: str) -> str:
    soup = BeautifulSoup(raw, "lxml")
    for tag in soup(["script", "style", "table"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    text = re.sub(r"\s{3,}", "  ", text)
    return text


class IngestRequest(BaseModel):
    cik: str
    accession_no: str
    primary_doc: str
    entity_name: str
    ticker: str
    form: str
    period: str


def _fetch_and_chunk(req: IngestRequest) -> list[Document]:
    accession_nodash = req.accession_no.replace("-", "")
    cik_int = int(req.cik)
    url = (
        f"https://www.sec.gov/Archives/edgar/data/"
        f"{cik_int}/{accession_nodash}/{req.primary_doc}"
    )

    with httpx.Client(headers=_edgar_headers(), timeout=60, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        raw = r.text

    if len(raw.encode()) > MAX_TEXT_BYTES:
        raw = raw[: MAX_TEXT_BYTES * 4]

    text = _strip_html(raw) if "<" in raw else raw
    if not text.strip():
        raise ValueError("No text extracted from filing")

    source_label = f"{req.ticker} {req.form} {req.period}"
    meta = {
        "source": source_label,
        "entity_name": req.entity_name,
        "ticker": req.ticker,
        "form": req.form,
        "period": req.period,
        "cik": req.cik,
        "accession_no": req.accession_no,
    }

    return [
        Document(page_content=chunk, metadata=meta)
        for chunk in _splitter.split_text(text)
    ]


@router.post("/ingest")
async def ingest(req: IngestRequest) -> dict:
    try:
        docs = await asyncio.to_thread(_fetch_and_chunk, req)
    except httpx.HTTPStatusError as e:
        raise HTTPException(422, f"EDGAR fetch failed: {e.response.status_code}")
    except ValueError as e:
        raise HTTPException(400, str(e))

    if not docs:
        raise HTTPException(400, "No text extracted from filing")

    vs = get_vector_store()
    await asyncio.to_thread(vs.add_documents, docs)

    return {
        "ticker": req.ticker,
        "form": req.form,
        "period": req.period,
        "chunks": len(docs),
    }
