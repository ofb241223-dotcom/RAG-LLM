package com.example.ragllm.document;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpEntity;
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

    private final RestClient restClient;

    public RestClientRagServiceClient(RestClient restClient) {
        this.restClient = restClient;
    }

    @Override
    public RagIngestResponse ingest(RagIngestRequest request) {
        try {
            MultiValueMap<String, Object> body = buildIngestBody(request);
            RagIngestResponse response = restClient.post()
                    .uri("/documents/ingest")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(RagIngestResponse.class);
            if (response == null) {
                throw new RagServiceException("RAG service returned an empty ingest response");
            }
            return response;
        } catch (RestClientResponseException exception) {
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (RestClientException exception) {
            throw new RagServiceException("RAG service request failed", exception);
        }
    }

    private MultiValueMap<String, Object> buildIngestBody(RagIngestRequest request) {
        if (!StringUtils.hasText(request.storagePath())) {
            throw new RagServiceException("Document storage path is missing");
        }

        String filename = StringUtils.hasText(request.originalFilename())
                ? request.originalFilename()
                : "document";
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("document_id", String.valueOf(request.documentId()));

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
    public QaAnswer ask(QaAskRequest request) {
        try {
            QaAnswer response = restClient.post()
                    .uri("/qa")
                    .body(request)
                    .retrieve()
                    .body(QaAnswer.class);
            if (response == null) {
                throw new RagServiceException("RAG service returned an empty QA response");
            }
            return response;
        } catch (RestClientResponseException exception) {
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (RestClientException exception) {
            throw new RagServiceException("RAG service request failed", exception);
        }
    }

    @Override
    public void deleteDocument(String documentId) {
        if (!StringUtils.hasText(documentId)) {
            throw new RagServiceException("Document id is missing");
        }

        try {
            restClient.delete()
                    .uri("/documents/{documentId}", documentId)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            if (isNotFound(exception.getStatusCode())) {
                return;
            }
            throw new RagServiceException(extractErrorMessage(exception), exception);
        } catch (RestClientException exception) {
            throw new RagServiceException("RAG service request failed", exception);
        }
    }

    private boolean isNotFound(HttpStatusCode statusCode) {
        return statusCode != null && statusCode.value() == 404;
    }

    private String extractErrorMessage(RestClientResponseException exception) {
        String fallback = "RAG service request failed with status " + exception.getStatusCode().value();
        String body = exception.getResponseBodyAsString();
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
}
