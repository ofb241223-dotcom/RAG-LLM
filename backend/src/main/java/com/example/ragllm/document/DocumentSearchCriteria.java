package com.example.ragllm.document;

import java.time.LocalDate;

public record DocumentSearchCriteria(
        DocumentFormat format,
        DocumentProcessingStatus status,
        DocumentSource source,
        String keyword,
        LocalDate startDate,
        LocalDate endDate
) {
}
