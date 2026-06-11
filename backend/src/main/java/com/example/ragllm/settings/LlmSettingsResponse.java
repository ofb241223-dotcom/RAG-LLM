package com.example.ragllm.settings;

public record LlmSettingsResponse(
        String provider,
        String model,
        boolean apiKeyConfigured,
        String apiKeyPreview,
        double temperature,
        int maxTokens,
        double topP,
        double frequencyPenalty,
        int contextLength,
        boolean streamOutput,
        String systemPrompt
) {
}
