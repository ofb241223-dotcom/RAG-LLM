package com.example.ragllm.document;

import java.time.Instant;

record DocumentProcessingStepRecord(
        Long id,
        Long documentId,
        String key,
        String label,
        String detail,
        DocumentProcessingStepState state,
        Instant occurredAt,
        int position
) {
}
