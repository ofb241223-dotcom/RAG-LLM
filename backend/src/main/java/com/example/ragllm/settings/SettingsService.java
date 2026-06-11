package com.example.ragllm.settings;

import com.example.ragllm.document.DocumentProcessingStatus;
import com.example.ragllm.document.DocumentRepository;
import com.example.ragllm.document.RagServiceClient;
import com.example.ragllm.document.RagServiceException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class SettingsService {
    private static final String MASKED_KEY = "••••••••已配置";

    private final SettingsRepository repository;
    private final DocumentRepository documentRepository;
    private final SettingsCrypto crypto;
    private final Clock clock;
    private final RagServiceClient ragServiceClient;

    public SettingsService(
            SettingsRepository repository,
            DocumentRepository documentRepository,
            SettingsCrypto crypto,
            Clock clock,
            RagServiceClient ragServiceClient
    ) {
        this.repository = repository;
        this.documentRepository = documentRepository;
        this.crypto = crypto;
        this.clock = clock;
        this.ragServiceClient = ragServiceClient;
    }

    public SettingsResponse get() {
        return toResponse(current());
    }

    public SettingsModelsResponse models() {
        return new SettingsModelsResponse(
                List.of(
                        new ModelOptionDto("google", "gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite", false, true, "当前默认，速度和额度更适合本项目"),
                        new ModelOptionDto("google", "gemini-2.5-flash", "Gemini 2.5 Flash", false, false, "Google AI Studio 候选模型"),
                        new ModelOptionDto("google", "gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite", false, false, "Google AI Studio 候选模型"),
                        new ModelOptionDto("google", "gemini-3-flash", "Gemini 3 Flash", false, false, "Google AI Studio 候选模型"),
                        new ModelOptionDto("google", "gemini-3.5-flash", "Gemini 3.5 Flash", false, false, "Google AI Studio 候选模型"),
                        new ModelOptionDto("openrouter", "openai/gpt-oss-120b:free", "openai/gpt-oss-120b", true, false, "OpenRouter 端点，保存前建议先测试"),
                        new ModelOptionDto("openrouter", "moonshotai/kimi-k2.6:free", "moonshotai/kimi-k2.6", true, false, "OpenRouter 端点，保存前建议先测试"),
                        new ModelOptionDto("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3-ultra-550b-a55b", true, false, "OpenRouter 端点，保存前建议先测试")
                ),
                List.of(
                        new ModelOptionDto("google", "gemini-embedding-001", "Gemini Embedding 001", false, true, "当前默认，已验证可用"),
                        new ModelOptionDto("google", "gemini-embedding-2", "Gemini Embedding 2", false, false, "保存前建议先测试连接"),
                        new ModelOptionDto("google", "gemini-embedding-002", "Gemini Embedding 002", false, false, "Google AI Studio embedding 候选模型"),
                        new ModelOptionDto("openrouter", "nvidia/llama-nemotron-embed-vl-1b-v2:free", "nvidia/llama-nemotron-embed-vl-1b-v2", true, false, "OpenRouter embedding 端点，保存前建议先测试")
                )
        );
    }

    public SettingsResponse save(SettingsUpdateRequest request) {
        SystemSettings before = current();
        SystemSettings after = merge(before, request, clock.instant());
        repository.save(after);
        if (requiresReprocess(before, after)) {
            documentRepository.markReadyDocumentsForReprocess();
        }
        return toResponse(after);
    }

    public SettingsTestResponse test(SettingsTestRequest request) {
        String kind = StringUtils.hasText(request == null ? null : request.kind()) ? request.kind().strip() : "status";
        SystemSettings settings = request == null || request.settings() == null ? current() : merge(current(), request.settings(), clock.instant());
        try {
            return ragServiceClient.testProvider(kind, toRuntimeConfig(settings));
        } catch (RagServiceException exception) {
            RuntimeModelConfig runtimeConfig = toRuntimeConfig(settings);
            return new SettingsTestResponse(
                    kind,
                    false,
                    exception.getMessage(),
                    runtimeConfig.llmModel(),
                    runtimeConfig.embeddingModel()
            );
        }
    }

    public RuntimeModelConfig currentRuntimeConfig() {
        return toRuntimeConfig(current());
    }

    private SystemSettings current() {
        return repository.find().orElseGet(() -> repository.save(JdbcSettingsRepository.defaults(clock.instant())));
    }

    private SystemSettings merge(SystemSettings current, SettingsUpdateRequest request, Instant now) {
        LlmSettingsRequest llm = request == null ? null : request.llm();
        EmbeddingSettingsRequest embedding = request == null ? null : request.embedding();
        VectorStoreSettingsDto vectorStore = request == null ? null : request.vectorStore();
        RagSettingsDto rag = request == null ? null : request.rag();

        return new SystemSettings(
                textOr(current.llmProvider(), llm == null ? null : llm.provider()),
                textOr(current.llmModel(), llm == null ? null : llm.model()),
                secretOrCurrent(current.llmApiKeyEncrypted(), llm == null ? null : llm.apiKey()),
                doubleOr(current.temperature(), llm == null ? null : llm.temperature()),
                intOr(current.maxTokens(), llm == null ? null : llm.maxTokens()),
                doubleOr(current.topP(), llm == null ? null : llm.topP()),
                doubleOr(current.frequencyPenalty(), llm == null ? null : llm.frequencyPenalty()),
                intOr(current.contextLength(), llm == null ? null : llm.contextLength()),
                boolOr(current.streamOutput(), llm == null ? null : llm.streamOutput()),
                textOr(current.systemPrompt(), llm == null ? null : llm.systemPrompt()),
                textOr(current.embeddingProvider(), embedding == null ? null : embedding.provider()),
                textOr(current.embeddingModel(), embedding == null ? null : embedding.model()),
                secretOrCurrent(current.embeddingApiKeyEncrypted(), embedding == null ? null : embedding.apiKey()),
                intOr(current.embeddingBatchSize(), embedding == null ? null : embedding.batchSize()),
                textOr(current.vectorStoreType(), vectorStore == null ? null : vectorStore.type()).toLowerCase(),
                textOr(current.vectorCollectionName(), vectorStore == null ? null : vectorStore.collectionName()),
                textOr(current.vectorPersistDir(), vectorStore == null ? null : vectorStore.persistDir()),
                intOr(current.topK(), rag == null ? null : rag.topK()),
                doubleOr(current.scoreThreshold(), rag == null ? null : rag.scoreThreshold()),
                intOr(current.chunkSize(), rag == null ? null : rag.chunkSize()),
                intOr(current.chunkOverlap(), rag == null ? null : rag.chunkOverlap()),
                boolOr(current.currentDocumentOnly(), rag == null ? null : rag.currentDocumentOnly()),
                boolOr(current.showCitations(), rag == null ? null : rag.showCitations()),
                now,
                "张同学"
        );
    }

    private boolean requiresReprocess(SystemSettings before, SystemSettings after) {
        return !before.embeddingProvider().equals(after.embeddingProvider())
                || !before.embeddingModel().equals(after.embeddingModel())
                || !before.vectorStoreType().equals(after.vectorStoreType())
                || !before.vectorCollectionName().equals(after.vectorCollectionName())
                || !before.vectorPersistDir().equals(after.vectorPersistDir())
                || before.chunkSize() != after.chunkSize()
                || before.chunkOverlap() != after.chunkOverlap();
    }

    private SettingsResponse toResponse(SystemSettings settings) {
        int reprocessRequired = (int) documentRepository.findAll().stream()
                .filter(document -> document.status() == DocumentProcessingStatus.REPROCESS_REQUIRED)
                .count();
        return new SettingsResponse(
                new LlmSettingsResponse(
                        settings.llmProvider(),
                        settings.llmModel(),
                        StringUtils.hasText(settings.llmApiKeyEncrypted()),
                        StringUtils.hasText(settings.llmApiKeyEncrypted()) ? MASKED_KEY : "",
                        settings.temperature(),
                        settings.maxTokens(),
                        settings.topP(),
                        settings.frequencyPenalty(),
                        settings.contextLength(),
                        settings.streamOutput(),
                        settings.systemPrompt()
                ),
                new EmbeddingSettingsResponse(
                        settings.embeddingProvider(),
                        settings.embeddingModel(),
                        StringUtils.hasText(settings.embeddingApiKeyEncrypted()),
                        StringUtils.hasText(settings.embeddingApiKeyEncrypted()) ? MASKED_KEY : "",
                        settings.embeddingBatchSize(),
                        reprocessRequired
                ),
                new VectorStoreSettingsDto(
                        settings.vectorStoreType(),
                        settings.vectorCollectionName(),
                        settings.vectorPersistDir()
                ),
                new RagSettingsDto(
                        settings.topK(),
                        settings.scoreThreshold(),
                        settings.chunkSize(),
                        settings.chunkOverlap(),
                        settings.currentDocumentOnly(),
                        settings.showCitations()
                ),
                settings.updatedAt(),
                settings.updatedBy()
        );
    }

    private RuntimeModelConfig toRuntimeConfig(SystemSettings settings) {
        return new RuntimeModelConfig(
                settings.llmProvider(),
                settings.llmModel(),
                null,
                settings.embeddingProvider(),
                settings.embeddingModel(),
                null,
                settings.vectorStoreType(),
                settings.vectorCollectionName(),
                settings.vectorPersistDir(),
                settings.temperature(),
                settings.maxTokens(),
                settings.topP(),
                settings.frequencyPenalty(),
                settings.systemPrompt(),
                settings.topK(),
                settings.scoreThreshold(),
                settings.chunkSize(),
                settings.chunkOverlap(),
                settings.contextLength(),
                settings.streamOutput(),
                settings.embeddingBatchSize(),
                settings.currentDocumentOnly(),
                settings.showCitations()
        );
    }

    private String secretOrCurrent(String current, String candidate) {
        return StringUtils.hasText(candidate) ? crypto.encrypt(candidate.strip()) : current;
    }

    private static String textOr(String current, String candidate) {
        return StringUtils.hasText(candidate) ? candidate.strip() : current;
    }

    private static int intOr(int current, Integer candidate) {
        return candidate == null ? current : candidate;
    }

    private static double doubleOr(double current, Double candidate) {
        return candidate == null ? current : candidate;
    }

    private static boolean boolOr(boolean current, Boolean candidate) {
        return candidate == null ? current : candidate;
    }
}
