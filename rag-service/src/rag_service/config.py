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
    openrouter_embedding_model: str = "nvidia/llama-nemotron-embed-vl-1b-v2:free"
    openrouter_llm_model: str = "openai/gpt-oss-120b:free"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )
