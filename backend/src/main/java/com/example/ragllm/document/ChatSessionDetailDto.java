package com.example.ragllm.document;

import java.time.Instant;
import java.util.List;

public record ChatSessionDetailDto(
        Long id,
        DocumentDto document,
        String title,
        ChatSessionStatus status,
        Instant createdAt,
        Instant updatedAt,
        List<ChatMessageDto> messages
) {
    public ChatSessionDetailDto {
        messages = messages == null ? List.of() : List.copyOf(messages);
    }
}
