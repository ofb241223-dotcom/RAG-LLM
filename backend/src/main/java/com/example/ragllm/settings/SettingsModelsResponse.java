package com.example.ragllm.settings;

import java.util.List;

public record SettingsModelsResponse(
        List<ModelOptionDto> llmModels,
        List<ModelOptionDto> embeddingModels
) {
}
