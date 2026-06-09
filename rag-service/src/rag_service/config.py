from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    chroma_persist_dir: Path = Path("./rag_data/chroma")
    dashscope_api_key: str | None = None
    dashscope_embedding_model: str = "text-embedding-v4"
    deepseek_api_key: str | None = None
    deepseek_model: str = "deepseek-v4-flash"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )
