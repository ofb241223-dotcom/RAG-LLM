package com.example.ragllm.settings;

public record EmbeddingSettingsRequest(
        String provider,
        String model,
        String apiKey,
        Integer batchSize
) {
}
