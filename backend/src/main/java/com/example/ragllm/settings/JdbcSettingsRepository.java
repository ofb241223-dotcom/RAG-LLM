package com.example.ragllm.settings;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class JdbcSettingsRepository implements SettingsRepository {
    private static final int SETTINGS_ID = 1;
    private static final RowMapper<SystemSettings> MAPPER = (rs, rowNum) -> new SystemSettings(
            rs.getString("llm_provider"),
            rs.getString("llm_model"),
            rs.getString("llm_api_key_encrypted"),
            rs.getDouble("temperature"),
            rs.getInt("max_tokens"),
            rs.getDouble("top_p"),
            rs.getDouble("frequency_penalty"),
            rs.getInt("context_length"),
            rs.getBoolean("stream_output"),
            rs.getString("system_prompt"),
            rs.getString("embedding_provider"),
            rs.getString("embedding_model"),
            rs.getString("embedding_api_key_encrypted"),
            rs.getInt("embedding_batch_size"),
            rs.getString("vector_store_type"),
            rs.getString("vector_collection_name"),
            rs.getString("vector_persist_dir"),
            rs.getInt("top_k"),
            rs.getDouble("score_threshold"),
            rs.getInt("chunk_size"),
            rs.getInt("chunk_overlap"),
            rs.getBoolean("current_document_only"),
            rs.getBoolean("show_citations"),
            rs.getTimestamp("updated_at").toInstant(),
            rs.getString("updated_by")
    );

    private final JdbcTemplate jdbcTemplate;

    JdbcSettingsRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        ensureVectorStoreColumns();
    }

    @Override
    public Optional<SystemSettings> find() {
        List<SystemSettings> rows = jdbcTemplate.query("SELECT * FROM system_settings WHERE id = ?", MAPPER, SETTINGS_ID);
        return rows.stream().findFirst();
    }

    @Override
    public SystemSettings save(SystemSettings settings) {
        int updated = jdbcTemplate.update("""
                UPDATE system_settings
                SET llm_provider = ?, llm_model = ?, llm_api_key_encrypted = ?, temperature = ?,
                    max_tokens = ?, top_p = ?, frequency_penalty = ?, context_length = ?,
                    stream_output = ?, system_prompt = ?, embedding_provider = ?, embedding_model = ?,
                    embedding_api_key_encrypted = ?, embedding_batch_size = ?, vector_store_type = ?,
                    vector_collection_name = ?, vector_persist_dir = ?, top_k = ?, score_threshold = ?,
                    chunk_size = ?, chunk_overlap = ?, current_document_only = ?, show_citations = ?,
                    updated_at = ?, updated_by = ?
                WHERE id = ?
                """,
                settings.llmProvider(),
                settings.llmModel(),
                settings.llmApiKeyEncrypted(),
                settings.temperature(),
                settings.maxTokens(),
                settings.topP(),
                settings.frequencyPenalty(),
                settings.contextLength(),
                settings.streamOutput(),
                settings.systemPrompt(),
                settings.embeddingProvider(),
                settings.embeddingModel(),
                settings.embeddingApiKeyEncrypted(),
                settings.embeddingBatchSize(),
                settings.vectorStoreType(),
                settings.vectorCollectionName(),
                settings.vectorPersistDir(),
                settings.topK(),
                settings.scoreThreshold(),
                settings.chunkSize(),
                settings.chunkOverlap(),
                settings.currentDocumentOnly(),
                settings.showCitations(),
                Timestamp.from(settings.updatedAt()),
                settings.updatedBy(),
                SETTINGS_ID);
        if (updated == 0) {
            jdbcTemplate.update("""
                    INSERT INTO system_settings (
                      id, llm_provider, llm_model, llm_api_key_encrypted, temperature, max_tokens,
                      top_p, frequency_penalty, context_length, stream_output, system_prompt,
                      embedding_provider, embedding_model, embedding_api_key_encrypted, embedding_batch_size,
                      vector_store_type, vector_collection_name, vector_persist_dir,
                      top_k, score_threshold, chunk_size, chunk_overlap, current_document_only,
                      show_citations, updated_at, updated_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    SETTINGS_ID,
                    settings.llmProvider(),
                    settings.llmModel(),
                    settings.llmApiKeyEncrypted(),
                    settings.temperature(),
                    settings.maxTokens(),
                    settings.topP(),
                    settings.frequencyPenalty(),
                    settings.contextLength(),
                    settings.streamOutput(),
                    settings.systemPrompt(),
                    settings.embeddingProvider(),
                    settings.embeddingModel(),
                    settings.embeddingApiKeyEncrypted(),
                    settings.embeddingBatchSize(),
                    settings.vectorStoreType(),
                    settings.vectorCollectionName(),
                    settings.vectorPersistDir(),
                    settings.topK(),
                    settings.scoreThreshold(),
                    settings.chunkSize(),
                    settings.chunkOverlap(),
                    settings.currentDocumentOnly(),
                    settings.showCitations(),
                    Timestamp.from(settings.updatedAt()),
                    settings.updatedBy());
        }
        return settings;
    }

    static SystemSettings defaults(Instant now) {
        return new SystemSettings(
                "google",
                "gemini-3.1-flash-lite",
                null,
                0.2,
                1024,
                0.9,
                0.0,
                128000,
                false,
                """
                你是一个严谨的文档问答助手，只能依据给定引用片段回答。
                如果无法从资料中读取答案,请诚实说明""",
                "google",
                "gemini-embedding-001",
                null,
                10,
                "chroma",
                "rag_documents_v1",
                "./rag_data/chroma",
                5,
                0.3,
                500,
                80,
                true,
                true,
                now,
                "科大人"
        );
    }

    private void ensureVectorStoreColumns() {
        addColumnIfMissing("vector_store_type", "VARCHAR(32) NOT NULL DEFAULT 'chroma'");
        addColumnIfMissing("vector_collection_name", "VARCHAR(255) NOT NULL DEFAULT 'rag_documents_v1'");
        addColumnIfMissing("vector_persist_dir", "VARCHAR(1024) NOT NULL DEFAULT './rag_data/chroma'");
    }

    private void addColumnIfMissing(String columnName, String definition) {
        try {
            jdbcTemplate.queryForList("SELECT " + columnName + " FROM system_settings WHERE 1 = 0");
        } catch (DataAccessException error) {
            try {
                jdbcTemplate.execute("ALTER TABLE system_settings ADD " + columnName + " " + definition);
            } catch (DataAccessException ignored) {
                // The table may not exist yet during schema initialization, or another initializer may add it.
            }
        }
    }
}
