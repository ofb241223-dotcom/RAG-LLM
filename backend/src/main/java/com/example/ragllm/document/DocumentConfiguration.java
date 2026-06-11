package com.example.ragllm.document;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
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
    FileDocumentStorage fileDocumentStorage(
            @Value("${rag.storage.upload-dir:${UPLOAD_STORAGE_DIR:../uploads}}") String uploadDir
    ) {
        return new FileDocumentStorage(Path.of(uploadDir));
    }

    @Bean
    RagServiceClient ragServiceClient(
            @Value("${rag.service.base-url:${RAG_SERVICE_URL:http://localhost:8000}}") String baseUrl
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(3));
        requestFactory.setReadTimeout(Duration.ofSeconds(30));

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
