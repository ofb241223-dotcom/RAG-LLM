package com.example.ragllm.document;

import java.time.Instant;

public record DocumentDto(
        Long id,
        String originalFilename,
        DocumentFormat format,
        DocumentProcessingStatus status,
        DocumentSource source,
        long sizeBytes,
        Instant uploadedAt,
        Instant updatedAt,
        Integer chunkCount,
        Integer vectorCount,
        String errorMessage
) {
    public static DocumentDto from(DocumentRecord record) {
        boolean requiresReprocess = record.status() == DocumentProcessingStatus.REPROCESS_REQUIRED;
        return new DocumentDto(
                record.id(),
                record.originalFilename(),
                record.format(),
                record.status(),
                record.source(),
                record.sizeBytes(),
                record.uploadedAt(),
                record.updatedAt(),
                requiresReprocess ? null : record.chunkCount(),
                requiresReprocess ? null : record.vectorCount(),
                requiresReprocess && record.errorMessage() == null ? "模型或分块配置已变更，请重新处理文档。" : record.errorMessage()
        );
    }
}
