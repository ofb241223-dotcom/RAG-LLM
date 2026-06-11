package com.example.ragllm.document;

public record ChatCitationDto(
        String key,
        int markerIndex,
        Long documentId,
        String filename,
        String chunkId,
        Double score,
        String text,
        Integer page
) {
}
