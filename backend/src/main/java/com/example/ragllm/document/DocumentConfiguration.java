package com.example.ragllm.document;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class DocumentConfiguration {

    @Bean
    DocumentRepository documentRepository(JdbcTemplate jdbcTemplate) {
        return new JdbcDocumentRepository(jdbcTemplate);
    }

    @Bean
    DocumentActivityRepository documentActivityRepository(JdbcTemplate jdbcTemplate) {
        return new JdbcDocumentActivityRepository(jdbcTemplate);
    }

    @Bean
    DocumentProcessingStepRepository documentProcessingStepRepository(JdbcTemplate jdbcTemplate) {
        return new JdbcDocumentProcessingStepRepository(jdbcTemplate);
    }

    @Bean
    Executor documentProcessingExecutor() {
        return Executors.newFixedThreadPool(3);
    }

    @Bean
    FileDocumentStorage fileDocumentStorage(
            @Value("${rag.storage.upload-dir:${UPLOAD_STORAGE_DIR:../uploads}}") String uploadDir
    ) {
        return new FileDocumentStorage(Path.of(uploadDir));
    }

    @Bean
    RagServiceClient ragServiceClient(
            @Value("${rag.service.base-url:${RAG_SERVICE_URL:http://localhost:8000}}") String baseUrl,
            @Value("${rag.service.connect-timeout-seconds:${RAG_SERVICE_CONNECT_TIMEOUT_SECONDS:3}}") long connectTimeoutSeconds,
            @Value("${rag.service.read-timeout-seconds:${RAG_SERVICE_READ_TIMEOUT_SECONDS:180}}") long readTimeoutSeconds
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(connectTimeoutSeconds));
        requestFactory.setReadTimeout(Duration.ofSeconds(readTimeoutSeconds));

        RestClient restClient = RestClient.builder()
                .baseUrl(stripTrailingSlash(baseUrl))
                .requestFactory(requestFactory)
                .build();
        return new RestClientRagServiceClient(restClient);
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    private static String stripTrailingSlash(String baseUrl) {
        String trimmed = baseUrl == null || baseUrl.isBlank()
                ? "http://localhost:8000"
                : baseUrl.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }
}
