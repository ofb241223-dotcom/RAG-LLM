from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from rag_service.documents.chunking import TextChunk


COLLECTION_NAME = "rag_documents_v1"


@dataclass(frozen=True)
class RetrievedChunk:
    document_id: str
    chunk_id: str
    source_name: str
    format: str
    chunk_index: int
    text: str
    score: float
    page: int | None = None


class ChromaVectorStore:
    def __init__(self, persist_dir: Path, *, collection_name: str = COLLECTION_NAME) -> None:
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        self.persist_dir = Path(persist_dir)
        self.collection_name = collection_name
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=str(self.persist_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def upsert_document(
        self,
        *,
        document_id: str,
        source_name: str,
        format_name: str,
        chunks: list[TextChunk],
        embeddings: list[list[float]],
    ) -> int:
        if len(chunks) != len(embeddings):
            raise ValueError("chunks and embeddings must have the same length.")
        if not chunks:
            return 0

        self.delete_document(document_id)
        ids = [f"{document_id}-{chunk.chunk_index}" for chunk in chunks]
        metadatas = []
        for chunk in chunks:
            metadata: dict[str, str | int] = {
                "document_id": document_id,
                "source_name": source_name,
                "format": format_name.upper(),
                "chunk_index": chunk.chunk_index,
            }
            if chunk.page is not None:
                metadata["page"] = chunk.page
            metadatas.append(metadata)

        self.collection.upsert(
            ids=ids,
            documents=[chunk.text for chunk in chunks],
            embeddings=embeddings,
            metadatas=metadatas,
        )
        return len(ids)

    def query(
        self,
        *,
        embedding: list[float],
        top_k: int,
        document_ids: list[str] | None = None,
    ) -> list[RetrievedChunk]:
        where = None
        if document_ids:
            where = {"document_id": {"$in": document_ids}}

        result = self.collection.query(
            query_embeddings=[embedding],
            n_results=top_k,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        ids = result.get("ids", [[]])[0]
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]

        chunks: list[RetrievedChunk] = []
        for chunk_id, text, metadata, distance in zip(ids, documents, metadatas, distances, strict=False):
            metadata = metadata or {}
            chunks.append(
                RetrievedChunk(
                    document_id=str(metadata.get("document_id", "")),
                    chunk_id=str(chunk_id),
                    source_name=str(metadata.get("source_name", "")),
                    format=str(metadata.get("format", "")),
                    chunk_index=int(metadata.get("chunk_index", 0)),
                    text=text or "",
                    score=1.0 / (1.0 + float(distance or 0.0)),
                    page=metadata.get("page") if isinstance(metadata.get("page"), int) else None,
                )
            )
        return chunks

    def list_candidate_chunks(self, document_ids: list[str] | None = None) -> list[RetrievedChunk]:
        request: dict[str, object] = {"include": ["documents", "metadatas"]}
        if document_ids:
            request["where"] = {"document_id": {"$in": document_ids}}
        result = self.collection.get(**request)
        ids = result.get("ids", [])
        documents = result.get("documents", [])
        metadatas = result.get("metadatas", [])

        chunks: list[RetrievedChunk] = []
        for chunk_id, text, metadata in zip(ids, documents, metadatas, strict=False):
            metadata = metadata or {}
            chunks.append(
                RetrievedChunk(
                    document_id=str(metadata.get("document_id", "")),
                    chunk_id=str(chunk_id),
                    source_name=str(metadata.get("source_name", "")),
                    format=str(metadata.get("format", "")),
                    chunk_index=int(metadata.get("chunk_index", 0)),
                    text=text or "",
                    score=0.0,
                    page=metadata.get("page") if isinstance(metadata.get("page"), int) else None,
                )
            )
        return sorted(chunks, key=lambda chunk: (chunk.document_id, chunk.chunk_index))

    def list_document_chunks(self, document_id: str) -> list[RetrievedChunk]:
        result = self.collection.get(
            where={"document_id": document_id},
            include=["documents", "metadatas"],
        )
        ids = result.get("ids", [])
        documents = result.get("documents", [])
        metadatas = result.get("metadatas", [])

        chunks: list[RetrievedChunk] = []
        for chunk_id, text, metadata in zip(ids, documents, metadatas, strict=False):
            metadata = metadata or {}
            chunks.append(
                RetrievedChunk(
                    document_id=str(metadata.get("document_id", "")),
                    chunk_id=str(chunk_id),
                    source_name=str(metadata.get("source_name", "")),
                    format=str(metadata.get("format", "")),
                    chunk_index=int(metadata.get("chunk_index", 0)),
                    text=text or "",
                    score=1.0,
                    page=metadata.get("page") if isinstance(metadata.get("page"), int) else None,
                )
            )
        return sorted(chunks, key=lambda chunk: chunk.chunk_index)

    def delete_document(self, document_id: str) -> None:
        self.collection.delete(where={"document_id": document_id})
