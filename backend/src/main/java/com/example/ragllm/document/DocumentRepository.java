package com.example.ragllm.document;

import java.util.List;
import java.util.Optional;

public interface DocumentRepository {
    DocumentRecord save(DocumentRecord document);

    Optional<DocumentRecord> findById(Long id);

    List<DocumentRecord> findAll();

    Optional<DocumentRecord> deleteById(Long id);
}
