package com.example.ragllm.document;

import com.example.ragllm.settings.RuntimeModelConfig;
import com.example.ragllm.settings.SettingsTestResponse;
import java.util.List;

public interface RagServiceClient {
    RagIngestResponse ingest(RagIngestRequest request, RuntimeModelConfig runtimeConfig);

    QaAnswer ask(QaAskRequest request, RuntimeModelConfig runtimeConfig);

    SettingsTestResponse testProvider(String kind, RuntimeModelConfig runtimeConfig);

    List<DocumentChunkDto> listChunks(String documentId, RuntimeModelConfig runtimeConfig);

    void deleteDocument(String documentId, RuntimeModelConfig runtimeConfig);
}
