from __future__ import annotations

import httpx
import pytest

from rag_service.main import create_app


@pytest.mark.anyio
async def test_status_reflects_runtime_config_without_restarting_service(tmp_path) -> None:
    app = create_app(chroma_persist_dir=tmp_path)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/providers/test",
            json={
                "kind": "status",
                "runtime_config": {
                    "llm_provider": "openrouter",
                    "llm_model": "openai/gpt-oss-120b:free",
                    "llm_api_key": "sk-test",
                    "embedding_provider": "google",
                    "embedding_model": "gemini-embedding-001",
                    "embedding_api_key": "gemini-test",
                    "vector_store_type": "chroma",
                    "vector_collection_name": "runtime_docs",
                    "vector_persist_dir": str(tmp_path / "runtime-chroma"),
                    "top_k": 5,
                    "score_threshold": 0.3,
                    "chunk_size": 500,
                    "chunk_overlap": 80,
                },
            },
        )

    assert response.status_code == 200
    assert response.json()["llm_model"] == "openai/gpt-oss-120b:free"
    assert response.json()["embedding_model"] == "gemini-embedding-001"
