from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from rag_service.documents.chunking import split_text
from rag_service.documents.formats import validate_format
from rag_service.documents.parser import ParserRegistry
from rag_service.documents.parsers import DocumentParsingError
from rag_service.providers import EmbeddingProvider, LlmContext, LlmProvider
from rag_service.schemas import ChunkResponse, CitationResponse, IngestResponse, QaResponse
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
    ) -> None:
        self.parser_registry = parser_registry
        self.embedding_provider = embedding_provider
        self.llm_provider = llm_provider
        self.vector_store = vector_store
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.score_threshold = score_threshold

    def ingest(self, payload: DocumentPayload) -> IngestResponse:
        format_name = validate_format(Path(payload.source_name).suffix)
        parser = self.parser_registry.get_parser(format_name)
        try:
            parsed = parser.parse(payload.content, source_name=payload.source_name, format_name=format_name)
        except DocumentParsingError:
            raise
        except Exception as error:
            raise DocumentParsingError(f"Failed to parse document: {payload.source_name}") from error

        chunks = split_text(parsed.text, window_size=self.chunk_size, overlap=self.chunk_overlap)
        if not chunks:
            raise EmptyDocumentError("Document contains no extractable text.")

        embeddings = self.embedding_provider.embed_texts(
            [chunk.text for chunk in chunks],
            task_type="RETRIEVAL_DOCUMENT",
        )
        document_id = payload.document_id or uuid4().hex
        vector_count = self.vector_store.upsert_document(
            document_id=document_id,
            source_name=payload.source_name,
            format_name=format_name,
            chunks=chunks,
            embeddings=embeddings,
        )

        return IngestResponse(
            document_id=document_id,
            status="READY",
            format=format_name.upper(),
            chunk_count=len(chunks),
            vector_count=vector_count,
            source_name=payload.source_name,
        )

    def ask(self, *, question: str, document_ids: list[str] | None, top_k: int) -> QaResponse:
        query_embedding = self.embedding_provider.embed_texts([question], task_type="RETRIEVAL_QUERY")[0]
        retrieved = self.vector_store.query(
            embedding=query_embedding,
            top_k=top_k,
            document_ids=document_ids,
        )
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
