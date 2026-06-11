package com.example.ragllm.document;

public record ChatCitationRecord(
        Long id,
        Long messageId,
        Long documentId,
        String filename,
        String chunkId,
        Double score,
        String text,
        Integer page,
        int markerIndex
) {
}
