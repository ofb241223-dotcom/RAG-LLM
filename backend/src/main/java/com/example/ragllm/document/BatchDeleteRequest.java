package com.example.ragllm.document;

import java.util.List;

public record BatchDeleteRequest(List<Long> ids) {
    public BatchDeleteRequest {
        ids = ids == null ? List.of() : List.copyOf(ids);
    }
}
