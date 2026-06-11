package com.example.ragllm.document;

import java.time.Instant;

public record DocumentActivityDto(
        Long id,
        String label,
        DocumentActivityTone tone,
        Instant occurredAt
) {
    static DocumentActivityDto from(DocumentActivityRecord record) {
        return new DocumentActivityDto(record.id(), record.label(), record.tone(), record.occurredAt());
    }
}
