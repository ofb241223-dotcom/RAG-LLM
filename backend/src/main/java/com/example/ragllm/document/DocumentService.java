package com.example.ragllm.document;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class DocumentService {
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int DEFAULT_TOP_K = 5;

    private final DocumentRepository repository;
    private final FileDocumentStorage storage;
    private final RagServiceClient ragServiceClient;
    private final Clock clock;

    public DocumentService(
            DocumentRepository repository,
            FileDocumentStorage storage,
            RagServiceClient ragServiceClient,
            Clock clock
    ) {
        this.repository = repository;
        this.storage = storage;
        this.ragServiceClient = ragServiceClient;
        this.clock = clock;
    }

    public DocumentDto upload(MultipartFile file) {
        validateUpload(file);

        String originalFilename = file.getOriginalFilename();
        DocumentFormat format = DocumentFormat.fromFilename(originalFilename);
        Instant now = clock.instant();
        DocumentRecord record = repository.save(DocumentRecord.uploaded(
                originalFilename,
                format,
                file.getSize(),
                now
        ));

        try {
            Path storagePath = storage.store(file, record.id(), originalFilename);
            record = repository.save(record.withStoragePath(storagePath.toString(), clock.instant()));
        } catch (IOException exception) {
            throw ApiException.internal("Failed to store uploaded file");
        }

        return ingest(record.id());
    }

    public DocumentPageDto list(int page, int size, DocumentProcessingStatus status) {
        int safePage = Math.max(page, 0);
        int safeSize = normalizeSize(size);
        List<DocumentDto> filtered = repository.findAll().stream()
                .filter(record -> status == null || record.status() == status)
                .sorted(Comparator.comparing(DocumentRecord::id).reversed())
                .map(DocumentDto::from)
                .toList();

        int fromIndex = Math.min(safePage * safeSize, filtered.size());
        int toIndex = Math.min(fromIndex + safeSize, filtered.size());
        return new DocumentPageDto(filtered.subList(fromIndex, toIndex), safePage, safeSize, filtered.size());
    }

    public DocumentDto get(Long id) {
        return DocumentDto.from(findRecord(id));
    }

    public DocumentDto ingest(Long id) {
        DocumentRecord record = repository.save(findRecord(id).parsing(clock.instant()));
        try {
            RagIngestResponse response = ragServiceClient.ingest(RagIngestRequest.from(record));
            return DocumentDto.from(repository.save(record.ready(response, clock.instant())));
        } catch (RagServiceException exception) {
            return DocumentDto.from(repository.save(record.failed(exception.getMessage(), clock.instant())));
        }
    }

    public QaAnswer ask(QaAskRequest request) {
        if (request == null || request.question() == null || request.question().isBlank()) {
            throw ApiException.badRequest("question is required");
        }

        QaAskRequest normalizedRequest = new QaAskRequest(
                request.question().strip(),
                request.documentIds() == null ? List.of() : request.documentIds(),
                request.topK() == null || request.topK() <= 0 ? DEFAULT_TOP_K : request.topK()
        );

        try {
            return ragServiceClient.ask(normalizedRequest);
        } catch (RagServiceException exception) {
            throw ApiException.badGateway("RAG service QA failed: " + exception.getMessage());
        }
    }

    private DocumentRecord findRecord(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Document not found: " + id));
    }

    private void validateUpload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Uploaded file is empty");
        }
    }

    private int normalizeSize(int size) {
        if (size <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }
}
