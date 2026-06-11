package com.example.ragllm.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class SettingsApiTest {
    private static final String DEFAULT_SYSTEM_PROMPT = """
            你是一个严谨的文档问答助手，只能依据给定引用片段回答。
            如果无法从资料中读取答案,请诚实说明""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void returnsDefaultRuntimeSettingsWithoutSecretValues() throws Exception {
        mockMvc.perform(get("/api/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.llm.provider").value("google"))
                .andExpect(jsonPath("$.llm.model").value("gemini-3.1-flash-lite"))
                .andExpect(jsonPath("$.llm.systemPrompt").value(DEFAULT_SYSTEM_PROMPT))
                .andExpect(jsonPath("$.llm.apiKeyConfigured").value(false))
                .andExpect(jsonPath("$.embedding.provider").value("google"))
                .andExpect(jsonPath("$.embedding.model").value("gemini-embedding-001"))
                .andExpect(jsonPath("$.embedding.apiKeyConfigured").value(false))
                .andExpect(jsonPath("$.vectorStore.type").value("chroma"))
                .andExpect(jsonPath("$.vectorStore.collectionName").value("rag_documents_v1"))
                .andExpect(jsonPath("$.rag.topK").value(5))
                .andExpect(jsonPath("$.rag.chunkSize").value(500))
                .andExpect(jsonPath("$.rag.chunkOverlap").value(80));
    }

    @Test
    void savesSettingsEncryptsSecretsAndReturnsOnlyMaskedKeyState() throws Exception {
        String secret = "sk-test-secret-value";

        mockMvc.perform(put("/api/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "llm": {
                                    "provider": "openrouter",
                                    "model": "openai/gpt-oss-120b:free",
                                    "apiKey": "%s",
                                    "temperature": 0.30,
                                    "maxTokens": 2048,
                                    "topP": 0.85,
                                    "frequencyPenalty": 0.10,
                                    "contextLength": 131000,
                                    "streamOutput": true,
                                    "systemPrompt": "只基于文档回答。"
                                  },
                                  "embedding": {
                                    "provider": "google",
                                    "model": "gemini-embedding-001",
                                    "apiKey": "embedding-secret",
                                    "batchSize": 8
                                  },
                                  "vectorStore": {
                                    "type": "chroma",
                                    "collectionName": "course_design_docs",
                                    "persistDir": "./rag_data/course-design"
                                  },
                                  "rag": {
                                    "topK": 6,
                                    "scoreThreshold": 0.30,
                                    "chunkSize": 600,
                                    "chunkOverlap": 90,
                                    "currentDocumentOnly": true,
                                    "showCitations": true
                                  }
                                }
                                """.formatted(secret)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.llm.provider").value("openrouter"))
                .andExpect(jsonPath("$.llm.apiKeyConfigured").value(true))
                .andExpect(jsonPath("$.llm.apiKeyPreview").value("••••••••已配置"))
                .andExpect(jsonPath("$.llm.apiKey").doesNotExist())
                .andExpect(jsonPath("$.embedding.apiKeyConfigured").value(true))
                .andExpect(jsonPath("$.vectorStore.collectionName").value("course_design_docs"))
                .andExpect(jsonPath("$.vectorStore.persistDir").value("./rag_data/course-design"));

        String stored = jdbcTemplate.queryForObject(
                "SELECT llm_api_key_encrypted FROM system_settings WHERE id = 1",
                String.class
        );
        assertThat(stored).isNotBlank();
        assertThat(stored).doesNotContain(secret);

        mockMvc.perform(get("/api/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.llm.apiKeyConfigured").value(true))
                .andExpect(jsonPath("$.llm.apiKeyPreview").value("••••••••已配置"))
                .andExpect(jsonPath("$.llm.apiKey").doesNotExist());
    }

    @Test
    void blankApiKeyOnSaveKeepsPreviousEncryptedSecret() throws Exception {
        mockMvc.perform(put("/api/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "llm": {"provider": "openrouter", "model": "moonshotai/kimi-k2.6:free", "apiKey": "first-key"},
                                  "embedding": {"provider": "google", "model": "gemini-embedding-001", "apiKey": "embedding-key"},
                                  "vectorStore": {"type": "chroma", "collectionName": "rag_documents_v1", "persistDir": "./rag_data/chroma"},
                                  "rag": {"topK": 5, "scoreThreshold": 0.25, "chunkSize": 500, "chunkOverlap": 80}
                                }
                                """))
                .andExpect(status().isOk());
        String before = jdbcTemplate.queryForObject("SELECT llm_api_key_encrypted FROM system_settings WHERE id = 1", String.class);

        mockMvc.perform(put("/api/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "llm": {"provider": "openrouter", "model": "nvidia/nemotron-3-ultra-550b-a55b:free", "apiKey": ""},
                                  "embedding": {"provider": "google", "model": "gemini-embedding-001", "apiKey": ""},
                                  "vectorStore": {"type": "chroma", "collectionName": "rag_documents_v1", "persistDir": "./rag_data/chroma"},
                                  "rag": {"topK": 4, "scoreThreshold": 0.20, "chunkSize": 500, "chunkOverlap": 80}
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.llm.model").value("nvidia/nemotron-3-ultra-550b-a55b:free"))
                .andExpect(jsonPath("$.llm.apiKeyConfigured").value(true));

        String after = jdbcTemplate.queryForObject("SELECT llm_api_key_encrypted FROM system_settings WHERE id = 1", String.class);
        assertThat(after).isEqualTo(before);
    }
}
