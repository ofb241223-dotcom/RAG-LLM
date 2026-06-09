package com.example.ragllm.document;

import com.fasterxml.jackson.annotation.JsonAlias;

public record QaSource(
        @JsonAlias("document_id") Long documentId,
        @JsonAlias("source_name") String filename,
        @JsonAlias("chunk_id") String chunkId,
        Double score,
        String text
) {
}
