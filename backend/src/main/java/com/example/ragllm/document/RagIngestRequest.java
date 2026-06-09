package com.example.ragllm.document;

public record RagIngestRequest(
        Long documentId,
        String storagePath,
        DocumentFormat format,
        String originalFilename
) {
    public static RagIngestRequest from(DocumentRecord record) {
        return new RagIngestRequest(
                record.id(),
                record.storagePath(),
                record.format(),
                record.originalFilename()
        );
    }
}
