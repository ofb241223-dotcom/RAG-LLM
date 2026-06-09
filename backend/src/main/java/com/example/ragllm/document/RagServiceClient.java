package com.example.ragllm.document;

public interface RagServiceClient {
    RagIngestResponse ingest(RagIngestRequest request);

    QaAnswer ask(QaAskRequest request);

    void deleteDocument(String documentId);
}
