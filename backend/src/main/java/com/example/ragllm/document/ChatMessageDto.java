package com.example.ragllm.document;

import java.time.Instant;
import java.util.List;

public record ChatMessageDto(
        Long id,
        ChatRole role,
        String content,
        ChatMessageStatus status,
        Instant createdAt,
        List<ChatCitationDto> citations,
        String errorMessage
) {
    public ChatMessageDto {
        citations = citations == null ? List.of() : List.copyOf(citations);
    }
}
