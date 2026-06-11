package com.example.ragllm.document;

public record ChatUpdateSessionRequest(
        String title,
        Boolean archived
) {
}
