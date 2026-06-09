package com.example.ragllm.document;

import java.time.Instant;

public record DocumentRecord(
        Long id,
        String originalFilename,
        DocumentFormat format,
        DocumentProcessingStatus status,
        long sizeBytes,
        String storagePath,
        String ragDocumentId,
        Integer chunkCount,
        Integer vectorCount,
        String errorMessage,
        Instant uploadedAt,
        Instant updatedAt
) {
    public static DocumentRecord uploaded(
            String originalFilename,
            DocumentFormat format,
            long sizeBytes,
            Instant now
    ) {
        return new DocumentRecord(
                null,
                originalFilename,
                format,
                DocumentProcessingStatus.UPLOADED,
                sizeBytes,
                null,
                null,
                null,
                null,
                null,
                now,
                now
        );
    }

    public DocumentRecord withId(Long id) {
        return new DocumentRecord(
                id,
                originalFilename,
                format,
                status,
                sizeBytes,
                storagePath,
                ragDocumentId,
                chunkCount,
                vectorCount,
                errorMessage,
                uploadedAt,
                updatedAt
        );
    }

    public DocumentRecord withStoragePath(String storagePath, Instant now) {
        return new DocumentRecord(
                id,
                originalFilename,
                format,
                status,
                sizeBytes,
                storagePath,
                ragDocumentId,
                chunkCount,
                vectorCount,
                errorMessage,
                uploadedAt,
                now
        );
    }

    public DocumentRecord parsing(Instant now) {
        return new DocumentRecord(
                id,
                originalFilename,
                format,
                DocumentProcessingStatus.PARSING,
                sizeBytes,
                storagePath,
                ragDocumentId,
                chunkCount,
                vectorCount,
                null,
                uploadedAt,
                now
        );
    }

    public DocumentRecord ready(RagIngestResponse response, Instant now) {
        return new DocumentRecord(
                id,
                originalFilename,
                format,
                DocumentProcessingStatus.READY,
                sizeBytes,
                storagePath,
                response.documentId(),
                response.chunkCount(),
                response.vectorCount(),
                null,
                uploadedAt,
                now
        );
    }

    public DocumentRecord failed(String message, Instant now) {
        return new DocumentRecord(
                id,
                originalFilename,
                format,
                DocumentProcessingStatus.FAILED,
                sizeBytes,
                storagePath,
                ragDocumentId,
                chunkCount,
                vectorCount,
                message,
                uploadedAt,
                now
        );
    }
}
