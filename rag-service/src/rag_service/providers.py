from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_fixed


class ProviderConfigurationError(RuntimeError):
    """Raised when a model provider cannot run because env configuration is missing."""


class ProviderRequestError(RuntimeError):
    """Raised when a configured provider request fails."""


@dataclass(frozen=True)
class LlmContext:
    chunk_id: str
    source_name: str
    text: str
    score: float


class EmbeddingProvider(Protocol):
    model: str

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Return one vector per input text."""


class LlmProvider(Protocol):
    model: str

    def generate_answer(self, *, question: str, contexts: Iterable[LlmContext]) -> str:
        """Generate an answer grounded in retrieved contexts."""


def _is_missing_key(value: str | None) -> bool:
    if value is None:
        return True
    normalized = value.strip().lower()
    return not normalized or normalized.startswith("replace-with") or normalized in {"change-me", "changeme"}


class OpenAICompatibleEmbeddingProvider:
    base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    def __init__(self, *, api_key: str | None, model: str) -> None:
        self.api_key = api_key
        self.model = model

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if _is_missing_key(self.api_key):
            raise ProviderConfigurationError("DASHSCOPE_API_KEY is not configured.")
        if not texts:
            return []

        client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        vectors: list[list[float]] = []
        for index in range(0, len(texts), 10):
            vectors.extend(self._embed_batch(client, texts[index : index + 10]))
        return vectors

    @retry(stop=stop_after_attempt(2), wait=wait_fixed(1), reraise=True)
    def _embed_batch(self, client: OpenAI, texts: list[str]) -> list[list[float]]:
        try:
            response = client.embeddings.create(model=self.model, input=texts)
        except Exception as error:
            raise ProviderRequestError("DashScope embedding request failed.") from error
        return [item.embedding for item in response.data]


class OpenAICompatibleLlmProvider:
    base_url = "https://api.deepseek.com"

    def __init__(self, *, api_key: str | None, model: str) -> None:
        self.api_key = api_key
        self.model = model

    def generate_answer(self, *, question: str, contexts: Iterable[LlmContext]) -> str:
        if _is_missing_key(self.api_key):
            raise ProviderConfigurationError("DEEPSEEK_API_KEY is not configured.")

        context_list = list(contexts)
        source_text = "\n\n".join(
            f"[{index}] 来源：{context.source_name}\n片段：{context.text}"
            for index, context in enumerate(context_list, start=1)
        )
        client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        try:
            response = client.chat.completions.create(
                model=self.model,
                temperature=0.2,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个严谨的文档问答助手，只能依据给定引用片段回答，并尽量标注依据编号。",
                    },
                    {
                        "role": "user",
                        "content": f"问题：{question}\n\n引用片段：\n{source_text}\n\n请给出中文答案。",
                    },
                ],
            )
        except Exception as error:
            raise ProviderRequestError("DeepSeek chat request failed.") from error

        return response.choices[0].message.content or ""
