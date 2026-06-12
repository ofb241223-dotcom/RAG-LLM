package com.example.ragllm.document;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;

public class JdbcDocumentRepository implements DocumentRepository {
    private static final RowMapper<DocumentRecord> DOCUMENT_MAPPER = (rs, rowNum) -> new DocumentRecord(
            rs.getLong("id"),
            rs.getString("original_filename"),
            DocumentFormat.valueOf(rs.getString("format")),
            DocumentSource.valueOf(rs.getString("source")),
            DocumentProcessingStatus.valueOf(rs.getString("status")),
            rs.getLong("size_bytes"),
            rs.getString("storage_path"),
            rs.getString("rag_document_id"),
            integerOrNull(rs.getObject("chunk_count")),
            integerOrNull(rs.getObject("vector_count")),
            rs.getString("error_message"),
            instant(rs.getTimestamp("uploaded_at")),
            instant(rs.getTimestamp("updated_at"))
    );

    private final JdbcTemplate jdbcTemplate;

    public JdbcDocumentRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public DocumentRecord save(DocumentRecord document) {
        if (document.id() == null) {
            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbcTemplate.update(connection -> {
                PreparedStatement statement = connection.prepareStatement("""
                        INSERT INTO documents (
                          original_filename, format, source, status, size_bytes, storage_path, rag_document_id,
                          chunk_count, vector_count, error_message, uploaded_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, Statement.RETURN_GENERATED_KEYS);
                bindDocument(statement, document, false);
                return statement;
            }, keyHolder);
            Number key = keyHolder.getKey();
            return document.withId(key == null ? null : key.longValue());
        }

        jdbcTemplate.update("""
                UPDATE documents
                SET original_filename = ?, format = ?, source = ?, status = ?, size_bytes = ?, storage_path = ?,
                    rag_document_id = ?, chunk_count = ?, vector_count = ?, error_message = ?,
                    uploaded_at = ?, updated_at = ?
                WHERE id = ?
                """,
                document.originalFilename(),
                document.format().name(),
                document.source().name(),
                document.status().name(),
                document.sizeBytes(),
                document.storagePath(),
                document.ragDocumentId(),
                document.chunkCount(),
                document.vectorCount(),
                document.errorMessage(),
                timestamp(document.uploadedAt()),
                timestamp(document.updatedAt()),
                document.id());
        return document;
    }

    @Override
    public Optional<DocumentRecord> findById(Long id) {
        List<DocumentRecord> records = jdbcTemplate.query("SELECT * FROM documents WHERE id = ?", DOCUMENT_MAPPER, id);
        return records.stream().findFirst();
    }

    @Override
    public List<DocumentRecord> findAll() {
        return jdbcTemplate.query("SELECT * FROM documents", DOCUMENT_MAPPER);
    }

    @Override
    public int markReadyDocumentsForReprocess() {
        return jdbcTemplate.update("""
                UPDATE documents
                SET status = ?,
                    rag_document_id = NULL,
                    chunk_count = NULL,
                    vector_count = NULL,
                    error_message = ?,
                    updated_at = CURRENT_TIMESTAMP(6)
                WHERE status = ?
                """,
                DocumentProcessingStatus.REPROCESS_REQUIRED.name(),
                "模型或分块配置已变更，请重新处理文档。",
                DocumentProcessingStatus.READY.name());
    }

    @Override
    public Optional<DocumentRecord> deleteById(Long id) {
        Optional<DocumentRecord> record = findById(id);
        record.ifPresent(ignored -> jdbcTemplate.update("DELETE FROM documents WHERE id = ?", id));
        return record;
    }

    private static void bindDocument(PreparedStatement statement, DocumentRecord document, boolean includeId) throws java.sql.SQLException {
        statement.setString(1, document.originalFilename());
        statement.setString(2, document.format().name());
        statement.setString(3, document.source().name());
        statement.setString(4, document.status().name());
        statement.setLong(5, document.sizeBytes());
        statement.setString(6, document.storagePath());
        statement.setString(7, document.ragDocumentId());
        if (document.chunkCount() == null) {
            statement.setObject(8, null);
        } else {
            statement.setInt(8, document.chunkCount());
        }
        if (document.vectorCount() == null) {
            statement.setObject(9, null);
        } else {
            statement.setInt(9, document.vectorCount());
        }
        statement.setString(10, document.errorMessage());
        statement.setTimestamp(11, timestamp(document.uploadedAt()));
        statement.setTimestamp(12, timestamp(document.updatedAt()));
        if (includeId) {
            statement.setLong(13, document.id());
        }
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private static Integer integerOrNull(Object value) {
        return value == null ? null : ((Number) value).intValue();
    }
}
