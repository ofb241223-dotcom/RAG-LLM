package com.example.ragllm.document;

public enum DocumentProcessingStatus {
    UPLOADED,
    PARSING,
    EMBEDDING,
    REPROCESS_REQUIRED,
    READY,
    FAILED
}
