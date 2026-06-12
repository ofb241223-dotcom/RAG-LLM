from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, Protocol

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_fixed

from rag_service.observability import RequestLogger

try:
    from google import genai
except ImportError:  # pragma: no cover - exercised only when dependency is missing in runtime env.
    genai = None


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

    def embed_texts(self, texts: list[str], *, task_type: str | None = None) -> list[list[float]]:
        """Return one vector per input text."""


class LlmProvider(Protocol):
    model: str

    def generate_answer(self, *, question: str, contexts: Iterable[LlmContext]) -> str:
        """Generate an answer grounded in retrieved contexts."""


def _citation_instruction() -> str:
    return (
        "请用 Markdown 输出中文答案。必须遵守：\n"
        "1. 只能依据给定引用片段回答，不能编造片段外信息。\n"
        "2. 每个关键结论、名单项、判断句后都要标注引用编号，格式必须是 [1]、[2]。\n"
        "3. 引用编号只能来自下方引用片段编号；如果资料不足，请说明无法判断，并标注最相关片段编号。\n"
        "4. 如果问题要求列举多人或多项，请逐项列出，并在每一项后标注对应引用编号。"
    )


def _format_source_text(contexts: Iterable[LlmContext]) -> str:
    return "\n\n".join(
        f"[{index}] 来源：{context.source_name}\n片段：{context.text}"
        for index, context in enumerate(contexts, start=1)
    )


def _is_missing_key(value: str | None) -> bool:
    if value is None:
        return True
    normalized = value.strip().lower()
    return not normalized or normalized.startswith("replace-with") or normalized in {"change-me", "changeme"}


class OpenAICompatibleEmbeddingProvider:
    base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    missing_key_message = "DASHSCOPE_API_KEY is not configured."
    request_error_message = "DashScope embedding request failed."
    service_name = "OpenAI Compatible"

    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        client_factory: Callable[..., object] = OpenAI,
        batch_size: int = 10,
        request_logger: RequestLogger | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.client_factory = client_factory
        self.batch_size = batch_size
        self.request_logger = request_logger

    def embed_texts(self, texts: list[str], *, task_type: str | None = None) -> list[list[float]]:
        if _is_missing_key(self.api_key):
            raise ProviderConfigurationError(self.missing_key_message)
        if not texts:
            return []

        client = self.client_factory(api_key=self.api_key, base_url=self.base_url)
        vectors: list[list[float]] = []
        for index in range(0, len(texts), self.batch_size):
            vectors.extend(self._embed_batch(client, texts[index : index + self.batch_size]))
        self._log("EMBED", 200, f"{len(texts)} texts")
        return vectors

    def _log(self, method: str, status: int, summary: str) -> None:
        if self.request_logger is not None:
            self.request_logger({
                "direction": "PROVIDER",
                "service": self.service_name,
                "method": method,
                "path": self.model,
                "status": status,
                "summary": summary,
            })

    @retry(stop=stop_after_attempt(2), wait=wait_fixed(1), reraise=True)
    def _embed_batch(self, client: object, texts: list[str]) -> list[list[float]]:
        try:
            response = client.embeddings.create(model=self.model, input=texts)
        except Exception as error:
            raise ProviderRequestError(self.request_error_message) from error
        return [item.embedding for item in response.data]


GoogleClientFactory = Callable[[str], object]


class OpenRouterEmbeddingProvider(OpenAICompatibleEmbeddingProvider):
    base_url = "https://openrouter.ai/api/v1"
    missing_key_message = "OPENROUTER_API_KEY is not configured."
    request_error_message = "OpenRouter embedding request failed."
    service_name = "OpenRouter"


def _create_google_client(api_key: str) -> object:
    if genai is None:
        raise ProviderConfigurationError("google-genai is not installed.")
    return genai.Client(api_key=api_key)


class GoogleGeminiEmbeddingProvider:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        client_factory: GoogleClientFactory | None = None,
        batch_size: int = 10,
        request_logger: RequestLogger | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.client_factory = client_factory or _create_google_client
        self.batch_size = batch_size
        self.request_logger = request_logger

    def embed_texts(self, texts: list[str], *, task_type: str | None = None) -> list[list[float]]:
        if _is_missing_key(self.api_key):
            raise ProviderConfigurationError("GOOGLE_EMBEDDING_API_KEY is not configured.")
        if not texts:
            return []

        try:
            client = self.client_factory(self.api_key)
            embeddings = []
            for index in range(0, len(texts), self.batch_size):
                response = client.models.embed_content(
                    model=self.model,
                    contents=texts[index : index + self.batch_size],
                    config={"task_type": task_type} if task_type else None,
                )
                batch_embeddings = getattr(response, "embeddings", None)
                if batch_embeddings is None:
                    raise ProviderRequestError("Google Gemini embedding response missing embeddings.")
                embeddings.extend(batch_embeddings)
        except Exception as error:
            if isinstance(error, ProviderRequestError):
                raise
            raise ProviderRequestError("Google Gemini embedding request failed.") from error

        self._log("EMBED", 200, f"{len(texts)} texts")
        return [list(embedding.values) for embedding in embeddings]

    def _log(self, method: str, status: int, summary: str) -> None:
        if self.request_logger is not None:
            self.request_logger({
                "direction": "PROVIDER",
                "service": "Google Gemini",
                "method": method,
                "path": self.model,
                "status": status,
                "summary": summary,
            })


