package com.example.ragllm.settings;

public record VectorStoreSettingsDto(
        String type,
        String collectionName,
        String persistDir
) {
}
