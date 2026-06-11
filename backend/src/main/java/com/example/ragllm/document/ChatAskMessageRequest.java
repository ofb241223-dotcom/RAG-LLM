package com.example.ragllm.document;

public record ChatAskMessageRequest(
        String question,
        Integer topK
) {
}
