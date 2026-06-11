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
import org.springframework.stereotype.Repository;

@Repository
public class JdbcChatRepository {
    private static final RowMapper<ChatSessionRecord> SESSION_MAPPER = (rs, rowNum) -> new ChatSessionRecord(
            rs.getLong("id"),
            rs.getLong("document_id"),
            rs.getString("title"),
            ChatSessionStatus.valueOf(rs.getString("status")),
            instant(rs.getTimestamp("created_at")),
            instant(rs.getTimestamp("updated_at"))
    );
    private static final RowMapper<ChatMessageRecord> MESSAGE_MAPPER = (rs, rowNum) -> new ChatMessageRecord(
            rs.getLong("id"),
            rs.getLong("session_id"),
            ChatRole.valueOf(rs.getString("role")),
            rs.getString("content"),
            ChatMessageStatus.valueOf(rs.getString("status")),
            rs.getString("error_message"),
            instant(rs.getTimestamp("created_at"))
    );
    private static final RowMapper<ChatCitationRecord> CITATION_MAPPER = (rs, rowNum) -> new ChatCitationRecord(
            rs.getLong("id"),
            rs.getLong("message_id"),
            rs.getLong("document_id"),
            rs.getString("filename"),
            rs.getString("chunk_id"),
            rs.getDouble("score"),
            rs.getString("text"),
            integerOrNull(rs.getObject("page")),
            rs.getInt("marker_index")
    );

    private final JdbcTemplate jdbcTemplate;

    public JdbcChatRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public long countSessionsByDocument(Long documentId) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM chat_sessions WHERE document_id = ?",
                Long.class,
                documentId
        );
        return count == null ? 0 : count;
    }

    public Instant lastActiveAtByDocument(Long documentId) {
        Timestamp timestamp = jdbcTemplate.queryForObject(
                "SELECT MAX(updated_at) FROM chat_sessions WHERE document_id = ?",
                Timestamp.class,
                documentId
        );
        return instant(timestamp);
    }

    public ChatSessionRecord createSession(Long documentId, String title, Instant now) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO chat_sessions (document_id, title, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, documentId);
            statement.setString(2, title);
            statement.setString(3, ChatSessionStatus.ACTIVE.name());
            statement.setTimestamp(4, timestamp(now));
            statement.setTimestamp(5, timestamp(now));
            return statement;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return findSession(key == null ? null : key.longValue()).orElseThrow();
    }

    public Optional<ChatSessionRecord> findSession(Long id) {
        List<ChatSessionRecord> sessions = jdbcTemplate.query("SELECT * FROM chat_sessions WHERE id = ?", SESSION_MAPPER, id);
        return sessions.stream().findFirst();
    }

    public List<ChatSessionRecord> listSessions(Long documentId) {
        return jdbcTemplate.query("""
                SELECT * FROM chat_sessions
                WHERE document_id = ?
                ORDER BY updated_at DESC, id DESC
                """, SESSION_MAPPER, documentId);
    }

    public int countMessages(Long sessionId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM chat_messages WHERE session_id = ?",
                Integer.class,
                sessionId
        );
        return count == null ? 0 : count;
    }

    public void updateSession(Long id, String title, ChatSessionStatus status, Instant now) {
        jdbcTemplate.update("""
                UPDATE chat_sessions
                SET title = ?, status = ?, updated_at = ?
                WHERE id = ?
                """, title, status.name(), timestamp(now), id);
    }

    public void touchSession(Long id, Instant now) {
        jdbcTemplate.update("UPDATE chat_sessions SET updated_at = ? WHERE id = ?", timestamp(now), id);
    }

    public void deleteSession(Long id) {
        jdbcTemplate.update("DELETE FROM chat_sessions WHERE id = ?", id);
    }

    public ChatMessageRecord createMessage(Long sessionId, ChatRole role, String content, ChatMessageStatus status, String errorMessage, Instant now) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO chat_messages (session_id, role, content, status, error_message, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, sessionId);
            statement.setString(2, role.name());
            statement.setString(3, content);
            statement.setString(4, status.name());
            statement.setString(5, errorMessage);
            statement.setTimestamp(6, timestamp(now));
            return statement;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return findMessage(key == null ? null : key.longValue()).orElseThrow();
    }

    public Optional<ChatMessageRecord> findMessage(Long id) {
        List<ChatMessageRecord> messages = jdbcTemplate.query("SELECT * FROM chat_messages WHERE id = ?", MESSAGE_MAPPER, id);
        return messages.stream().findFirst();
    }

    public List<ChatMessageRecord> listMessages(Long sessionId) {
        return jdbcTemplate.query("""
                SELECT * FROM chat_messages
                WHERE session_id = ?
                ORDER BY created_at ASC, id ASC
                """, MESSAGE_MAPPER, sessionId);
    }

    public void createCitation(Long messageId, QaSource source, int markerIndex) {
        jdbcTemplate.update("""
                INSERT INTO chat_citations (message_id, document_id, filename, chunk_id, score, text, page, marker_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                messageId,
                source.documentId(),
                source.filename(),
                source.chunkId(),
                source.score(),
                source.text(),
                source.page(),
                markerIndex);
    }

    public List<ChatCitationRecord> listCitations(Long messageId) {
        return jdbcTemplate.query("""
                SELECT * FROM chat_citations
                WHERE message_id = ?
                ORDER BY marker_index ASC, id ASC
                """, CITATION_MAPPER, messageId);
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
