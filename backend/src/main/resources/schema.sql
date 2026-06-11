CREATE TABLE IF NOT EXISTS documents (
  id BIGINT NOT NULL AUTO_INCREMENT,
  original_filename VARCHAR(512) NOT NULL,
  format VARCHAR(16) NOT NULL,
  source VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path VARCHAR(1024),
  rag_document_id VARCHAR(128),
  chunk_count INT,
  vector_count INT,
  error_message TEXT,
  uploaded_at TIMESTAMP(6) NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS document_activity_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  label VARCHAR(1024) NOT NULL,
  tone VARCHAR(32) NOT NULL,
  occurred_at TIMESTAMP(6) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_document_activity_occurred (occurred_at)
);

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
  INDEX idx_document_processing_document (document_id, position),
  CONSTRAINT fk_document_processing_document
    FOREIGN KEY (document_id) REFERENCES documents(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  document_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(6) NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_chat_sessions_document_updated (document_id, updated_at),
  CONSTRAINT fk_chat_sessions_document
    FOREIGN KEY (document_id) REFERENCES documents(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT NOT NULL AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP(6) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_chat_messages_session_created (session_id, created_at),
  CONSTRAINT fk_chat_messages_session
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_citations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  message_id BIGINT NOT NULL,
  document_id BIGINT NOT NULL,
  filename VARCHAR(512) NOT NULL,
  chunk_id VARCHAR(128) NOT NULL,
  score DOUBLE NOT NULL,
  text TEXT NOT NULL,
  page INT,
  marker_index INT NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_chat_citations_message (message_id),
  CONSTRAINT fk_chat_citations_message
    FOREIGN KEY (message_id) REFERENCES chat_messages(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_settings (
  id INT NOT NULL,
  llm_provider VARCHAR(32) NOT NULL,
  llm_model VARCHAR(255) NOT NULL,
  llm_api_key_encrypted TEXT,
  temperature DOUBLE NOT NULL,
  max_tokens INT NOT NULL,
  top_p DOUBLE NOT NULL,
  frequency_penalty DOUBLE NOT NULL,
  context_length INT NOT NULL,
  stream_output BOOLEAN NOT NULL,
  system_prompt TEXT NOT NULL,
  embedding_provider VARCHAR(32) NOT NULL,
  embedding_model VARCHAR(255) NOT NULL,
  embedding_api_key_encrypted TEXT,
  embedding_batch_size INT NOT NULL,
  vector_store_type VARCHAR(32) NOT NULL DEFAULT 'chroma',
  vector_collection_name VARCHAR(255) NOT NULL DEFAULT 'rag_documents_v1',
  vector_persist_dir VARCHAR(1024) NOT NULL DEFAULT './rag_data/chroma',
  top_k INT NOT NULL,
  score_threshold DOUBLE NOT NULL,
  chunk_size INT NOT NULL,
  chunk_overlap INT NOT NULL,
  current_document_only BOOLEAN NOT NULL,
  show_citations BOOLEAN NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL,
  updated_by VARCHAR(128) NOT NULL,
  PRIMARY KEY (id)
);
