import math
import re
from collections import Counter
from typing import Any

from bson import ObjectId

from app.config import settings
from app.services.ai import gemini_service


def _tokens(text: str) -> Counter[str]:
    return Counter(token.lower() for token in re.findall(r"\w{2,}", text, flags=re.UNICODE))


def _lexical_score(query: Counter[str], content: str) -> float:
    document = _tokens(content)
    if not query or not document:
        return 0.0
    overlap = sum(min(count, document[token]) for token, count in query.items())
    return overlap / math.sqrt(sum(query.values()) * sum(document.values()))


async def retrieve_chunks(
    db: Any, document_id: ObjectId, query: str, limit: int
) -> list[dict]:
    embedding = await gemini_service.embed(query)
    if embedding:
        try:
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": settings.atlas_vector_index,
                        "path": "embedding",
                        "queryVector": embedding,
                        "numCandidates": max(50, limit * 10),
                        "limit": limit,
                        "filter": {"documentId": document_id},
                    }
                },
                {"$project": {"content": 1, "location": 1, "score": {"$meta": "vectorSearchScore"}}},
            ]
            results = await db.document_chunks.aggregate(pipeline).to_list(None)
            if results:
                return results
        except Exception:
            pass
    candidates = await db.document_chunks.find({"documentId": document_id}).to_list(None)
    query_tokens = _tokens(query)
    for chunk in candidates:
        chunk["score"] = _lexical_score(query_tokens, chunk.get("content", ""))
    return sorted(candidates, key=lambda item: item["score"], reverse=True)[:limit]
