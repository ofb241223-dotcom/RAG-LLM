package com.example.ragllm.document;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

public class InMemoryDocumentRepository implements DocumentRepository {
    private final AtomicLong ids = new AtomicLong(1);
    private final ConcurrentMap<Long, DocumentRecord> documents = new ConcurrentHashMap<>();

    @Override
    public DocumentRecord save(DocumentRecord document) {
        Long id = document.id() == null ? ids.getAndIncrement() : document.id();
        DocumentRecord withId = document.id() == null ? document.withId(id) : document;
        documents.put(id, withId);
        return withId;
    }

    @Override
    public Optional<DocumentRecord> findById(Long id) {
        return Optional.ofNullable(documents.get(id));
    }

    @Override
    public List<DocumentRecord> findAll() {
        return new ArrayList<>(documents.values());
    }

    @Override
    public Optional<DocumentRecord> deleteById(Long id) {
        return Optional.ofNullable(documents.remove(id));
    }
}
