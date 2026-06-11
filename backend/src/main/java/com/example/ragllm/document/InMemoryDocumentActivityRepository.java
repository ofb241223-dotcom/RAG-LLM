package com.example.ragllm.document;

import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

public class InMemoryDocumentActivityRepository implements DocumentActivityRepository {
    private final AtomicLong ids = new AtomicLong(1);
    private final ConcurrentMap<Long, DocumentActivityRecord> activities = new ConcurrentHashMap<>();

    @Override
    public DocumentActivityRecord save(DocumentActivityRecord activity) {
        Long id = activity.id() == null ? ids.getAndIncrement() : activity.id();
        DocumentActivityRecord withId = activity.id() == null ? activity.withId(id) : activity;
        activities.put(id, withId);
        return withId;
    }

    @Override
    public List<DocumentActivityRecord> findRecent(int limit) {
        return activities.values().stream()
                .sorted(Comparator.comparing(DocumentActivityRecord::occurredAt).reversed())
                .limit(Math.max(0, limit))
                .toList();
    }

    @Override
    public boolean exists(DocumentActivityRecord activity) {
        return activities.values().stream().anyMatch(existing ->
                existing.label().equals(activity.label())
                        && existing.tone() == activity.tone()
                        && existing.occurredAt().equals(activity.occurredAt()));
    }
}
