package com.example.ragllm.document;

import java.time.Instant;

public record DocumentProcessingStepDto(
        Long id,
        String key,
        String label,
        String detail,
        DocumentProcessingStepState state,
        Instant occurredAt
) {
    static DocumentProcessingStepDto from(DocumentProcessingStepRecord record) {
        return new DocumentProcessingStepDto(
                record.id(),
                record.key(),
                record.label(),
                record.detail(),
                record.state(),
                record.occurredAt()
        );
    }
}
