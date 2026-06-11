from rag_service.retrieval import hybrid_rank, mmr_select
from rag_service.vector_store import RetrievedChunk


def chunk(chunk_id: str, text: str, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        document_id="doc-1",
        chunk_id=chunk_id,
        source_name="名单.xlsx",
        format="XLSX",
        chunk_index=int(chunk_id.rsplit("-", 1)[-1]),
        text=text,
        score=score,
    )


def test_hybrid_rank_promotes_exact_keyword_matches() -> None:
    vector_results = [
        chunk("doc-1-0", "课程介绍和培养方案。", 0.96),
        chunk("doc-1-1", "推免资格名单：张三、李四、王五。", 0.42),
    ]
    keyword_candidates = [
        *vector_results,
        chunk("doc-1-2", "普通成绩单。", 0.0),
    ]

    ranked = hybrid_rank(
        query="有哪些人获得推免资格",
        vector_results=vector_results,
        keyword_candidates=keyword_candidates,
        top_k=2,
        vector_weight=0.55,
        keyword_weight=0.45,
    )

    assert [item.chunk_id for item in ranked] == ["doc-1-1", "doc-1-0"]
    assert ranked[0].score > ranked[1].score


def test_mmr_select_keeps_relevant_but_diverse_chunks() -> None:
    candidates = [
        chunk("doc-1-0", "推免资格名单：张三、李四、王五。", 0.95),
        chunk("doc-1-1", "推免资格名单：张三、李四、王五。", 0.94),
        chunk("doc-1-2", "推免资格申请条件：成绩排名、科研成果、综合测评。", 0.80),
    ]

    selected = mmr_select("推免资格有哪些人和条件", candidates, top_k=2, lambda_mult=0.55)

    assert [item.chunk_id for item in selected] == ["doc-1-0", "doc-1-2"]
