package com.example.ragllm.document;

import com.fasterxml.jackson.annotation.JsonAlias;
import java.util.List;

public record QaAnswer(
        String answer,
        @JsonAlias("citations") List<QaSource> sources
) {
    public QaAnswer {
        sources = sources == null ? List.of() : List.copyOf(sources);
    }
}
