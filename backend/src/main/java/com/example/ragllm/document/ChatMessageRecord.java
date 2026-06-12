package com.example.ragllm.document;

import java.time.Instant;

public record ChatMessageRecord(
        Long id,
        Long sessionId,
        ChatRole role,
        String content,
        ChatMessageStatus status,
        String errorMessage,
        Instant createdAt
) {
}
