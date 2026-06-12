package com.example.ragllm.document;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class JdbcDocumentProcessingStepRepository implements DocumentProcessingStepRepository {
    private static final RowMapper<DocumentProcessingStepRecord> MAPPER = (rs, rowNum) -> new DocumentProcessingStepRecord(
            rs.getLong("id"),
            rs.getLong("document_id"),
            rs.getString("step_key"),
            rs.getString("label"),
            rs.getString("detail"),
            DocumentProcessingStepState.valueOf(rs.getString("state")),
            rs.getTimestamp("occurred_at") == null ? null : rs.getTimestamp("occurred_at").toInstant(),
            rs.getInt("position")
    );

    private final JdbcTemplate jdbcTemplate;

    JdbcDocumentProcessingStepRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        ensureTable();
    }

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
        update(documentId, step, step.pendingDetail(), DocumentProcessingStepState.ACTIVE, now);
    }

    @Override
    public void markComplete(Long documentId, DocumentProcessingStepDefinition step, String detail, Instant now) {
        update(documentId, step, detail, DocumentProcessingStepState.COMPLETE, now);
    }

    @Override
    public void markFailed(Long documentId, DocumentProcessingStepDefinition step, String detail, Instant now) {
        update(documentId, step, detail, DocumentProcessingStepState.FAILED, now);
    }

    @Override
    public List<DocumentProcessingStepRecord> findByDocumentId(Long documentId) {
        return jdbcTemplate.query("""
                SELECT * FROM document_processing_steps
                WHERE document_id = ?
                ORDER BY position ASC
                """, MAPPER, documentId);
    }

    private void reset(DocumentRecord document, Instant now, boolean uploadIsCurrent) {
        jdbcTemplate.update("DELETE FROM document_processing_steps WHERE document_id = ?", document.id());
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
            jdbcTemplate.update("""
                    INSERT INTO document_processing_steps (document_id, step_key, label, detail, state, occurred_at, position)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    document.id(),
                    step.key(),
                    step.label(),
                    detail,
                    state.name(),
                    occurredAt == null ? null : Timestamp.from(occurredAt),
                    step.position());
        }
    }

    private void update(Long documentId, DocumentProcessingStepDefinition step, String detail, DocumentProcessingStepState state, Instant now) {
        jdbcTemplate.update("""
                UPDATE document_processing_steps
                SET detail = ?, state = ?, occurred_at = ?
                WHERE document_id = ? AND step_key = ?
                """,
                detail,
                state.name(),
                Timestamp.from(now),
                documentId,
                step.key());
    }

    private void ensureTable() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS document_processing_steps (
                  id BIGINT NOT NULL AUTO_INCREMENT,
                  document_id BIGINT NOT NULL,
                  step_key VARCHAR(32) NOT NULL,
                  label VARCHAR(64) NOT NULL,
                  detail VARCHAR(1024) NOT NULL,
                  state VARCHAR(32) NOT NULL,
                  occurred_at TIMESTAMP(6),
                  position INT NOT NULL,
                  PRIMARY KEY (id),
                  UNIQUE KEY uq_document_processing_step (document_id, step_key),
                  INDEX idx_document_processing_document (document_id, position)
                )
                """);
    }
}
