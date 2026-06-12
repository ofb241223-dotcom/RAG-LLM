package com.example.ragllm.settings;

public record ModelOptionDto(
        String provider,
        String model,
        String label,
        boolean free,
        boolean recommended,
        String note
) {
}
