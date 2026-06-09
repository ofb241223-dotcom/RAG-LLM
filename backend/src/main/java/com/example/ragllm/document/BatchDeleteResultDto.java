package com.example.ragllm.document;

import java.util.List;

public record BatchDeleteResultDto(
        int deletedCount,
        List<BatchDeleteFailureDto> failures
) {
    public BatchDeleteResultDto {
        failures = failures == null ? List.of() : List.copyOf(failures);
    }
}
