package com.example.ragllm.settings;

public record SettingsUpdateRequest(
        LlmSettingsRequest llm,
        EmbeddingSettingsRequest embedding,
        VectorStoreSettingsDto vectorStore,
        RagSettingsDto rag
) {
}
