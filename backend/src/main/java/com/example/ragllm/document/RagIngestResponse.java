package com.example.ragllm.document;

import com.fasterxml.jackson.annotation.JsonAlias;

public record RagIngestResponse(
        @JsonAlias("document_id") String documentId,
        String status,
        @JsonAlias("chunk_count") Integer chunkCount,
        @JsonAlias("vector_count") Integer vectorCount
) {
}
