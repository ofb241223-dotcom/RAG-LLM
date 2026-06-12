import json
import time
from pathlib import Path

from fastapi import Request
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from rag_service.config import Settings
from rag_service.documents.formats import SUPPORTED_FORMATS
from rag_service.documents.parsers import DocumentParsingError, create_default_parser_registry
from rag_service.providers import (
    EmbeddingProvider,
    GoogleGeminiEmbeddingProvider,
    GoogleGeminiLlmProvider,
    LlmProvider,
    LlmContext,
    OpenAICompatibleEmbeddingProvider,
    OpenAICompatibleLlmProvider,
    OpenRouterEmbeddingProvider,
    OpenRouterLlmProvider,
    ProviderConfigurationError,
    ProviderRequestError,
)
from rag_service.schemas import (
    ChunkResponse,
    DeleteResponse,
    DeleteRequest,
    IngestResponse,
    ProviderTestRequest,
    ProviderTestResponse,
    QaRequest,
    QaResponse,
    RuntimeModelConfig,
    RuntimeConfigRequest,
)
from rag_service.service import DocumentPayload, EmptyDocumentError, RagService
from rag_service.observability import RequestLogStore, elapsed_ms
from rag_service.vector_store import COLLECTION_NAME, ChromaVectorStore


def create_app(
    *,
    chroma_persist_dir: Path | str | None = None,
    embedding_provider: EmbeddingProvider | None = None,
    llm_provider: LlmProvider | None = None,
    settings: Settings | None = None,
) -> FastAPI:
    app = FastAPI(title="RAG Service")
    settings = settings or Settings()
    if chroma_persist_dir is not None:
        settings = settings.model_copy(update={"chroma_persist_dir": Path(chroma_persist_dir)})

    app.state.settings = settings
    app.state.request_log_store = RequestLogStore()

    @app.middleware("http")
    async def request_logging_middleware(request: Request, call_next):
        if not should_log_request(request):
            return await call_next(request)
        started = time.perf_counter()
        response = await call_next(request)
        app.state.request_log_store.record(
            direction="INBOUND",
            service="RAG Service",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=elapsed_ms(started),
            summary=request.headers.get("content-type", ""),
        )
        return response

    def record_provider_event(event: dict[str, object]) -> None:
        app.state.request_log_store.record(
            direction=str(event.get("direction", "PROVIDER")),
            service=str(event.get("service", "")),
            method=str(event.get("method", "")),
            path=str(event.get("path", "")),
            status=event.get("status") if isinstance(event.get("status"), int) else None,
            duration_ms=event.get("duration_ms") if isinstance(event.get("duration_ms"), int) else 0,
            summary=str(event.get("summary", "")),
        )

    app.state.embedding_provider = embedding_provider or create_embedding_provider(settings, request_logger=record_provider_event)
    app.state.llm_provider = llm_provider or create_llm_provider(settings, request_logger=record_provider_event)

    def create_parser_registry() -> object:
        current_settings = app.state.settings
        return create_default_parser_registry(
            mineru_api_token=current_settings.mineru_api_token,
            mineru_api_base_url=current_settings.mineru_api_base_url,
            mineru_enabled=current_settings.mineru_enabled,
            mineru_model_version=current_settings.mineru_model_version,
            mineru_timeout_seconds=current_settings.mineru_timeout_seconds,
            mineru_poll_interval_seconds=current_settings.mineru_poll_interval_seconds,
            request_logger=record_provider_event,
        )

    def get_vector_store(runtime_config: RuntimeModelConfig | None = None) -> ChromaVectorStore:
        if runtime_config is not None:
            if runtime_config.vector_store_type.strip().lower() != "chroma":
                raise ValueError(f"Unsupported vector store: {runtime_config.vector_store_type}")
            return ChromaVectorStore(
                Path(runtime_config.vector_persist_dir),
                collection_name=runtime_config.vector_collection_name,
            )
        if not hasattr(app.state, "vector_store"):
            app.state.vector_store = ChromaVectorStore(Path(app.state.settings.chroma_persist_dir))
        return app.state.vector_store

    def get_service(runtime_config: RuntimeModelConfig | None = None) -> RagService:
        if runtime_config is not None:
            return RagService(
                parser_registry=create_parser_registry(),
                embedding_provider=create_embedding_provider(app.state.settings, runtime_config, record_provider_event),
                llm_provider=create_llm_provider(app.state.settings, runtime_config, record_provider_event),
                vector_store=get_vector_store(runtime_config),
                chunk_size=runtime_config.chunk_size,
                chunk_overlap=runtime_config.chunk_overlap,
                score_threshold=runtime_config.score_threshold,
                chunking_strategy=runtime_config.chunking_strategy,
                retrieval_mode=runtime_config.retrieval_mode,
                vector_weight=runtime_config.vector_weight,
                keyword_weight=runtime_config.keyword_weight,
                mmr_enabled=runtime_config.mmr_enabled,
                mmr_lambda=runtime_config.mmr_lambda,
            )
        if not hasattr(app.state, "rag_service"):
            app.state.rag_service = RagService(
                parser_registry=create_parser_registry(),
                embedding_provider=app.state.embedding_provider,
                llm_provider=app.state.llm_provider,
                vector_store=get_vector_store(),
            )
        return app.state.rag_service

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/observability/requests")
    def recent_requests(limit: int = 100) -> list[dict[str, object]]:
        return app.state.request_log_store.recent(limit)

    @app.delete("/observability/requests")
    def clear_requests() -> None:
        app.state.request_log_store.clear()

    @app.get("/status")
    def status() -> dict[str, object]:
        return {
            "supported_formats": [format_name.upper() for format_name in SUPPORTED_FORMATS],
            "embedding_model": app.state.embedding_provider.model,
            "llm_model": app.state.llm_provider.model,
            "vector_store": {
                "type": "chroma",
                "collection": COLLECTION_NAME,
                "persist_dir": str(app.state.settings.chroma_persist_dir),
            },
        }

    @app.post("/documents/ingest", response_model=IngestResponse)
    async def ingest_document(
        file: UploadFile = File(...),
        document_id: str | None = Form(default=None),
        runtime_config: str | None = Form(default=None),
    ) -> IngestResponse:
        try:
            parsed_runtime_config = parse_runtime_config(runtime_config)
            content = await file.read()
            return get_service(parsed_runtime_config).ingest(
                DocumentPayload(
                    content=content,
                    source_name=file.filename or "document",
                    document_id=document_id,
                )
            )
        except (ValueError, DocumentParsingError, EmptyDocumentError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except ProviderConfigurationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except ProviderRequestError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.post("/documents/ingest/events")
    async def ingest_document_events(
        file: UploadFile = File(...),
        document_id: str | None = Form(default=None),
        runtime_config: str | None = Form(default=None),
    ) -> StreamingResponse:
        try:
            parsed_runtime_config = parse_runtime_config(runtime_config)
            content = await file.read()
            payload = DocumentPayload(
                content=content,
                source_name=file.filename or "document",
                document_id=document_id,
            )
        except ValidationError as error:
            raise HTTPException(status_code=400, detail="Invalid runtime_config payload.") from error

        def stream_events():
            try:
                for event, _response in get_service(parsed_runtime_config).ingest_events(payload):
                    yield event.model_dump_json(exclude_none=True) + "\n"
            except (ValueError, DocumentParsingError, EmptyDocumentError) as error:
                raise HTTPException(status_code=400, detail=str(error)) from error
            except ProviderConfigurationError as error:
                raise HTTPException(status_code=503, detail=str(error)) from error
            except ProviderRequestError as error:
                raise HTTPException(status_code=502, detail=str(error)) from error

        return StreamingResponse(stream_events(), media_type="application/x-ndjson")

    @app.post("/qa", response_model=QaResponse)
    def ask(request: QaRequest) -> QaResponse:
        try:
            return get_service(request.runtime_config).ask(
                question=request.question,
                document_ids=request.document_ids,
                top_k=request.top_k or (request.runtime_config.top_k if request.runtime_config is not None else 5),
            )
        except ProviderConfigurationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except ProviderRequestError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.delete("/documents/{document_id}", response_model=DeleteResponse)
    def delete_document(document_id: str, request: DeleteRequest | None = Body(default=None)) -> DeleteResponse:
        get_service(request.runtime_config if request is not None else None).delete_document(document_id)
        return DeleteResponse(document_id=document_id, deleted=True)

    @app.post("/documents/{document_id}/chunks", response_model=list[ChunkResponse])
    def list_document_chunks(document_id: str, request: RuntimeConfigRequest | None = Body(default=None)) -> list[ChunkResponse]:
        return get_service(request.runtime_config if request is not None else None).list_chunks(document_id)

    @app.post("/providers/test", response_model=ProviderTestResponse)
    def test_provider(request: ProviderTestRequest) -> ProviderTestResponse:
        kind = request.kind.strip().lower()
        runtime_config = request.runtime_config
        embedding = create_embedding_provider(app.state.settings, runtime_config, record_provider_event)
        llm = create_llm_provider(app.state.settings, runtime_config, record_provider_event)
        if kind == "status":
            return ProviderTestResponse(
                kind=kind,
                connected=True,
                message="运行时配置已读取。",
                llm_model=llm.model,
                embedding_model=embedding.model,
            )
        try:
            if kind == "embedding":
                embedding.embed_texts(["连接测试"], task_type="RETRIEVAL_QUERY")
                message = "Embedding 服务连接成功。"
            elif kind == "llm":
                llm.generate_answer(
                    question="请用一句话回复连接测试。",
                    contexts=[LlmContext(chunk_id="test", source_name="settings", text="连接测试片段。", score=1.0)],
                )
                message = "LLM 服务连接成功。"
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported provider test kind: {request.kind}")
        except ProviderConfigurationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except ProviderRequestError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

        return ProviderTestResponse(
            kind=kind,
            connected=True,
            message=message,
            llm_model=llm.model,
            embedding_model=embedding.model,
        )

    return app


def parse_runtime_config(raw: str | None) -> RuntimeModelConfig | None:
    if raw is None or not raw.strip():
        return None
    try:
        return RuntimeModelConfig.model_validate_json(raw)
    except (ValidationError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="Invalid runtime_config payload.") from error


def should_log_request(request: Request) -> bool:
    return request.url.path != "/observability/requests"


def create_embedding_provider(
    settings: Settings,
    runtime_config: RuntimeModelConfig | None = None,
    request_logger=None,
) -> EmbeddingProvider:
    provider = (runtime_config.embedding_provider if runtime_config is not None else settings.model_provider).strip().lower()
    if provider == "google":
        return GoogleGeminiEmbeddingProvider(
            api_key=(runtime_config.embedding_api_key if runtime_config is not None else None)
            or settings.google_embedding_api_key
            or settings.gemini_api_key,
            model=runtime_config.embedding_model if runtime_config is not None else settings.google_embedding_model,
            batch_size=runtime_config.embedding_batch_size if runtime_config is not None else 10,
            request_logger=request_logger,
        )
    if provider == "openrouter":
        return OpenRouterEmbeddingProvider(
            api_key=(runtime_config.embedding_api_key if runtime_config is not None else None) or settings.openrouter_api_key,
            model=runtime_config.embedding_model if runtime_config is not None else settings.openrouter_embedding_model,
            batch_size=runtime_config.embedding_batch_size if runtime_config is not None else 10,
            request_logger=request_logger,
        )
    if provider in {"legacy", "openai-compatible", "dashscope"}:
        return OpenAICompatibleEmbeddingProvider(
            api_key=(runtime_config.embedding_api_key if runtime_config is not None else None) or settings.dashscope_api_key,
            model=runtime_config.embedding_model if runtime_config is not None else settings.dashscope_embedding_model,
            batch_size=runtime_config.embedding_batch_size if runtime_config is not None else 10,
            request_logger=request_logger,
        )
    raise ValueError(f"Unsupported embedding provider: {provider}")


def create_llm_provider(
    settings: Settings,
    runtime_config: RuntimeModelConfig | None = None,
    request_logger=None,
) -> LlmProvider:
    provider = (runtime_config.llm_provider if runtime_config is not None else settings.model_provider).strip().lower()
    if provider == "google":
        return GoogleGeminiLlmProvider(
            api_key=(runtime_config.llm_api_key if runtime_config is not None else None)
            or settings.google_llm_api_key
            or settings.gemini_api_key,
            model=runtime_config.llm_model if runtime_config is not None else settings.google_llm_model,
            temperature=runtime_config.temperature if runtime_config is not None else 0.2,
            max_tokens=runtime_config.max_tokens if runtime_config is not None else None,
            top_p=runtime_config.top_p if runtime_config is not None else None,
            frequency_penalty=runtime_config.frequency_penalty if runtime_config is not None else None,
            system_prompt=runtime_config.system_prompt if runtime_config is not None else None,
            request_logger=request_logger,
        )
    if provider == "openrouter":
        return OpenRouterLlmProvider(
            api_key=(runtime_config.llm_api_key if runtime_config is not None else None) or settings.openrouter_api_key,
            model=runtime_config.llm_model if runtime_config is not None else settings.openrouter_llm_model,
            temperature=runtime_config.temperature if runtime_config is not None else 0.2,
            max_tokens=runtime_config.max_tokens if runtime_config is not None else None,
            top_p=runtime_config.top_p if runtime_config is not None else None,
            frequency_penalty=runtime_config.frequency_penalty if runtime_config is not None else None,
            system_prompt=runtime_config.system_prompt if runtime_config is not None else None,
            request_logger=request_logger,
        )
    if provider in {"legacy", "openai-compatible", "deepseek"}:
        return OpenAICompatibleLlmProvider(
            api_key=(runtime_config.llm_api_key if runtime_config is not None else None) or settings.deepseek_api_key,
            model=runtime_config.llm_model if runtime_config is not None else settings.deepseek_model,
            temperature=runtime_config.temperature if runtime_config is not None else 0.2,
            max_tokens=runtime_config.max_tokens if runtime_config is not None else None,
            top_p=runtime_config.top_p if runtime_config is not None else None,
            frequency_penalty=runtime_config.frequency_penalty if runtime_config is not None else None,
            system_prompt=runtime_config.system_prompt if runtime_config is not None else None,
            request_logger=request_logger,
        )
    raise ValueError(f"Unsupported LLM provider: {provider}")


app = create_app()
