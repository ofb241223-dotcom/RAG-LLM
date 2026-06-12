package com.example.ragllm.document;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record QaAskRequest(
        String question,
        @JsonProperty("document_ids")
        @JsonAlias({"document_ids", "documentIds"}) List<Long> documentIds,
        @JsonProperty("top_k")
        @JsonAlias("topK")
        Integer topK
) {
    public QaAskRequest {
        documentIds = documentIds == null ? null : List.copyOf(documentIds);
    }
}
