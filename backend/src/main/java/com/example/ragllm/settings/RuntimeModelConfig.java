package com.example.ragllm.settings;

import com.fasterxml.jackson.annotation.JsonProperty;

public record RuntimeModelConfig(
        @JsonProperty("llm_provider") String llmProvider,
        @JsonProperty("llm_model") String llmModel,
        @JsonProperty("llm_api_key") String llmApiKey,
        @JsonProperty("embedding_provider") String embeddingProvider,
        @JsonProperty("embedding_model") String embeddingModel,
        @JsonProperty("embedding_api_key") String embeddingApiKey,
        @JsonProperty("vector_store_type") String vectorStoreType,
        @JsonProperty("vector_collection_name") String vectorCollectionName,
        @JsonProperty("vector_persist_dir") String vectorPersistDir,
        @JsonProperty("temperature") double temperature,
        @JsonProperty("max_tokens") int maxTokens,
        @JsonProperty("top_p") double topP,
        @JsonProperty("frequency_penalty") double frequencyPenalty,
        @JsonProperty("system_prompt") String systemPrompt,
        @JsonProperty("top_k") int topK,
        @JsonProperty("score_threshold") double scoreThreshold,
        @JsonProperty("chunk_size") int chunkSize,
        @JsonProperty("chunk_overlap") int chunkOverlap,
        @JsonProperty("context_length") int contextLength,
        @JsonProperty("stream_output") boolean streamOutput,
        @JsonProperty("embedding_batch_size") int embeddingBatchSize,
        @JsonProperty("current_document_only") boolean currentDocumentOnly,
        @JsonProperty("show_citations") boolean showCitations
) {
}
