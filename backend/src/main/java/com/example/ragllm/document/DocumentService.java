package com.example.ragllm.document;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
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

    public DocumentPageDto list(int page, int size, DocumentSearchCriteria criteria) {
        int safePage = Math.max(page, 0);
        int safeSize = normalizeSize(size);
        List<DocumentDto> filtered = repository.findAll().stream()
                .filter(record -> matchesCriteria(record, criteria))
                .sorted(Comparator.comparing(DocumentRecord::id).reversed())
                .map(DocumentDto::from)
                .toList();

        int fromIndex = Math.min(safePage * safeSize, filtered.size());
        int toIndex = Math.min(fromIndex + safeSize, filtered.size());
        return new DocumentPageDto(filtered.subList(fromIndex, toIndex), safePage, safeSize, filtered.size());
    }

    public DocumentStatsDto stats() {
        List<DocumentRecord> records = repository.findAll();
        long totalDocuments = records.size();
        long readyDocuments = records.stream()
                .filter(record -> record.status() == DocumentProcessingStatus.READY)
                .count();
        long vectorCount = records.stream()
                .map(DocumentRecord::vectorCount)
                .filter(count -> count != null)
                .mapToLong(Integer::longValue)
                .sum();
        double successRate = totalDocuments == 0
                ? 0.0
                : Math.round(((double) readyDocuments / totalDocuments) * 1000.0) / 10.0;
        return new DocumentStatsDto(totalDocuments, readyDocuments, successRate, vectorCount);
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

    public void delete(Long id) {
        DocumentRecord record = findRecord(id);
        deleteRagDocument(record);
        deleteStoredFile(record);
        repository.deleteById(id);
    }

    public BatchDeleteResultDto batchDelete(BatchDeleteRequest request) {
        List<Long> ids = request == null ? List.of() : request.ids();
        int deletedCount = 0;
        List<BatchDeleteFailureDto> failures = new ArrayList<>();

        for (Long id : ids) {
            try {
                if (id == null) {
                    throw ApiException.badRequest("Document id is required");
                }
                delete(id);
                deletedCount++;
            } catch (ApiException exception) {
                failures.add(new BatchDeleteFailureDto(id, exception.getMessage()));
            }
        }

        return new BatchDeleteResultDto(deletedCount, failures);
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

    private boolean matchesCriteria(DocumentRecord record, DocumentSearchCriteria criteria) {
        if (criteria == null) {
            return true;
        }
        if (criteria.status() != null && record.status() != criteria.status()) {
            return false;
        }
        if (criteria.format() != null && record.format() != criteria.format()) {
            return false;
        }
        if (criteria.source() != null && record.source() != criteria.source()) {
            return false;
        }
        if (StringUtils.hasText(criteria.keyword()) && !filenameContains(record, criteria.keyword())) {
            return false;
        }
        return uploadedAtWithinRange(record.uploadedAt(), criteria.startDate(), criteria.endDate());
    }

    private boolean filenameContains(DocumentRecord record, String keyword) {
        String filename = record.originalFilename();
        return filename != null
                && filename.toLowerCase(Locale.ROOT).contains(keyword.strip().toLowerCase(Locale.ROOT));
    }

    private boolean uploadedAtWithinRange(Instant uploadedAt, LocalDate startDate, LocalDate endDate) {
        if (uploadedAt == null) {
            return false;
        }
        Instant startInclusive = startDate == null
                ? Instant.MIN
                : startDate.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant endExclusive = endDate == null
                ? Instant.MAX
                : endDate.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        return !uploadedAt.isBefore(startInclusive) && uploadedAt.isBefore(endExclusive);
    }

    private void deleteStoredFile(DocumentRecord record) {
        try {
            storage.delete(record.storagePath());
        } catch (IOException exception) {
            throw ApiException.internal("Failed to delete stored file");
        }
    }

    private void deleteRagDocument(DocumentRecord record) {
        String documentId = StringUtils.hasText(record.ragDocumentId())
                ? record.ragDocumentId()
                : record.id() == null ? null : String.valueOf(record.id());
        if (!StringUtils.hasText(documentId)) {
            return;
        }

        try {
            ragServiceClient.deleteDocument(documentId);
        } catch (RagServiceException exception) {
            throw ApiException.badGateway("RAG service delete failed: " + exception.getMessage());
        }
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
