package com.example.ragllm.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class DocumentApiTest {

    private static final FakeRagServer ragServer = FakeRagServer.start();

    @Autowired
    private MockMvc mockMvc;

    @DynamicPropertySource
    static void backendProperties(DynamicPropertyRegistry registry) {
        registry.add("rag.service.base-url", () -> ragServer.baseUrl());
        registry.add("rag.storage.upload-dir", () -> "target/test-uploads");
    }

    @AfterAll
    static void stopRagServer() {
        ragServer.stop();
    }

    @BeforeEach
    void resetRagServer() throws IOException {
        ragServer.reset();
        Path uploadDir = Path.of("target/test-uploads");
        if (Files.exists(uploadDir)) {
            try (var paths = Files.walk(uploadDir)) {
                paths.sorted((left, right) -> right.compareTo(left))
                        .forEach(path -> {
                            try {
                                Files.deleteIfExists(path);
                            } catch (IOException exception) {
                                throw new IllegalStateException("Failed to clean test upload path", exception);
                            }
                        });
            }
        }
    }

    @Test
    void uploadsSupportedDocumentAndReturnsReadyMetadata() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "chapter.pdf",
                "application/pdf",
                "pdf text".getBytes(StandardCharsets.UTF_8)
        );

        mockMvc.perform(multipart("/api/documents").file(file))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.originalFilename").value("chapter.pdf"))
                .andExpect(jsonPath("$.format").value("PDF"))
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.source").value("MANUAL_UPLOAD"))
                .andExpect(jsonPath("$.sizeBytes").value(8))
                .andExpect(jsonPath("$.chunkCount").value(3))
                .andExpect(jsonPath("$.vectorCount").value(3));

        assertThat(ragServer.lastIngestContentType()).startsWith("multipart/form-data");
        assertThat(ragServer.lastIngestBody()).contains("name=\"document_id\"");
        assertThat(ragServer.lastIngestBody()).contains("name=\"file\"");
        assertThat(ragServer.lastIngestBody()).contains("filename=\"chapter.pdf\"");
    }

    @Test
    void rejectsUnsupportedUploadFormat() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "slides.pptx",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "ppt".getBytes(StandardCharsets.UTF_8)
        );

        mockMvc.perform(multipart("/api/documents").file(file))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("Unsupported document format")));
    }

    @Test
    void rejectsEmptyUpload() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "empty.txt",
                "text/plain",
                new byte[0]
        );

        mockMvc.perform(multipart("/api/documents").file(file))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("empty")));
    }

    @Test
    void storesRagErrorMessageWhenIngestFails() throws Exception {
        ragServer.failNextIngest();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "broken.txt",
                "text/plain",
                "content".getBytes(StandardCharsets.UTF_8)
        );

        mockMvc.perform(multipart("/api/documents").file(file))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.errorMessage", containsString("rag unavailable")));
    }

    @Test
    void listsDocumentsWithPaginationAndStatusFilter() throws Exception {
        upload("first.txt", "one");
        upload("second.docx", "two");

        mockMvc.perform(get("/api/documents")
                        .param("page", "0")
                        .param("size", "1")
                        .param("status", "READY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.total").value(2));
    }

    @Test
    void listsDocumentsWithDocumentCenterFilters() throws Exception {
        upload("Alpha Guide.PDF", "one");
        upload("beta-notes.txt", "two");
        ragServer.failNextIngest();
        upload("alpha-draft.docx", "three");

        mockMvc.perform(get("/api/documents")
                        .param("format", "PDF")
                        .param("status", "READY")
                        .param("source", "MANUAL_UPLOAD")
                        .param("keyword", "alpha")
                        .param("startDate", LocalDate.now().minusDays(1).toString())
                        .param("endDate", LocalDate.now().plusDays(1).toString())
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].originalFilename").value("Alpha Guide.PDF"))
                .andExpect(jsonPath("$.items[0].source").value("MANUAL_UPLOAD"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void acceptsAllDocumentSourceFilterValuesEvenWhenNoRecordsMatch() throws Exception {
        upload("manual.txt", "one");

        mockMvc.perform(get("/api/documents")
                        .param("source", "LOCAL_IMPORT")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.total").value(0));

        mockMvc.perform(get("/api/documents")
                        .param("source", "API_IMPORT")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void returnsDocumentCenterStats() throws Exception {
        upload("ready.pdf", "one");
        ragServer.failNextIngest();
        upload("failed.txt", "two");

        mockMvc.perform(get("/api/documents/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalDocuments").value(2))
                .andExpect(jsonPath("$.readyDocuments").value(1))
                .andExpect(jsonPath("$.successRate").value(50.0))
                .andExpect(jsonPath("$.vectorCount").value(3));
    }

    @Test
    void getMissingDocumentReturnsNotFound() throws Exception {
        mockMvc.perform(get("/api/documents/404"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message", containsString("Document not found")));
    }

    @Test
    void getsUploadedDocumentById() throws Exception {
        upload("notes.txt", "notes");

        mockMvc.perform(get("/api/documents/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.originalFilename").value("notes.txt"))
                .andExpect(jsonPath("$.status").value("READY"));
    }

    @Test
    void reingestsExistingDocument() throws Exception {
        upload("retry.doc", "doc");

        mockMvc.perform(post("/api/documents/1/ingest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.chunkCount").value(3));
    }

    @Test
    void deletesDocumentRecordStoredFileAndRagVectors() throws Exception {
        upload("delete-me.txt", "delete content");
        Path storedFile = Path.of("target/test-uploads/1-delete-me.txt");
        assertThat(Files.exists(storedFile)).isTrue();

        mockMvc.perform(delete("/api/documents/1"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/documents/1"))
                .andExpect(status().isNotFound());
        assertThat(Files.exists(storedFile)).isFalse();
        assertThat(ragServer.deletedDocumentIds()).containsExactly("1");
    }

    @Test
    void treatsMissingRagVectorsAsNonFatalDuringDelete() throws Exception {
        upload("already-gone.txt", "content");
        ragServer.returnNotFoundForDelete();

        mockMvc.perform(delete("/api/documents/1"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/documents/1"))
                .andExpect(status().isNotFound());
        assertThat(ragServer.deletedDocumentIds()).containsExactly("1");
    }

    @Test
    void preservesDocumentWhenRagDeleteFails() throws Exception {
        upload("keep-on-rag-failure.txt", "content");
        ragServer.failDelete();

        mockMvc.perform(delete("/api/documents/1"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message", containsString("RAG service delete failed")));

        mockMvc.perform(get("/api/documents/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.originalFilename").value("keep-on-rag-failure.txt"));
    }

    @Test
    void returnsNotFoundWhenDeletingMissingDocument() throws Exception {
        mockMvc.perform(delete("/api/documents/404"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message", containsString("Document not found")));
    }

    @Test
    void batchDeletesDocumentsAndReportsMissingIds() throws Exception {
        upload("batch-one.txt", "one");
        upload("batch-two.txt", "two");

        mockMvc.perform(post("/api/documents/batch-delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ids":[1,404,2]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deletedCount").value(2))
                .andExpect(jsonPath("$.failures", hasSize(1)))
                .andExpect(jsonPath("$.failures[0].id").value(404))
                .andExpect(jsonPath("$.failures[0].message", containsString("Document not found")));

        mockMvc.perform(get("/api/documents/1"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/documents/2"))
                .andExpect(status().isNotFound());
        assertThat(ragServer.deletedDocumentIds()).containsExactly("1", "1");
    }

    @Test
    void rejectsQaRequestWithoutQuestion() throws Exception {
        mockMvc.perform(post("/api/qa/ask")
                        .contentType("application/json")
                        .content("{\"documentIds\":[1],\"topK\":5}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("question")));
    }

    @Test
    void proxiesQaRequestToRagService() throws Exception {
        mockMvc.perform(post("/api/qa/ask")
                        .contentType("application/json")
                        .content("""
                                {
                                  "question": "核心观点是什么？",
                                  "documentIds": [1],
                                  "topK": 5
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("这是一个基于检索片段生成的回答。"))
                .andExpect(jsonPath("$.sources", hasSize(1)))
                .andExpect(jsonPath("$.sources[0].documentId").value(1))
                .andExpect(jsonPath("$.sources[0].filename").value("chapter.pdf"))
                .andExpect(jsonPath("$.sources[0].chunkId").value("1-3"));
    }

    private void upload(String filename, String content) throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                filename,
                "application/octet-stream",
                content.getBytes(StandardCharsets.UTF_8)
        );
        mockMvc.perform(multipart("/api/documents").file(file))
                .andExpect(status().isCreated());
    }

    private static final class FakeRagServer {
        private final HttpServer server;
        private final AtomicInteger ingestStatus = new AtomicInteger(200);
        private final AtomicInteger deleteStatus = new AtomicInteger(204);
        private final AtomicReference<String> lastIngestContentType = new AtomicReference<>("");
        private final AtomicReference<String> lastIngestBody = new AtomicReference<>("");
        private final CopyOnWriteArrayList<String> deletedDocumentIds = new CopyOnWriteArrayList<>();

        private FakeRagServer() throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/documents/ingest", this::handleIngest);
            server.createContext("/documents/", this::handleDocument);
            server.createContext("/qa", this::handleQa);
            server.start();
        }

        private static FakeRagServer start() {
            try {
                return new FakeRagServer();
            } catch (IOException exception) {
                throw new IllegalStateException("Failed to start fake RAG server", exception);
            }
        }

        private String baseUrl() {
            return "http://127.0.0.1:" + server.getAddress().getPort();
        }

        private void reset() {
            ingestStatus.set(200);
            deleteStatus.set(204);
            lastIngestContentType.set("");
            lastIngestBody.set("");
            deletedDocumentIds.clear();
        }

        private void stop() {
            server.stop(0);
        }

        private void failNextIngest() {
            ingestStatus.set(503);
        }

        private void returnNotFoundForDelete() {
            deleteStatus.set(404);
        }

        private void failDelete() {
            deleteStatus.set(503);
        }

        private void handleIngest(HttpExchange exchange) throws IOException {
            lastIngestContentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            lastIngestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            int status = ingestStatus.get();
            String body = status == 200
                    ? "{\"document_id\":\"1\",\"status\":\"READY\",\"chunk_count\":3,\"vector_count\":3}"
                    : "{\"message\":\"rag unavailable\"}";
            send(exchange, status, body);
        }

        private void handleDocument(HttpExchange exchange) throws IOException {
            if (!"DELETE".equals(exchange.getRequestMethod())) {
                send(exchange, 405, "{\"message\":\"method not allowed\"}");
                return;
            }

            String documentId = exchange.getRequestURI().getPath().substring("/documents/".length());
            deletedDocumentIds.add(documentId);
            int status = deleteStatus.get();
            if (status == 204) {
                exchange.sendResponseHeaders(status, -1);
                exchange.close();
                return;
            }
            send(exchange, status, "{\"message\":\"document vectors not found\"}");
        }

        private void handleQa(HttpExchange exchange) throws IOException {
            String request = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (!request.contains("\"document_ids\"") || !request.contains("\"top_k\"")
                    || request.contains("\"documentIds\"") || request.contains("\"topK\"")) {
                send(exchange, 400, "{\"message\":\"expected snake_case QA request\"}");
                return;
            }
            send(exchange, 200, """
                    {
                      "answer": "这是一个基于检索片段生成的回答。",
                      "citations": [
                        {
                          "document_id": 1,
                          "source_name": "chapter.pdf",
                          "chunk_id": "1-3",
                          "score": 0.82,
                          "text": "引用片段"
                        }
                      ]
                    }
                    """);
        }

        private void send(HttpExchange exchange, int status, String body) throws IOException {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(bytes);
            }
        }

        private String lastIngestContentType() {
            return lastIngestContentType.get();
        }

        private String lastIngestBody() {
            return lastIngestBody.get();
        }

        private List<String> deletedDocumentIds() {
            return List.copyOf(deletedDocumentIds);
        }
    }
}
