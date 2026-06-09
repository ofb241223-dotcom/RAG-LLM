package com.example.ragllm.document;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class DocumentServiceTest {

    @TempDir
    private Path tempDir;

    @Test
    void marksDocumentFailedWhenRagIngestFails() {
        InMemoryDocumentRepository repository = new InMemoryDocumentRepository();
        FileDocumentStorage storage = new FileDocumentStorage(tempDir);
        RagServiceClient failingClient = new RagServiceClient() {
            @Override
            public RagIngestResponse ingest(RagIngestRequest request) {
                throw new RagServiceException("rag unavailable");
            }

            @Override
            public QaAnswer ask(QaAskRequest request) {
                throw new UnsupportedOperationException("unused");
            }

            @Override
            public void deleteDocument(String documentId) {
                throw new UnsupportedOperationException("unused");
            }
        };
        DocumentService service = new DocumentService(
                repository,
                storage,
                failingClient,
                Clock.fixed(Instant.parse("2026-06-10T10:15:30Z"), ZoneOffset.UTC)
        );
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "broken.pdf",
                "application/pdf",
                "content".getBytes(StandardCharsets.UTF_8)
        );

        DocumentDto dto = service.upload(file);

        assertThat(dto.status()).isEqualTo(DocumentProcessingStatus.FAILED);
        assertThat(dto.errorMessage()).contains("rag unavailable");
        DocumentRecord stored = repository.findById(dto.id()).orElseThrow();
        assertThat(stored.status()).isEqualTo(DocumentProcessingStatus.FAILED);
        assertThat(stored.errorMessage()).contains("rag unavailable");
    }
}
