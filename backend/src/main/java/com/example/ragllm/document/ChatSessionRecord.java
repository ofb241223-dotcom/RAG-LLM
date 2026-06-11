package com.example.ragllm.document;

import java.time.Instant;

public record ChatSessionRecord(
        Long id,
        Long documentId,
        String title,
        ChatSessionStatus status,
        boolean archived,
        Instant createdAt,
        Instant updatedAt
) {
}
