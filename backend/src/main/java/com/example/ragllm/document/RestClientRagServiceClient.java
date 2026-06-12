package com.example.ragllm.document;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.ragllm.settings.RuntimeModelConfig;
import com.example.ragllm.settings.SettingsTestResponse;
import com.example.ragllm.observability.RequestLogStore;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.nio.file.Path;
import java.util.function.Consumer;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatusCode;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

public class RestClientRagServiceClient implements RagServiceClient {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final ParameterizedTypeReference<List<DocumentChunkDto>> DOCUMENT_CHUNK_LIST =
            new ParameterizedTypeReference<>() {
            };

    private final RestClient restClient;
    private final RequestLogStore requestLogStore;

    public RestClientRagServiceClient(RestClient restClient, RequestLogStore requestLogStore) {
        this.restClient = restClient;
        this.requestLogStore = requestLogStore;
    }

    @Override
    public RagIngestResponse ingest(RagIngestRequest request, RuntimeModelConfig runtimeConfig) {
        long started = System.nanoTime();
        try {
            MultiValueMap<String, Object> body = buildIngestBody(request, runtimeConfig);
            RagIngestResponse response = restClient.post()
                    .uri("/documents/ingest")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(RagIngestResponse.class);
            if (response == null) {
                throw new RagServiceException("RAG service returned an empty ingest response");
            }
            recordRagCall("POST", "/documents/ingest", 200, started, "documentId=%s filename=%s".formatted(request.documentId(), request.originalFilename()));
            return response;
        } catch (RestClientResponseException exception) {
            recordRagCall("POST", "/documents/ingest", exception.getStatusCode().value(), started, extractErrorMessage(exception));
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (RestClientException exception) {
            recordRagCall("POST", "/documents/ingest", 0, started, exception.getMessage());
            throw new RagServiceException("RAG service request failed", exception);
        }
    }

    @Override
    public RagIngestResponse ingestWithProgress(RagIngestRequest request, RuntimeModelConfig runtimeConfig, Consumer<RagIngestEvent> eventConsumer) {
        long started = System.nanoTime();
        try {
            MultiValueMap<String, Object> body = buildIngestBody(request, runtimeConfig);
            RagIngestResponse ingestResponse = restClient.post()
                    .uri("/documents/ingest/events")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .accept(MediaType.APPLICATION_NDJSON)
                    .body(body)
                    .exchange((ignoredRequest, response) -> {
                        if (response.getStatusCode().isError()) {
                            throw new RagServiceException(extractErrorMessage(response.getStatusCode().value(), new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8)));
                        }
                        RagIngestResponse finalResponse = null;
                        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.getBody(), StandardCharsets.UTF_8))) {
                            String line;
                            while ((line = reader.readLine()) != null) {
                                if (line.isBlank()) {
                                    continue;
                                }
                                RagIngestEvent event = OBJECT_MAPPER.readValue(line, RagIngestEvent.class);
                                eventConsumer.accept(event);
                                if ("done".equalsIgnoreCase(event.stage())) {
                                    finalResponse = new RagIngestResponse(
                                            event.documentId(),
                                            "READY",
                                            event.chunkCount(),
                                            event.vectorCount()
                                    );
                                }
                            }
                        }
                        if (finalResponse == null) {
                            throw new RagServiceException("RAG service did not emit a final ingest event");
                        }
                        return finalResponse;
                    });
            recordRagCall("POST", "/documents/ingest/events", 200, started, "documentId=%s filename=%s".formatted(request.documentId(), request.originalFilename()));
            return ingestResponse;
        } catch (RagServiceException exception) {
            recordRagCall("POST", "/documents/ingest/events", 502, started, exception.getMessage());
            throw exception;
        } catch (RestClientResponseException exception) {
            recordRagCall("POST", "/documents/ingest/events", exception.getStatusCode().value(), started, extractErrorMessage(exception));
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (Exception exception) {
            recordRagCall("POST", "/documents/ingest/events", 0, started, exception.getMessage());
            throw new RagServiceException("RAG service progress request failed", exception);
        }
    }

    private MultiValueMap<String, Object> buildIngestBody(RagIngestRequest request, RuntimeModelConfig runtimeConfig) {
        if (!StringUtils.hasText(request.storagePath())) {
            throw new RagServiceException("Document storage path is missing");
        }

        String filename = StringUtils.hasText(request.originalFilename())
                ? request.originalFilename()
                : "document";
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("document_id", String.valueOf(request.documentId()));
        body.add("runtime_config", serializeRuntimeConfig(runtimeConfig));

        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        fileHeaders.setContentDispositionFormData("file", filename);
        body.add("file", new HttpEntity<>(new FileSystemResource(Path.of(request.storagePath())) {
            @Override
            public String getFilename() {
                return filename;
            }
        }, fileHeaders));
        return body;
    }

    @Override
    public QaAnswer ask(QaAskRequest request, RuntimeModelConfig runtimeConfig) {
        long started = System.nanoTime();
        try {
            QaAnswer response = restClient.post()
                    .uri("/qa")
                    .body(RagQaRequest.from(request, runtimeConfig))
                    .retrieve()
                    .body(QaAnswer.class);
            if (response == null) {
                throw new RagServiceException("RAG service returned an empty QA response");
            }
            recordRagCall("POST", "/qa", 200, started, "topK=%d documents=%s".formatted(request.topK(), request.documentIds()));
            return response;
        } catch (RestClientResponseException exception) {
            recordRagCall("POST", "/qa", exception.getStatusCode().value(), started, extractErrorMessage(exception));
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (RestClientException exception) {
            recordRagCall("POST", "/qa", 0, started, exception.getMessage());
            throw new RagServiceException("RAG service request failed", exception);
        }
    }

    @Override
    public SettingsTestResponse testProvider(String kind, RuntimeModelConfig runtimeConfig) {
        long started = System.nanoTime();
        try {
            SettingsTestResponse response = restClient.post()
                    .uri("/providers/test")
                    .body(new ProviderTestRequest(kind, runtimeConfig))
                    .retrieve()
                    .body(SettingsTestResponse.class);
            if (response == null) {
                throw new RagServiceException("RAG service returned an empty provider test response");
            }
            recordRagCall("POST", "/providers/test", 200, started, "kind=%s llm=%s embedding=%s".formatted(kind, response.llmModel(), response.embeddingModel()));
            return response;
        } catch (RestClientResponseException exception) {
            recordRagCall("POST", "/providers/test", exception.getStatusCode().value(), started, extractErrorMessage(exception));
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (RestClientException exception) {
            recordRagCall("POST", "/providers/test", 0, started, exception.getMessage());
            throw new RagServiceException("RAG service request failed", exception);
        }
    }

    @Override
    public void deleteDocument(String documentId, RuntimeModelConfig runtimeConfig) {
        if (!StringUtils.hasText(documentId)) {
            throw new RagServiceException("Document id is missing");
        }

        long started = System.nanoTime();
        try {
            restClient.method(HttpMethod.DELETE)
                    .uri("/documents/{documentId}", documentId)
                    .body(new RagDeleteRequest(runtimeConfig))
                    .retrieve()
                    .toBodilessEntity();
            recordRagCall("DELETE", "/documents/" + documentId, 204, started, "documentId=%s".formatted(documentId));
        } catch (RestClientResponseException exception) {
            if (isNotFound(exception.getStatusCode())) {
                recordRagCall("DELETE", "/documents/" + documentId, 404, started, "document already absent");
                return;
            }
            recordRagCall("DELETE", "/documents/" + documentId, exception.getStatusCode().value(), started, extractErrorMessage(exception));
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (RestClientException exception) {
            recordRagCall("DELETE", "/documents/" + documentId, 0, started, exception.getMessage());
            throw new RagServiceException("RAG service request failed", exception);
        }
    }

    @Override
    public List<DocumentChunkDto> listChunks(String documentId, RuntimeModelConfig runtimeConfig) {
        if (!StringUtils.hasText(documentId)) {
            throw new RagServiceException("Document id is missing");
        }

        long started = System.nanoTime();
        try {
            List<DocumentChunkDto> response = restClient.post()
                    .uri("/documents/{documentId}/chunks", documentId)
                    .body(new RagRuntimeConfigRequest(runtimeConfig))
                    .retrieve()
                    .body(DOCUMENT_CHUNK_LIST);
            List<DocumentChunkDto> chunks = response == null ? List.of() : response;
            recordRagCall("POST", "/documents/" + documentId + "/chunks", 200, started, "chunks=%d".formatted(chunks.size()));
            return chunks;
        } catch (RestClientResponseException exception) {
            recordRagCall("POST", "/documents/" + documentId + "/chunks", exception.getStatusCode().value(), started, extractErrorMessage(exception));
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (RestClientException exception) {
            recordRagCall("POST", "/documents/" + documentId + "/chunks", 0, started, exception.getMessage());
            throw new RagServiceException("RAG service request failed", exception);
        }
    }

    private void recordRagCall(String method, String path, Integer status, long started, String summary) {
        requestLogStore.record("OUTBOUND", "RAG Service", method, path, status, elapsedMs(started), summary);
    }

    private long elapsedMs(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }

    private boolean isNotFound(HttpStatusCode statusCode) {
        return statusCode != null && statusCode.value() == 404;
    }

    private String serializeRuntimeConfig(RuntimeModelConfig runtimeConfig) {
        try {
            return OBJECT_MAPPER.writeValueAsString(runtimeConfig);
        } catch (Exception exception) {
            throw new RagServiceException("Failed to serialize runtime config", exception);
        }
    }

    private String extractErrorMessage(RestClientResponseException exception) {
        return extractErrorMessage(exception.getStatusCode().value(), exception.getResponseBodyAsString());
    }

    private String extractErrorMessage(int statusCode, String body) {
        String fallback = "RAG service request failed with status " + statusCode;
        if (!StringUtils.hasText(body)) {
            return fallback;
        }

        try {
            JsonNode root = OBJECT_MAPPER.readTree(body);
            String detail = textField(root, "detail");
            if (StringUtils.hasText(detail)) {
                return detail;
            }
            String message = textField(root, "message");
            if (StringUtils.hasText(message)) {
                return message;
            }
        } catch (Exception ignored) {
            if (StringUtils.hasText(body)) {
                return body;
            }
        }
        return fallback;
    }

    private String textField(JsonNode root, String fieldName) {
        JsonNode value = root == null ? null : root.get(fieldName);
        if (value == null || value.isNull()) {
            return null;
        }
        return value.isTextual() ? value.asText() : value.toString();
    }

    private record ProviderTestRequest(String kind, @JsonProperty("runtime_config") RuntimeModelConfig runtimeConfig) {
    }

    private record RagDeleteRequest(@JsonProperty("runtime_config") RuntimeModelConfig runtimeConfig) {
    }

    private record RagRuntimeConfigRequest(@JsonProperty("runtime_config") RuntimeModelConfig runtimeConfig) {
    }
}
