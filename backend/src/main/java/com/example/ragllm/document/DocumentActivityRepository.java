package com.example.ragllm.document;

import java.util.List;

public interface DocumentActivityRepository {
    DocumentActivityRecord save(DocumentActivityRecord activity);

    List<DocumentActivityRecord> findRecent(int limit);

    boolean exists(DocumentActivityRecord activity);
}
