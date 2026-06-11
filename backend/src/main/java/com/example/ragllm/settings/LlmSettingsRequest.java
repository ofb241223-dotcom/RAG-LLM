package com.example.ragllm.settings;

public record LlmSettingsRequest(
        String provider,
        String model,
        String apiKey,
        Double temperature,
        Integer maxTokens,
        Double topP,
        Double frequencyPenalty,
        Integer contextLength,
        Boolean streamOutput,
        String systemPrompt
) {
}
