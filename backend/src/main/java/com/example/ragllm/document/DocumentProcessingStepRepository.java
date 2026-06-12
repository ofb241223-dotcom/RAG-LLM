package com.example.ragllm.document;

import java.time.Instant;
import java.util.List;

interface DocumentProcessingStepRepository {
    void initializeForUpload(DocumentRecord document, Instant now);

    void resetForProcessing(DocumentRecord document, Instant now);

    void markActive(Long documentId, DocumentProcessingStepDefinition step, Instant now);

    void markComplete(Long documentId, DocumentProcessingStepDefinition step, String detail, Instant now);

    void markFailed(Long documentId, DocumentProcessingStepDefinition step, String detail, Instant now);

    List<DocumentProcessingStepRecord> findByDocumentId(Long documentId);
}
