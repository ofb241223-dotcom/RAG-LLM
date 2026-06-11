from typing import Iterable

import httpx
import pytest

from rag_service.main import create_app
from rag_service.config import Settings
from rag_service.providers import LlmContext


class FakeEmbeddingProvider:
    model = "fake-embedding"
    calls: list[tuple[list[str], str | None]]

    def __init__(self) -> None:
        self.calls = []

    def embed_texts(self, texts: list[str], *, task_type: str | None = None) -> list[list[float]]:
        self.calls.append((texts, task_type))
        return [[float(len(text)), float(sum(ord(char) for char in text) % 97), 1.0] for text in texts]


class FakeLlmProvider:
    model = "fake-llm"

    def generate_answer(self, *, question: str, contexts: Iterable[LlmContext]) -> str:
        joined = " | ".join(context.text for context in contexts)
        return f"问题：{question}\n依据：{joined}"


@pytest.mark.anyio
async def test_status_reports_runtime_configuration(tmp_path) -> None:
    app = create_app(
        chroma_persist_dir=tmp_path,
        embedding_provider=FakeEmbeddingProvider(),
        llm_provider=FakeLlmProvider(),
    )
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/status")

    assert response.status_code == 200
    assert response.json()["supported_formats"] == ["PDF", "TXT", "DOCX", "DOC"]
    assert response.json()["embedding_model"] == "fake-embedding"
    assert response.json()["llm_model"] == "fake-llm"
    assert response.json()["vector_store"]["collection"] == "rag_documents_v1"


@pytest.mark.anyio
async def test_ingest_qa_and_delete_round_trip_with_fake_providers(tmp_path) -> None:
    embedding_provider = FakeEmbeddingProvider()
    app = create_app(
        chroma_persist_dir=tmp_path,
        embedding_provider=embedding_provider,
        llm_provider=FakeLlmProvider(),
    )
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        ingest = await client.post(
            "/documents/ingest",
            data={"document_id": "doc-1"},
            files={"file": ("实验记录与结果分析.txt", "第一段内容。\n第二段说明 RAG 问答。", "text/plain")},
        )
        chunks = await client.post("/documents/doc-1/chunks", json={})
        answer = await client.post("/qa", json={"question": "RAG 问答是什么？", "document_ids": ["doc-1"], "top_k": 3})
        deleted = await client.delete("/documents/doc-1")
        answer_after_delete = await client.post("/qa", json={"question": "RAG 问答是什么？", "document_ids": ["doc-1"]})

    assert ingest.status_code == 200
    assert ingest.json() == {
        "document_id": "doc-1",
        "status": "READY",
        "format": "TXT",
        "chunk_count": 1,
        "vector_count": 1,
        "source_name": "实验记录与结果分析.txt",
    }

    assert chunks.status_code == 200
    assert chunks.json()[0]["document_id"] == "doc-1"
    assert chunks.json()[0]["chunk_id"] == "doc-1-0"
    assert chunks.json()[0]["source_name"] == "实验记录与结果分析.txt"
    assert "第一段内容" in chunks.json()[0]["text"]

    assert answer.status_code == 200
    assert "RAG 问答是什么？" in answer.json()["answer"]
    assert answer.json()["citations"][0]["document_id"] == "doc-1"
    assert answer.json()["citations"][0]["source_name"] == "实验记录与结果分析.txt"
    assert answer.json()["citations"][0]["chunk_id"] == "doc-1-0"

    assert deleted.status_code == 200
    assert deleted.json() == {"document_id": "doc-1", "deleted": True}
    assert answer_after_delete.status_code == 200
    assert answer_after_delete.json() == {"answer": "未检索到相关文档片段。", "citations": []}
    assert embedding_provider.calls[0][1] == "RETRIEVAL_DOCUMENT"
    assert embedding_provider.calls[1][1] == "RETRIEVAL_QUERY"


@pytest.mark.anyio
async def test_qa_accepts_numeric_document_ids_from_backend(tmp_path) -> None:
    app = create_app(
        chroma_persist_dir=tmp_path,
        embedding_provider=FakeEmbeddingProvider(),
        llm_provider=FakeLlmProvider(),
    )
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await client.post(
            "/documents/ingest",
            data={"document_id": "1"},
            files={"file": ("notes.txt", "RAG 问答使用检索片段生成答案。", "text/plain")},
        )
        response = await client.post("/qa", json={"question": "RAG 是什么？", "document_ids": [1], "top_k": 1})

    assert response.status_code == 200
    assert response.json()["citations"][0]["document_id"] == "1"


@pytest.mark.anyio
async def test_reingest_replaces_old_chunks_for_same_document_id(tmp_path) -> None:
    app = create_app(
        chroma_persist_dir=tmp_path,
        embedding_provider=FakeEmbeddingProvider(),
        llm_provider=FakeLlmProvider(),
    )
    transport = httpx.ASGITransport(app=app)
    old_text = "旧内容用于验证重处理清理。 " * 80
    new_text = "新内容用于验证重处理完成。"

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post(
            "/documents/ingest",
            data={"document_id": "doc-reprocess"},
            files={"file": ("notes.txt", old_text, "text/plain")},
        )
        second = await client.post(
            "/documents/ingest",
            data={"document_id": "doc-reprocess"},
            files={"file": ("notes.txt", new_text, "text/plain")},
        )
        answer = await client.post("/qa", json={"question": "旧内容还在吗？", "document_ids": ["doc-reprocess"], "top_k": 5})

    assert first.status_code == 200
    assert first.json()["chunk_count"] > second.json()["chunk_count"]
    assert second.status_code == 200
    assert answer.status_code == 200
    assert all("旧内容" not in citation["text"] for citation in answer.json()["citations"])
    assert any("新内容" in citation["text"] for citation in answer.json()["citations"])


@pytest.mark.anyio
async def test_ingest_rejects_unsupported_format(tmp_path) -> None:
    app = create_app(
        chroma_persist_dir=tmp_path,
        embedding_provider=FakeEmbeddingProvider(),
        llm_provider=FakeLlmProvider(),
    )
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/documents/ingest",
            files={"file": ("table.xlsx", b"data", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )

    assert response.status_code == 400
    assert "Unsupported document format" in response.json()["detail"]


@pytest.mark.anyio
async def test_ingest_rejects_empty_text(tmp_path) -> None:
    app = create_app(
        chroma_persist_dir=tmp_path,
        embedding_provider=FakeEmbeddingProvider(),
        llm_provider=FakeLlmProvider(),
    )
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/documents/ingest",
            files={"file": ("empty.txt", b"    \n\t", "text/plain")},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Document contains no extractable text."


@pytest.mark.anyio
async def test_missing_provider_configuration_returns_503(tmp_path) -> None:
    settings = Settings(_env_file=None, google_embedding_api_key=None, google_llm_api_key=None, gemini_api_key=None)
    app = create_app(chroma_persist_dir=tmp_path, settings=settings)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/documents/ingest",
            files={"file": ("notes.txt", b"hello", "text/plain")},
        )

    assert response.status_code == 503
    assert "GOOGLE_EMBEDDING_API_KEY" in response.json()["detail"]
