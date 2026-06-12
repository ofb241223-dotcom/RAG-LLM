package com.example.ragllm.settings;

public record EmbeddingSettingsResponse(
        String provider,
        String model,
        boolean apiKeyConfigured,
        String apiKeyPreview,
        int batchSize,
        int reprocessRequiredCount
) {
}
