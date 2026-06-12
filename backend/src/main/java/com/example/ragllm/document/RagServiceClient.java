package com.example.ragllm.document;

import com.example.ragllm.settings.RuntimeModelConfig;
import com.example.ragllm.settings.SettingsTestResponse;
import java.util.List;
import java.util.function.Consumer;

public interface RagServiceClient {
    RagIngestResponse ingest(RagIngestRequest request, RuntimeModelConfig runtimeConfig);

    RagIngestResponse ingestWithProgress(RagIngestRequest request, RuntimeModelConfig runtimeConfig, Consumer<RagIngestEvent> eventConsumer);

    QaAnswer ask(QaAskRequest request, RuntimeModelConfig runtimeConfig);

    SettingsTestResponse testProvider(String kind, RuntimeModelConfig runtimeConfig);

    List<DocumentChunkDto> listChunks(String documentId, RuntimeModelConfig runtimeConfig);

    void deleteDocument(String documentId, RuntimeModelConfig runtimeConfig);
}
