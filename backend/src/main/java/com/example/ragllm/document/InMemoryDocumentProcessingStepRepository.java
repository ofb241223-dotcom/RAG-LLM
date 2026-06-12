package com.example.ragllm.document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

class InMemoryDocumentProcessingStepRepository implements DocumentProcessingStepRepository {
    private final AtomicLong ids = new AtomicLong(1);
    private final Map<Long, List<DocumentProcessingStepRecord>> steps = new ConcurrentHashMap<>();

    @Override
    public void initializeForUpload(DocumentRecord document, Instant now) {
        reset(document, now, true);
    }

    @Override
    public void resetForProcessing(DocumentRecord document, Instant now) {
        reset(document, now, true);
    }

    @Override
    public void markActive(Long documentId, DocumentProcessingStepDefinition step, Instant now) {
        replace(documentId, step, step.pendingDetail(), DocumentProcessingStepState.ACTIVE, now);
    }

    @Override
    public void markComplete(Long documentId, DocumentProcessingStepDefinition step, String detail, Instant now) {
        replace(documentId, step, detail, DocumentProcessingStepState.COMPLETE, now);
    }

    @Override
    public void markFailed(Long documentId, DocumentProcessingStepDefinition step, String detail, Instant now) {
        replace(documentId, step, detail, DocumentProcessingStepState.FAILED, now);
    }

    @Override
    public List<DocumentProcessingStepRecord> findByDocumentId(Long documentId) {
        return steps.getOrDefault(documentId, List.of()).stream()
                .sorted(Comparator.comparingInt(DocumentProcessingStepRecord::position))
                .toList();
    }

    private void reset(DocumentRecord document, Instant now, boolean uploadIsCurrent) {
        List<DocumentProcessingStepRecord> records = new ArrayList<>();
        for (DocumentProcessingStepDefinition step : DocumentProcessingStepDefinition.values()) {
            DocumentProcessingStepState state = DocumentProcessingStepState.PENDING;
            Instant occurredAt = null;
            String detail = step.pendingDetail();
            if (step == DocumentProcessingStepDefinition.UPLOAD) {
                state = DocumentProcessingStepState.COMPLETE;
                occurredAt = uploadIsCurrent ? now : document.uploadedAt();
                detail = step.completeDetail();
            } else if (step == DocumentProcessingStepDefinition.EXTRACT) {
                state = DocumentProcessingStepState.ACTIVE;
                occurredAt = now;
            }
            records.add(new DocumentProcessingStepRecord(ids.getAndIncrement(), document.id(), step.key(), step.label(), detail, state, occurredAt, step.position()));
        }
        steps.put(document.id(), records);
    }

    private void replace(Long documentId, DocumentProcessingStepDefinition step, String detail, DocumentProcessingStepState state, Instant now) {
        steps.computeIfPresent(documentId, (ignored, current) -> current.stream()
                .map(record -> record.key().equals(step.key())
                        ? new DocumentProcessingStepRecord(record.id(), documentId, record.key(), record.label(), detail, state, now, record.position())
                        : record)
                .toList());
    }
}
