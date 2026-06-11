package com.example.ragllm.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.springframework.jdbc.core.JdbcTemplate;
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

    @Autowired
    private JdbcTemplate jdbcTemplate;

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
        jdbcTemplate.execute("SET REFERENTIAL_INTEGRITY FALSE");
        jdbcTemplate.update("DELETE FROM chat_citations");
        jdbcTemplate.update("DELETE FROM chat_messages");
        jdbcTemplate.update("DELETE FROM chat_sessions");
        jdbcTemplate.update("DELETE FROM documents");
        jdbcTemplate.update("DELETE FROM system_settings");
        jdbcTemplate.execute("ALTER TABLE documents ALTER COLUMN id RESTART WITH 1");
        jdbcTemplate.execute("ALTER TABLE chat_sessions ALTER COLUMN id RESTART WITH 1");
        jdbcTemplate.execute("ALTER TABLE chat_messages ALTER COLUMN id RESTART WITH 1");
        jdbcTemplate.execute("ALTER TABLE chat_citations ALTER COLUMN id RESTART WITH 1");
        jdbcTemplate.execute("SET REFERENTIAL_INTEGRITY TRUE");
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
        assertThat(ragServer.lastIngestBody()).contains("name=\"runtime_config\"");
        assertThat(ragServer.lastIngestBody()).contains("gemini-embedding-001");
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
    void listsUploadedDocumentChunksFromRagService() throws Exception {
        upload("notes.txt", "notes");

        mockMvc.perform(get("/api/documents/1/chunks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].document_id").value("1"))
                .andExpect(jsonPath("$[0].chunk_id").value("1-0"))
                .andExpect(jsonPath("$[0].source_name").value("notes.txt"))
                .andExpect(jsonPath("$[0].text").value("真实文本块内容"));

        assertThat(ragServer.lastChunksBody()).contains("runtime_config");
        assertThat(ragServer.lastChunksBody()).contains("gemini-embedding-001");
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
    void downloadsUploadedOriginalDocument() throws Exception {
        upload("download-me.txt", "download content");

        mockMvc.perform(get("/api/documents/1/download"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Content-Disposition")).contains("download-me.txt"))
                .andExpect(result -> assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).isEqualTo("download content"));
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

        assertThat(ragServer.lastQaBody()).contains("\"runtime_config\"");
        assertThat(ragServer.lastQaBody()).contains("\"llm_model\"");
        assertThat(ragServer.lastQaBody()).contains("gemini-3.1-flash-lite");
    }

    @Test
    void persistsDocumentsInJdbcRepository() throws Exception {
        upload("persistent.txt", "content");

        mockMvc.perform(get("/api/documents/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.originalFilename").value("persistent.txt"))
                .andExpect(jsonPath("$.status").value("READY"));

        mockMvc.perform(get("/api/documents")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].originalFilename").value("persistent.txt"));
    }

    @Test
    void managesPersistentChatSessionsByDocument() throws Exception {
        upload("chapter.pdf", "chapter content");
        upload("notes.txt", "notes content");

        String createResponse = mockMvc.perform(post("/api/chat/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentId":1,"title":"Transformer 架构详解与注意力机制"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.document.id").value(1))
                .andExpect(jsonPath("$.title").value("Transformer 架构详解与注意力机制"))
                .andExpect(jsonPath("$.messages", hasSize(0)))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        long sessionId = Long.parseLong(createResponse.replaceAll(".*\\\"id\\\":(\\d+).*", "$1"));

        mockMvc.perform(get("/api/chat/documents"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[?(@.id == 1)].sessionCount").value(1));

        mockMvc.perform(get("/api/chat/sessions")
                        .param("documentId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(sessionId))
                .andExpect(jsonPath("$[0].messageCount").value(0));

        mockMvc.perform(post("/api/chat/sessions/{id}/messages", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"question":"请解释多头注意力机制。","topK":5}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(sessionId))
                .andExpect(jsonPath("$.messages", hasSize(2)))
                .andExpect(jsonPath("$.messages[0].role").value("USER"))
                .andExpect(jsonPath("$.messages[0].content").value("请解释多头注意力机制。"))
                .andExpect(jsonPath("$.messages[1].role").value("ASSISTANT"))
                .andExpect(jsonPath("$.messages[1].status").value("SUCCESS"))
                .andExpect(jsonPath("$.messages[1].citations", hasSize(1)))
                .andExpect(jsonPath("$.messages[1].citations[0].chunkId").value("1-3"));

        mockMvc.perform(patch("/api/chat/sessions/{id}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"重命名后的会话"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("重命名后的会话"));

        mockMvc.perform(delete("/api/chat/sessions/{id}", sessionId))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/chat/sessions")
                        .param("documentId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void chatUsesSavedTopKWhenRequestOmitsTopK() throws Exception {
        upload("chapter.pdf", "chapter content");
        mockMvc.perform(post("/api/chat/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentId":1,"title":"新对话"}
                                """))
                .andExpect(status().isCreated());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "rag": {
                                    "topK": 7,
                                    "scoreThreshold": 0.30,
                                    "chunkSize": 500,
                                    "chunkOverlap": 80,
                                    "currentDocumentOnly": true,
                                    "showCitations": true
                                  }
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/chat/sessions/1/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"question":"默认 Top-K 是多少？"}
                                """))
                .andExpect(status().isOk());

        assertThat(ragServer.lastQaBody()).contains("\"top_k\":7");
    }

    @Test
    void chatPersistsUserAndAssistantErrorWhenRagQaFails() throws Exception {
        upload("chapter.pdf", "chapter content");
        mockMvc.perform(post("/api/chat/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentId":1,"title":"新对话"}
                                """))
                .andExpect(status().isCreated());
        ragServer.failNextQa();

        mockMvc.perform(post("/api/chat/sessions/1/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"question":"这个问题会失败吗？"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages", hasSize(2)))
                .andExpect(jsonPath("$.messages[0].role").value("USER"))
                .andExpect(jsonPath("$.messages[1].role").value("ASSISTANT"))
                .andExpect(jsonPath("$.messages[1].status").value("ERROR"))
                .andExpect(jsonPath("$.messages[1].errorMessage", containsString("qa unavailable")));

        mockMvc.perform(get("/api/chat/sessions/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages", hasSize(2)))
                .andExpect(jsonPath("$.messages[1].status").value("ERROR"));
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
        private final AtomicInteger qaStatus = new AtomicInteger(200);
        private final AtomicReference<String> lastIngestContentType = new AtomicReference<>("");
        private final AtomicReference<String> lastIngestBody = new AtomicReference<>("");
        private final AtomicReference<String> lastChunksBody = new AtomicReference<>("");
        private final AtomicReference<String> lastQaBody = new AtomicReference<>("");
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
            qaStatus.set(200);
            lastIngestContentType.set("");
            lastIngestBody.set("");
            lastChunksBody.set("");
            lastQaBody.set("");
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

        private void failNextQa() {
            qaStatus.set(502);
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
            if ("POST".equals(exchange.getRequestMethod()) && exchange.getRequestURI().getPath().endsWith("/chunks")) {
                handleChunks(exchange);
                return;
            }

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

        private void handleChunks(HttpExchange exchange) throws IOException {
            lastChunksBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String path = exchange.getRequestURI().getPath();
            String documentId = path.substring("/documents/".length(), path.length() - "/chunks".length());
            send(exchange, 200, """
                    [
                      {
                        "document_id": "%s",
                        "source_name": "notes.txt",
                        "chunk_id": "%s-0",
                        "format": "TXT",
                        "chunk_index": 0,
                        "text": "真实文本块内容",
                        "page": null
                      }
                    ]
                    """.formatted(documentId, documentId));
        }

        private void handleQa(HttpExchange exchange) throws IOException {
            String request = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            lastQaBody.set(request);
            int status = qaStatus.get();
            if (status != 200) {
                send(exchange, status, "{\"message\":\"qa unavailable\"}");
                return;
            }
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

        private String lastChunksBody() {
            return lastChunksBody.get();
        }

        private String lastQaBody() {
            return lastQaBody.get();
        }

        private List<String> deletedDocumentIds() {
            return List.copyOf(deletedDocumentIds);
        }
    }
}
