package com.example.ragllm.settings;

import com.fasterxml.jackson.annotation.JsonAlias;

public record SettingsTestResponse(
        String kind,
        boolean connected,
        String message,
        @JsonAlias("llm_model")
        String llmModel,
        @JsonAlias("embedding_model")
        String embeddingModel
) {
}
