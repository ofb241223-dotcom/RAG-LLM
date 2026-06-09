package com.example.ragllm.document;

import java.time.Instant;

public record DocumentDto(
        Long id,
        String originalFilename,
        DocumentFormat format,
        DocumentProcessingStatus status,
        long sizeBytes,
        Instant uploadedAt,
        Instant updatedAt,
        Integer chunkCount,
        Integer vectorCount,
        String errorMessage
) {
    public static DocumentDto from(DocumentRecord record) {
        return new DocumentDto(
                record.id(),
                record.originalFilename(),
                record.format(),
                record.status(),
                record.sizeBytes(),
                record.uploadedAt(),
                record.updatedAt(),
                record.chunkCount(),
                record.vectorCount(),
                record.errorMessage()
        );
    }
}
