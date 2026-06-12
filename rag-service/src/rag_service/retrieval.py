from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Iterable

from rag_service.vector_store import RetrievedChunk


def tokenize(text: str) -> list[str]:
    normalized = text.lower()
    words = re.findall(r"[a-z0-9_]+|[\u4e00-\u9fff]", normalized)
    bigrams = [normalized[index : index + 2] for index in range(max(0, len(normalized) - 1))]
    chinese_bigrams = [token for token in bigrams if re.fullmatch(r"[\u4e00-\u9fff]{2}", token)]
    return [*words, *chinese_bigrams]


def hybrid_rank(
    *,
    query: str,
    vector_results: list[RetrievedChunk],
    keyword_candidates: list[RetrievedChunk],
    top_k: int,
    vector_weight: float = 0.65,
    keyword_weight: float = 0.35,
) -> list[RetrievedChunk]:
    if top_k <= 0:
        return []

    candidates = _dedupe([*vector_results, *keyword_candidates])
    if not candidates:
        return []

    vector_scores = {chunk.chunk_id: max(0.0, min(1.0, chunk.score)) for chunk in vector_results}
    keyword_scores = _bm25_scores(query, keyword_candidates)
    ranked: list[RetrievedChunk] = []
    for chunk in candidates:
        score = vector_weight * vector_scores.get(chunk.chunk_id, 0.0) + keyword_weight * keyword_scores.get(chunk.chunk_id, 0.0)
        ranked.append(_with_score(chunk, score))

    return sorted(ranked, key=lambda chunk: (-chunk.score, chunk.chunk_index, chunk.chunk_id))[:top_k]


def mmr_select(query: str, candidates: list[RetrievedChunk], *, top_k: int, lambda_mult: float = 0.65) -> list[RetrievedChunk]:
    if top_k <= 0 or not candidates:
        return []

    selected: list[RetrievedChunk] = []
    remaining = list(candidates)
    query_tokens = set(tokenize(query))
    while remaining and len(selected) < top_k:
        best = max(
            remaining,
            key=lambda chunk: (
                lambda_mult * _query_relevance(chunk, query_tokens)
                - (1.0 - lambda_mult) * _max_similarity(chunk, selected),
                chunk.score,
            ),
        )
        selected.append(best)
        remaining.remove(best)
    return selected


def _dedupe(chunks: Iterable[RetrievedChunk]) -> list[RetrievedChunk]:
    seen: set[str] = set()
    unique: list[RetrievedChunk] = []
    for chunk in chunks:
        if chunk.chunk_id in seen:
            continue
        seen.add(chunk.chunk_id)
        unique.append(chunk)
    return unique


def _normalize_scores(scores: dict[str, float]) -> dict[str, float]:
    if not scores:
        return {}
    min_score = min(scores.values())
    max_score = max(scores.values())
    if math.isclose(min_score, max_score):
        return {key: 1.0 for key in scores}
    return {key: (value - min_score) / (max_score - min_score) for key, value in scores.items()}


def _bm25_scores(query: str, chunks: list[RetrievedChunk]) -> dict[str, float]:
    query_terms = tokenize(query)
    if not query_terms or not chunks:
        return {}

    documents = [tokenize(chunk.text) for chunk in chunks]
    average_length = sum(len(document) for document in documents) / max(1, len(documents))
    document_frequency = Counter(term for term in set(query_terms) for document in documents if term in set(document))
    raw_scores: dict[str, float] = {}
    k1 = 1.5
    b = 0.75
    for chunk, document in zip(chunks, documents, strict=False):
        term_counts = Counter(document)
        score = 0.0
        for term in query_terms:
            frequency = term_counts.get(term, 0)
            if frequency == 0:
                continue
            df = document_frequency.get(term, 0)
            idf = math.log(1 + (len(documents) - df + 0.5) / (df + 0.5))
            denominator = frequency + k1 * (1 - b + b * len(document) / max(1.0, average_length))
            score += idf * frequency * (k1 + 1) / denominator
        raw_scores[chunk.chunk_id] = score
    return _normalize_scores(raw_scores)


def _query_relevance(chunk: RetrievedChunk, query_tokens: set[str]) -> float:
    token_overlap = _jaccard(set(tokenize(chunk.text)), query_tokens)
    return max(chunk.score, token_overlap)


def _max_similarity(chunk: RetrievedChunk, selected: list[RetrievedChunk]) -> float:
    if not selected:
        return 0.0
    current_tokens = set(tokenize(chunk.text))
    return max(_jaccard(current_tokens, set(tokenize(item.text))) for item in selected)


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def _with_score(chunk: RetrievedChunk, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        document_id=chunk.document_id,
        chunk_id=chunk.chunk_id,
        source_name=chunk.source_name,
        format=chunk.format,
        chunk_index=chunk.chunk_index,
        text=chunk.text,
        score=score,
        page=chunk.page,
    )
