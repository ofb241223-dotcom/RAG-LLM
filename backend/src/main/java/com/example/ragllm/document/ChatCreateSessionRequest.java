package com.example.ragllm.document;

public record ChatCreateSessionRequest(
        Long documentId,
        String title
) {
}
