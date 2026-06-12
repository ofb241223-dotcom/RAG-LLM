package com.example.ragllm.observability;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

@Component
public class RequestLogStore {
    private static final int MAX_ENTRIES = 200;

    private final AtomicLong sequence = new AtomicLong();
    private final ConcurrentLinkedDeque<RequestLogEntry> entries = new ConcurrentLinkedDeque<>();

    public RequestLogEntry record(
            String direction,
            String service,
            String method,
            String path,
            Integer status,
            long durationMs,
            String summary
    ) {
        RequestLogEntry entry = new RequestLogEntry(
                sequence.incrementAndGet(),
                Instant.now(),
                direction,
                service,
                method,
                path,
                status,
                Math.max(durationMs, 0),
                sanitizeSummary(summary)
        );
        entries.addFirst(entry);
        while (entries.size() > MAX_ENTRIES) {
            entries.pollLast();
        }
        return entry;
    }

    public List<RequestLogEntry> recent(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, MAX_ENTRIES));
        List<RequestLogEntry> recent = new ArrayList<>(safeLimit);
        for (RequestLogEntry entry : entries) {
            recent.add(entry);
            if (recent.size() >= safeLimit) {
                break;
            }
        }
        return recent;
    }

    public void clear() {
        entries.clear();
    }

    private String sanitizeSummary(String summary) {
        if (summary == null || summary.isBlank()) {
            return "";
        }
        String sanitized = summary
                .replaceAll("(?i)(authorization|api[_-]?key|token|secret)\\s*[:=]\\s*[^,\\s}]+", "$1=<redacted>")
                .replaceAll("(?i)bearer\\s+[A-Za-z0-9._~+/=-]+", "Bearer <redacted>");
        return sanitized.length() > 240 ? sanitized.substring(0, 240) + "..." : sanitized;
    }
}
