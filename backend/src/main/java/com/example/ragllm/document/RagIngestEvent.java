package com.example.ragllm.document;

import com.fasterxml.jackson.annotation.JsonAlias;

public record RagIngestEvent(
        String stage,
        String status,
        String detail,
        @JsonAlias("document_id") String documentId,
        @JsonAlias("chunk_count") Integer chunkCount,
        @JsonAlias("vector_count") Integer vectorCount,
        Integer characters
) {
}
