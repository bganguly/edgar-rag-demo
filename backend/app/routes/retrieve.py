import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

from app.db import get_vector_store

router = APIRouter()


class RetrieveRequest(BaseModel):
    query: str
    k: int = 5
    ticker: str = ""
    form: str = ""


class Chunk(BaseModel):
    content: str
    source: str
    score: float


@router.post("/retrieve")
async def retrieve(req: RetrieveRequest) -> dict:
    vs = get_vector_store()

    filter_dict: dict | None = None
    if req.ticker and req.form:
        filter_dict = {"ticker": req.ticker, "form": req.form}
    elif req.ticker:
        filter_dict = {"ticker": req.ticker}

    results = await asyncio.to_thread(
        vs.similarity_search_with_relevance_scores,
        req.query,
        k=req.k,
        filter=filter_dict,
    )
    return {
        "query": req.query,
        "chunks": [
            Chunk(
                content=doc.page_content,
                source=doc.metadata.get("source", ""),
                score=round(score, 4),
            )
            for doc, score in results
        ],
    }
