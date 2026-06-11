package com.example.ragllm.document;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;

public class JdbcDocumentActivityRepository implements DocumentActivityRepository {
    private static final RowMapper<DocumentActivityRecord> MAPPER = (rs, rowNum) -> new DocumentActivityRecord(
            rs.getLong("id"),
            rs.getString("label"),
            DocumentActivityTone.valueOf(rs.getString("tone")),
            rs.getTimestamp("occurred_at").toInstant()
    );

    private final JdbcTemplate jdbcTemplate;

    public JdbcDocumentActivityRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        ensureTable();
    }

    @Override
    public DocumentActivityRecord save(DocumentActivityRecord activity) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO document_activity_events (label, tone, occurred_at)
                    VALUES (?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, activity.label());
            statement.setString(2, activity.tone().name());
            statement.setTimestamp(3, Timestamp.from(activity.occurredAt()));
            return statement;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return activity.withId(key == null ? null : key.longValue());
    }

    @Override
    public List<DocumentActivityRecord> findRecent(int limit) {
        return jdbcTemplate.query("""
                SELECT * FROM document_activity_events
                ORDER BY occurred_at DESC, id DESC
                LIMIT ?
                """, MAPPER, Math.max(0, limit));
    }

    @Override
    public boolean exists(DocumentActivityRecord activity) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM document_activity_events
                WHERE label = ? AND tone = ? AND occurred_at = ?
                """, Integer.class,
                activity.label(),
                activity.tone().name(),
                Timestamp.from(activity.occurredAt()));
        return count != null && count > 0;
    }

    private void ensureTable() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS document_activity_events (
                  id BIGINT NOT NULL AUTO_INCREMENT,
                  label VARCHAR(1024) NOT NULL,
                  tone VARCHAR(32) NOT NULL,
                  occurred_at TIMESTAMP(6) NOT NULL,
                  PRIMARY KEY (id),
                  INDEX idx_document_activity_occurred (occurred_at)
                )
                """);
    }
}
