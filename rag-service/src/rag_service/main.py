from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from rag_service.config import Settings
from rag_service.documents.formats import SUPPORTED_FORMATS
from rag_service.documents.parsers import DocumentParsingError, create_default_parser_registry
from rag_service.providers import (
    EmbeddingProvider,
    LlmProvider,
    OpenAICompatibleEmbeddingProvider,
    OpenAICompatibleLlmProvider,
    ProviderConfigurationError,
    ProviderRequestError,
)
from rag_service.schemas import DeleteResponse, IngestResponse, QaRequest, QaResponse
from rag_service.service import DocumentPayload, EmptyDocumentError, RagService
from rag_service.vector_store import COLLECTION_NAME, ChromaVectorStore


def create_app(
    *,
    chroma_persist_dir: Path | str | None = None,
    embedding_provider: EmbeddingProvider | None = None,
    llm_provider: LlmProvider | None = None,
) -> FastAPI:
    app = FastAPI(title="RAG Service")
    settings = Settings()
    if chroma_persist_dir is not None:
        settings = settings.model_copy(update={"chroma_persist_dir": Path(chroma_persist_dir)})

    app.state.settings = settings
    app.state.embedding_provider = embedding_provider or OpenAICompatibleEmbeddingProvider(
        api_key=settings.dashscope_api_key,
        model=settings.dashscope_embedding_model,
    )
    app.state.llm_provider = llm_provider or OpenAICompatibleLlmProvider(
        api_key=settings.deepseek_api_key,
        model=settings.deepseek_model,
    )

    def get_service() -> RagService:
        if not hasattr(app.state, "rag_service"):
            app.state.rag_service = RagService(
                parser_registry=create_default_parser_registry(),
                embedding_provider=app.state.embedding_provider,
                llm_provider=app.state.llm_provider,
                vector_store=ChromaVectorStore(Path(app.state.settings.chroma_persist_dir)),
            )
        return app.state.rag_service

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

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
    ) -> IngestResponse:
        try:
            content = await file.read()
            return get_service().ingest(
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

    @app.post("/qa", response_model=QaResponse)
    def ask(request: QaRequest) -> QaResponse:
        try:
            return get_service().ask(
                question=request.question,
                document_ids=request.document_ids,
                top_k=request.top_k,
            )
        except ProviderConfigurationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except ProviderRequestError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.delete("/documents/{document_id}", response_model=DeleteResponse)
    def delete_document(document_id: str) -> DeleteResponse:
        get_service().delete_document(document_id)
        return DeleteResponse(document_id=document_id, deleted=True)

    return app


app = create_app()
