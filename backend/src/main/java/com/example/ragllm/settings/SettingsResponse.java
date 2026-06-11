package com.example.ragllm.settings;

import java.time.Instant;

public record SettingsResponse(
        LlmSettingsResponse llm,
        EmbeddingSettingsResponse embedding,
        VectorStoreSettingsDto vectorStore,
        RagSettingsDto rag,
        Instant updatedAt,
        String updatedBy
) {
}