class GoogleGeminiLlmProvider:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        client_factory: GoogleClientFactory | None = None,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        top_p: float | None = None,
        frequency_penalty: float | None = None,
        system_prompt: str | None = None,
        request_logger: RequestLogger | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.client_factory = client_factory or _create_google_client
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.frequency_penalty = frequency_penalty
        self.system_prompt = system_prompt or "你是一个严谨的文档问答助手，只能依据给定引用片段回答。\n如果无法从资料中读取答案,请诚实说明"
        self.request_logger = request_logger

    def generate_answer(self, *, question: str, contexts: Iterable[LlmContext]) -> str:
        if _is_missing_key(self.api_key):
            raise ProviderConfigurationError("GOOGLE_LLM_API_KEY is not configured.")

        context_list = list(contexts)
        source_text = _format_source_text(context_list)
        prompt = (
            f"{self.system_prompt}"
            f"\n\n{_citation_instruction()}\n\n"
            f"问题：{question}\n\n引用片段：\n{source_text}\n\n答案："
        )

        try:
            client = self.client_factory(self.api_key)
            config: dict[str, object] = {"temperature": self.temperature}
            if self.max_tokens is not None:
                config["max_output_tokens"] = self.max_tokens
            if self.top_p is not None:
                config["top_p"] = self.top_p
            if self.frequency_penalty is not None:
                config["frequency_penalty"] = self.frequency_penalty
            response = client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config,
            )
        except Exception as error:
            raise ProviderRequestError("Google Gemini chat request failed.") from error

        self._log("CHAT", 200, f"{len(context_list)} contexts")
        return getattr(response, "text", None) or ""

    def _log(self, method: str, status: int, summary: str) -> None:
        if self.request_logger is not None:
            self.request_logger({
                "direction": "PROVIDER",
                "service": "Google Gemini",
                "method": method,
                "path": self.model,
                "status": status,
                "summary": summary,
            })


class OpenAICompatibleLlmProvider:
    base_url = "https://api.deepseek.com"
    missing_key_message = "DEEPSEEK_API_KEY is not configured."
    request_error_message = "DeepSeek chat request failed."
    service_name = "OpenAI Compatible"

    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        client_factory: Callable[..., object] = OpenAI,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        top_p: float | None = None,
        frequency_penalty: float | None = None,
        system_prompt: str | None = None,
        request_logger: RequestLogger | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.client_factory = client_factory
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.frequency_penalty = frequency_penalty
        self.system_prompt = system_prompt or "你是一个严谨的文档问答助手，只能依据给定引用片段回答。\n如果无法从资料中读取答案,请诚实说明"
        self.request_logger = request_logger

    def generate_answer(self, *, question: str, contexts: Iterable[LlmContext]) -> str:
        if _is_missing_key(self.api_key):
            raise ProviderConfigurationError(self.missing_key_message)

        context_list = list(contexts)
        source_text = _format_source_text(context_list)
        client = self.client_factory(api_key=self.api_key, base_url=self.base_url)
        try:
            kwargs: dict[str, object] = {
                "model": self.model,
                "temperature": self.temperature,
                "messages": [
                    {
                        "role": "system",
                        "content": self.system_prompt,
                    },
                    {
                        "role": "user",
                        "content": f"{_citation_instruction()}\n\n问题：{question}\n\n引用片段：\n{source_text}\n\n答案：",
                    },
                ],
            }
            if self.max_tokens is not None:
                kwargs["max_tokens"] = self.max_tokens
            if self.top_p is not None:
                kwargs["top_p"] = self.top_p
            if self.frequency_penalty is not None:
                kwargs["frequency_penalty"] = self.frequency_penalty
            response = client.chat.completions.create(**kwargs)
        except Exception as error:
            raise ProviderRequestError(self.request_error_message) from error

        self._log("CHAT", 200, f"{len(context_list)} contexts")
        return response.choices[0].message.content or ""

    def _log(self, method: str, status: int, summary: str) -> None:
        if self.request_logger is not None:
            self.request_logger({
                "direction": "PROVIDER",
                "service": self.service_name,
                "method": method,
                "path": self.model,
                "status": status,
                "summary": summary,
            })


class OpenRouterLlmProvider(OpenAICompatibleLlmProvider):
    base_url = "https://openrouter.ai/api/v1"
    missing_key_message = "OPENROUTER_API_KEY is not configured."
    request_error_message = "OpenRouter chat request failed."
    service_name = "OpenRouter"
