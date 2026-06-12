from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

from rag_service.documents.chunking import split_text
from rag_service.documents.formats import validate_format
from rag_service.documents.parser import ParserRegistry
from rag_service.documents.parsers import DocumentParsingError
from rag_service.providers import EmbeddingProvider, LlmContext, LlmProvider
from rag_service.retrieval import hybrid_rank, mmr_select
from rag_service.schemas import ChunkResponse, CitationResponse, IngestEventResponse, IngestResponse, QaResponse
from rag_service.vector_store import ChromaVectorStore


class EmptyDocumentError(ValueError):
    """Raised when parsing succeeds but produces no searchable text."""


@dataclass(frozen=True)
class DocumentPayload:
    content: bytes
    source_name: str
    document_id: str | None = None


class RagService:
    def __init__(
        self,
        *,
        parser_registry: ParserRegistry,
        embedding_provider: EmbeddingProvider,
        llm_provider: LlmProvider,
        vector_store: ChromaVectorStore,
        chunk_size: int = 500,
        chunk_overlap: int = 80,
        score_threshold: float = 0.3,
        chunking_strategy: str = "structured",
        retrieval_mode: str = "hybrid",
        vector_weight: float = 0.65,
        keyword_weight: float = 0.35,
        mmr_enabled: bool = True,
        mmr_lambda: float = 0.65,
    ) -> None:
        self.parser_registry = parser_registry
        self.embedding_provider = embedding_provider
        self.llm_provider = llm_provider
        self.vector_store = vector_store
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.score_threshold = score_threshold
        self.chunking_strategy = chunking_strategy
        self.retrieval_mode = retrieval_mode
        self.vector_weight = vector_weight
        self.keyword_weight = keyword_weight
        self.mmr_enabled = mmr_enabled
        self.mmr_lambda = mmr_lambda

    def ingest(self, payload: DocumentPayload) -> IngestResponse:
        final_response: IngestResponse | None = None
        for _event, response in self.ingest_events(payload):
            if response is not None:
                final_response = response
        if final_response is None:
            raise EmptyDocumentError("Document contains no extractable text.")
        return final_response

    def ingest_events(self, payload: DocumentPayload) -> Iterator[tuple[IngestEventResponse, IngestResponse | None]]:
        format_name = validate_format(Path(payload.source_name).suffix)
        parser = self.parser_registry.get_parser(format_name)
        try:
            parsed = parser.parse(payload.content, source_name=payload.source_name, format_name=format_name)
        except DocumentParsingError:
            raise
        except Exception as error:
            raise DocumentParsingError(f"Failed to parse document: {payload.source_name}") from error

        chunks = split_text(parsed.text, window_size=self.chunk_size, overlap=self.chunk_overlap, strategy=self.chunking_strategy)
        if not chunks:
            raise EmptyDocumentError("Document contains no extractable text.")

        yield (
            IngestEventResponse(
                stage="extract",
                detail=f"已提取 {len(parsed.text)} 个字符",
                characters=len(parsed.text),
            ),
            None,
        )
        yield (
            IngestEventResponse(
                stage="split",
                detail=f"已生成 {len(chunks)} 个文本块",
                chunk_count=len(chunks),
            ),
            None,
        )
        embeddings = self.embedding_provider.embed_texts(
            [chunk.text for chunk in chunks],
            task_type="RETRIEVAL_DOCUMENT",
        )
        document_id = payload.document_id or uuid4().hex
        yield (
            IngestEventResponse(
                stage="vector",
                detail=f"已生成 {len(embeddings)} 个向量",
                vector_count=len(embeddings),
            ),
            None,
        )
        vector_count = self.vector_store.upsert_document(
            document_id=document_id,
            source_name=payload.source_name,
            format_name=format_name,
            chunks=chunks,
            embeddings=embeddings,
        )
        response = IngestResponse(
            document_id=document_id,
            status="READY",
            format=format_name.upper(),
            chunk_count=len(chunks),
            vector_count=vector_count,
            source_name=payload.source_name,
        )
        yield (IngestEventResponse(stage="index", detail="索引构建完成", document_id=document_id, chunk_count=len(chunks), vector_count=vector_count), None)
        yield (
            IngestEventResponse(
                stage="done",
                detail="向量已存储并可检索",
                document_id=document_id,
                chunk_count=len(chunks),
                vector_count=vector_count,
            ),
            response,
        )

    def ask(self, *, question: str, document_ids: list[str] | None, top_k: int) -> QaResponse:
        query_embedding = self.embedding_provider.embed_texts([question], task_type="RETRIEVAL_QUERY")[0]
        retrieval_k = max(top_k * 4, top_k + 8)
        retrieved = self.vector_store.query(
            embedding=query_embedding,
            top_k=retrieval_k,
            document_ids=document_ids,
        )
        if self.retrieval_mode.strip().lower() == "hybrid":
            retrieved = hybrid_rank(
                query=question,
                vector_results=retrieved,
                keyword_candidates=self.vector_store.list_candidate_chunks(document_ids),
                top_k=retrieval_k,
                vector_weight=self.vector_weight,
                keyword_weight=self.keyword_weight,
            )
        if self.mmr_enabled:
            retrieved = mmr_select(question, retrieved, top_k=top_k, lambda_mult=self.mmr_lambda)
        else:
            retrieved = retrieved[:top_k]
        citations = [
            CitationResponse(
                document_id=chunk.document_id,
                chunk_id=chunk.chunk_id,
                source_name=chunk.source_name,
                format=chunk.format,
                chunk_index=chunk.chunk_index,
                score=chunk.score,
                text=chunk.text,
                page=chunk.page,
            )
            for chunk in retrieved
            if chunk.score >= self.score_threshold
        ]
        if not citations:
            return QaResponse(answer="未检索到相关文档片段。", citations=[])

        answer = self.llm_provider.generate_answer(
            question=question,
            contexts=[
                LlmContext(
                    chunk_id=citation.chunk_id,
                    source_name=citation.source_name,
                    text=citation.text,
                    score=citation.score,
                )
                for citation in citations
            ],
        )
        return QaResponse(answer=answer, citations=citations)

    def delete_document(self, document_id: str) -> None:
        self.vector_store.delete_document(document_id)

    def list_chunks(self, document_id: str) -> list[ChunkResponse]:
        return [
            ChunkResponse(
                document_id=chunk.document_id,
                chunk_id=chunk.chunk_id,
                source_name=chunk.source_name,
                format=chunk.format,
                chunk_index=chunk.chunk_index,
                text=chunk.text,
                page=chunk.page,
            )
            for chunk in self.vector_store.list_document_chunks(document_id)
        ]
