package com.example.ragllm.document;

import java.time.Instant;

public record DocumentRecord(
        Long id,
        String originalFilename,
        DocumentFormat format,
        DocumentProcessingStatus status,
        long sizeBytes,
        Instant uploadedAt
) {
}
