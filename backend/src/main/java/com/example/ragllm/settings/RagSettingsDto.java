package com.example.ragllm.settings;

public record RagSettingsDto(
        int topK,
        double scoreThreshold,
        int chunkSize,
        int chunkOverlap,
        boolean currentDocumentOnly,
        boolean showCitations
) {
}
