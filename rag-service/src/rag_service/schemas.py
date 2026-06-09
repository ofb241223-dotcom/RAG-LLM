from pydantic import BaseModel, Field, field_validator


class IngestResponse(BaseModel):
    document_id: str
    status: str
    format: str
    chunk_count: int
    vector_count: int
    source_name: str


class DeleteResponse(BaseModel):
    document_id: str
    deleted: bool


class QaRequest(BaseModel):
    question: str = Field(min_length=1)
    document_ids: list[str] | None = None
    top_k: int = Field(default=5, ge=1, le=20)

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


class QaResponse(BaseModel):
    answer: str
    citations: list[CitationResponse]
