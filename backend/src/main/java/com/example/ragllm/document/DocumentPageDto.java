package com.example.ragllm.document;

import java.util.List;

public record DocumentPageDto(
        List<DocumentDto> items,
        int page,
        int size,
        long total
) {
}
