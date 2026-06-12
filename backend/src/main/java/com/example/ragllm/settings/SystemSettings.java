package com.example.ragllm.settings;

import java.time.Instant;

record SystemSettings(
        String llmProvider,
        String llmModel,
        String llmApiKeyEncrypted,
        double temperature,
        int maxTokens,
        double topP,
        double frequencyPenalty,
        int contextLength,
        boolean streamOutput,
        String systemPrompt,
        String embeddingProvider,
        String embeddingModel,
        String embeddingApiKeyEncrypted,
        int embeddingBatchSize,
        String vectorStoreType,
        String vectorCollectionName,
        String vectorPersistDir,
        int topK,
        double scoreThreshold,
        int chunkSize,
        int chunkOverlap,
        boolean currentDocumentOnly,
        boolean showCitations,
        Instant updatedAt,
        String updatedBy
) {
}
