from __future__ import annotations

from types import SimpleNamespace

import pytest

from rag_service.providers import (
    GoogleGeminiEmbeddingProvider,
    GoogleGeminiLlmProvider,
    LlmContext,
    OpenRouterEmbeddingProvider,
    OpenRouterLlmProvider,
    ProviderConfigurationError,
    ProviderRequestError,
)


class FakeModels:
    def __init__(self) -> None:
        self.embed_calls: list[dict[str, object]] = []
        self.generate_calls: list[dict[str, object]] = []

    def embed_content(self, **kwargs: object) -> object:
        self.embed_calls.append(kwargs)
        contents = kwargs["contents"]
        return SimpleNamespace(
            embeddings=[
                SimpleNamespace(values=[float(index), float(len(text))])
                for index, text in enumerate(contents)  # type: ignore[arg-type]
            ]
        )

    def generate_content(self, **kwargs: object) -> object:
        self.generate_calls.append(kwargs)
        return SimpleNamespace(text="基于引用片段的回答。")


class FakeGoogleClient:
    def __init__(self) -> None:
        self.models = FakeModels()


def test_google_embedding_provider_batches_texts_with_retrieval_task_type() -> None:
    fake_client = FakeGoogleClient()
    captured_keys: list[str] = []
    request_logs: list[dict[str, object]] = []

    provider = GoogleGeminiEmbeddingProvider(
        api_key="embedding-key",
        model="gemini-embedding-001",
        client_factory=lambda api_key: captured_keys.append(api_key) or fake_client,
        request_logger=request_logs.append,
    )

    vectors = provider.embed_texts(["第一段", "第二段"], task_type="RETRIEVAL_DOCUMENT")

    assert captured_keys == ["embedding-key"]
    assert vectors == [[0.0, 3.0], [1.0, 3.0]]
    assert fake_client.models.embed_calls == [
        {
            "model": "gemini-embedding-001",
            "contents": ["第一段", "第二段"],
            "config": {"task_type": "RETRIEVAL_DOCUMENT"},
        }
    ]
    assert request_logs == [
        {
            "direction": "PROVIDER",
            "service": "Google Gemini",
            "method": "EMBED",
            "path": "gemini-embedding-001",
            "status": 200,
            "summary": "2 texts",
        }
    ]


def test_google_embedding_provider_requires_api_key() -> None:
    provider = GoogleGeminiEmbeddingProvider(api_key="", model="gemini-embedding-001")

    with pytest.raises(ProviderConfigurationError, match="GOOGLE_EMBEDDING_API_KEY"):
        provider.embed_texts(["第一段"])


def test_google_embedding_provider_wraps_client_creation_errors() -> None:
    provider = GoogleGeminiEmbeddingProvider(
        api_key="embedding-key",
        model="gemini-embedding-001",
        client_factory=lambda _api_key: (_ for _ in ()).throw(ImportError("missing socksio")),
    )

    with pytest.raises(ProviderRequestError, match="Google Gemini embedding request failed"):
        provider.embed_texts(["第一段"])


def test_google_llm_provider_generates_grounded_answer_request() -> None:
    fake_client = FakeGoogleClient()
    captured_keys: list[str] = []
    request_logs: list[dict[str, object]] = []
    provider = GoogleGeminiLlmProvider(
        api_key="llm-key",
        model="gemini-3.1-flash-lite",
        client_factory=lambda api_key: captured_keys.append(api_key) or fake_client,
        request_logger=request_logs.append,
    )

    answer = provider.generate_answer(
        question="Transformer 的核心组件有哪些？",
        contexts=[
            LlmContext(chunk_id="c1", source_name="自然语言处理综述.docx", text="多头注意力是核心组件。", score=0.91),
        ],
    )

    assert captured_keys == ["llm-key"]
    assert answer == "基于引用片段的回答。"
    assert fake_client.models.generate_calls[0]["model"] == "gemini-3.1-flash-lite"
    request_text = fake_client.models.generate_calls[0]["contents"]
    assert "只能依据给定引用片段回答" in request_text
    assert "每个关键结论、名单项、判断句后都要标注引用编号" in request_text
    assert "Transformer 的核心组件有哪些？" in request_text
    assert "[1] 来源：自然语言处理综述.docx" in request_text
    assert "多头注意力是核心组件。" in request_text
    assert request_logs == [
        {
            "direction": "PROVIDER",
            "service": "Google Gemini",
            "method": "CHAT",
            "path": "gemini-3.1-flash-lite",
            "status": 200,
            "summary": "1 contexts",
        }
    ]


def test_google_llm_provider_requires_api_key() -> None:
    provider = GoogleGeminiLlmProvider(api_key="", model="gemini-3.1-flash-lite")

    with pytest.raises(ProviderConfigurationError, match="GOOGLE_LLM_API_KEY"):
        provider.generate_answer(question="问题", contexts=[])


class FakeOpenAiEmbeddings:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        return SimpleNamespace(data=[SimpleNamespace(embedding=[1.0, 2.0])])


class FakeOpenAiChatCompletions:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="OpenRouter 回答"))])


class FakeOpenAiClient:
    def __init__(self) -> None:
        self.embeddings = FakeOpenAiEmbeddings()
        self.chat = SimpleNamespace(completions=FakeOpenAiChatCompletions())


def test_openrouter_embedding_provider_uses_openai_compatible_embeddings() -> None:
    fake_client = FakeOpenAiClient()
    provider = OpenRouterEmbeddingProvider(
        api_key="openrouter-key",
        model="openai/text-embedding-3-small",
        client_factory=lambda **_kwargs: fake_client,
    )

    vectors = provider.embed_texts(["测试文本"], task_type="RETRIEVAL_DOCUMENT")

    assert vectors == [[1.0, 2.0]]
    assert fake_client.embeddings.calls == [
        {"model": "openai/text-embedding-3-small", "input": ["测试文本"]}
    ]


def test_openrouter_llm_provider_uses_openai_compatible_chat() -> None:
    fake_client = FakeOpenAiClient()
    provider = OpenRouterLlmProvider(
        api_key="openrouter-key",
        model="openai/gpt-oss-120b:free",
        client_factory=lambda **_kwargs: fake_client,
    )

    answer = provider.generate_answer(
        question="问题是什么？",
        contexts=[LlmContext(chunk_id="c1", source_name="doc.txt", text="片段内容", score=0.9)],
    )

    assert answer == "OpenRouter 回答"
    call = fake_client.chat.completions.calls[0]
    assert call["model"] == "openai/gpt-oss-120b:free"
    assert call["temperature"] == 0.2
    assert "只能依据给定引用片段回答" in call["messages"][0]["content"]
    assert "每个关键结论、名单项、判断句后都要标注引用编号" in call["messages"][1]["content"]
    assert "[1] 来源：doc.txt" in call["messages"][1]["content"]
    assert "片段内容" in call["messages"][1]["content"]
