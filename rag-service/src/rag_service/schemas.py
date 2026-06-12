from pydantic import BaseModel, Field, field_validator


class RuntimeModelConfig(BaseModel):
    llm_provider: str = "google"
    llm_model: str = "gemini-3.1-flash-lite"
    llm_api_key: str | None = None
    embedding_provider: str = "google"
    embedding_model: str = "gemini-embedding-001"
    embedding_api_key: str | None = None
    vector_store_type: str = "chroma"
    vector_collection_name: str = "rag_documents_v1"
    vector_persist_dir: str = "./rag_data/chroma"
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=65536)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    frequency_penalty: float = Field(default=0.0, ge=-2.0, le=2.0)
    system_prompt: str = "你是一个严谨的文档问答助手，只能依据给定引用片段回答。\n如果无法从资料中读取答案,请诚实说明"
    top_k: int = Field(default=5, ge=1, le=20)
    score_threshold: float = Field(default=0.3, ge=0.0, le=1.0)
    chunk_size: int = Field(default=500, ge=100, le=4000)
    chunk_overlap: int = Field(default=80, ge=0, le=2000)
    chunking_strategy: str = "structured"
    retrieval_mode: str = "hybrid"
    vector_weight: float = Field(default=0.65, ge=0.0, le=1.0)
    keyword_weight: float = Field(default=0.35, ge=0.0, le=1.0)
    mmr_enabled: bool = True
    mmr_lambda: float = Field(default=0.65, ge=0.0, le=1.0)
    context_length: int = Field(default=128000, ge=1024)
    stream_output: bool = True
    embedding_batch_size: int = Field(default=10, ge=1, le=100)
    current_document_only: bool = True
    show_citations: bool = True


class IngestResponse(BaseModel):
    document_id: str
    status: str
    format: str
    chunk_count: int
    vector_count: int
    source_name: str


class IngestEventResponse(BaseModel):
    stage: str
    status: str = "complete"
    detail: str
    document_id: str | None = None
    chunk_count: int | None = None
    vector_count: int | None = None
    characters: int | None = None


class DeleteResponse(BaseModel):
    document_id: str
    deleted: bool


class QaRequest(BaseModel):
    question: str = Field(min_length=1)
    document_ids: list[str] | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    runtime_config: RuntimeModelConfig | None = None

    @field_validator("document_ids", mode="before")
    @classmethod
    def normalize_document_ids(cls, value: object) -> list[str] | None:
        if value is None:
            return None
        if not isinstance(value, list):
            return value
        return [str(item) for item in value]


class CitationResponse(BaseModel):
    document_id: str
    chunk_id: str
    source_name: str
    format: str
    chunk_index: int
    score: float
    text: str
    page: int | None = None


class ChunkResponse(BaseModel):
    document_id: str
    chunk_id: str
    source_name: str
    format: str
    chunk_index: int
    text: str
    page: int | None = None


class QaResponse(BaseModel):
    answer: str
    citations: list[CitationResponse]


class ProviderTestRequest(BaseModel):
    kind: str = "status"
    runtime_config: RuntimeModelConfig | None = None


class ProviderTestResponse(BaseModel):
    kind: str
    connected: bool
    message: str
    llm_model: str
    embedding_model: str


class DeleteRequest(BaseModel):
    runtime_config: RuntimeModelConfig | None = None


class RuntimeConfigRequest(BaseModel):
    runtime_config: RuntimeModelConfig | None = None
