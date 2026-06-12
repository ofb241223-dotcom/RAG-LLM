package com.example.ragllm.document;

import java.time.Instant;

public record DocumentActivityRecord(
        Long id,
        String label,
        DocumentActivityTone tone,
        Instant occurredAt
) {
    static DocumentActivityRecord uploaded(String filename, Instant occurredAt) {
        return new DocumentActivityRecord(
                null,
                "上传了文档《" + filename + "》",
                DocumentActivityTone.BLUE,
                occurredAt
        );
    }

    static DocumentActivityRecord deleted(String filename, Instant occurredAt) {
        return new DocumentActivityRecord(
                null,
                "删除了文档《" + filename + "》",
                DocumentActivityTone.RED,
                occurredAt
        );
    }

    DocumentActivityRecord withId(Long id) {
        return new DocumentActivityRecord(id, label, tone, occurredAt);
    }
}
