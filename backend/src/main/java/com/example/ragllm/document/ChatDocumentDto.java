package com.example.ragllm.document;

import java.time.Instant;

public record ChatDocumentDto(
        Long id,
        String originalFilename,
        DocumentFormat format,
        long sizeBytes,
        Integer chunkCount,
        Integer vectorCount,
        long sessionCount,
        Instant lastActiveAt
) {
    public static ChatDocumentDto from(DocumentRecord document, long sessionCount, Instant lastActiveAt) {
        return new ChatDocumentDto(
                document.id(),
                document.originalFilename(),
                document.format(),
                document.sizeBytes(),
                document.chunkCount(),
                document.vectorCount(),
                sessionCount,
                lastActiveAt
        );
    }
}
