import httpx
import pytest

from rag_service.main import app


@pytest.mark.anyio
async def test_health_returns_ok() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_observability_records_rag_requests() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await client.delete("/observability/requests")
        health_response = await client.get("/health")
        logs_response = await client.get("/observability/requests")

    assert health_response.status_code == 200
    assert logs_response.status_code == 200
    logs = logs_response.json()
    assert logs[0]["direction"] == "INBOUND"
    assert logs[0]["service"] == "RAG Service"
    assert logs[0]["method"] == "GET"
    assert logs[0]["path"] == "/health"
    assert logs[0]["status"] == 200
    assert logs[0]["duration_ms"] >= 0
