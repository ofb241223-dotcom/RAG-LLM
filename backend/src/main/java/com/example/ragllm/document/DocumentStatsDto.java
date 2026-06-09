package com.example.ragllm.document;

public record DocumentStatsDto(
        long totalDocuments,
        long readyDocuments,
        double successRate,
        long vectorCount
) {
}
