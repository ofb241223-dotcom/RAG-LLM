package com.example.ragllm.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.ragllm.settings.RuntimeModelConfig;
import com.example.ragllm.settings.SettingsService;
import com.example.ragllm.settings.SettingsTestResponse;
import java.util.List;
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
            public RagIngestResponse ingest(RagIngestRequest request, RuntimeModelConfig runtimeConfig) {
                throw new RagServiceException("rag unavailable");
            }

            @Override
            public QaAnswer ask(QaAskRequest request, RuntimeModelConfig runtimeConfig) {
                throw new UnsupportedOperationException("unused");
            }

            @Override
            public SettingsTestResponse testProvider(String kind, RuntimeModelConfig runtimeConfig) {
                throw new UnsupportedOperationException("unused");
            }

            @Override
            public List<DocumentChunkDto> listChunks(String documentId, RuntimeModelConfig runtimeConfig) {
                throw new UnsupportedOperationException("unused");
            }

            @Override
            public void deleteDocument(String documentId, RuntimeModelConfig runtimeConfig) {
                throw new UnsupportedOperationException("unused");
            }
        };
        SettingsService settingsService = mock(SettingsService.class);
        when(settingsService.currentRuntimeConfig()).thenReturn(new RuntimeModelConfig(
                "google",
                "gemini-3.1-flash-lite",
                "",
                "google",
                "gemini-embedding-001",
                "",
                "chroma",
                "rag_documents_v1",
                "./rag_data/chroma",
                0.2,
                1024,
                0.9,
                0.0,
                "只基于文档回答。",
                5,
                0.3,
                500,
                80,
                128000,
                true,
                10,
                true,
                true
        ));
        DocumentService service = new DocumentService(
                repository,
                storage,
                failingClient,
                Clock.fixed(Instant.parse("2026-06-10T10:15:30Z"), ZoneOffset.UTC),
                settingsService
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
