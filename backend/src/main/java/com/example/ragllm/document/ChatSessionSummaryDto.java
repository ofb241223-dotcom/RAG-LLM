package com.example.ragllm.document;

import java.time.Instant;

public record ChatSessionSummaryDto(
        Long id,
        Long documentId,
        String title,
        ChatSessionStatus status,
        int messageCount,
        Instant createdAt,
        Instant updatedAt
) {
}
