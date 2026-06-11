package com.example.ragllm.document;

import com.example.ragllm.settings.RuntimeModelConfig;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

record RagQaRequest(
        String question,
        @JsonProperty("document_ids") List<Long> documentIds,
        @JsonProperty("top_k") Integer topK,
        @JsonProperty("runtime_config") RuntimeModelConfig runtimeConfig
) {
    static RagQaRequest from(QaAskRequest request, RuntimeModelConfig runtimeConfig) {
        return new RagQaRequest(
                request.question(),
                request.documentIds(),
                request.topK(),
                runtimeConfig
        );
    }
}
