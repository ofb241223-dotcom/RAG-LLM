package com.example.ragllm.document;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DocumentChunkDto(
        @JsonProperty("document_id") String documentId,
        @JsonProperty("chunk_id") String chunkId,
        @JsonProperty("source_name") String sourceName,
        String format,
        @JsonProperty("chunk_index") int chunkIndex,
        String text,
        Integer page
) {
}
