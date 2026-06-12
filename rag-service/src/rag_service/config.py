from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    chroma_persist_dir: Path = Path("./rag_data/chroma")
    model_provider: str = "google"
    google_embedding_api_key: str | None = None
    google_llm_api_key: str | None = None
    gemini_api_key: str | None = None
    google_embedding_model: str = "gemini-embedding-001"
    google_llm_model: str = "gemini-3.1-flash-lite"
    dashscope_api_key: str | None = None
    dashscope_embedding_model: str = "text-embedding-v4"
    deepseek_api_key: str | None = None
    deepseek_model: str = "deepseek-v4-flash"
    openrouter_api_key: str | None = None
    openrouter_embedding_model: str = "openai/text-embedding-3-small"
    openrouter_llm_model: str = "openai/gpt-oss-120b:free"
    mineru_api_token: str | None = None
    mineru_api_base_url: str = "https://mineru.net/api/v4"
    mineru_enabled: bool = True
    mineru_model_version: str = "vlm"
    mineru_timeout_seconds: int = 300
    mineru_poll_interval_seconds: float = 2.0

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )
