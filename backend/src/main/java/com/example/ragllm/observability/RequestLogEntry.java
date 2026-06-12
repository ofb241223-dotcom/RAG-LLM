package com.example.ragllm.observability;

import java.time.Instant;

public record RequestLogEntry(
        long id,
        Instant timestamp,
        String direction,
        String service,
        String method,
        String path,
        Integer status,
        long durationMs,
        String summary
) {
}
