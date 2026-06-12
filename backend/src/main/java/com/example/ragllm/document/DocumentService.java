package com.example.ragllm.document;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executor;
import com.example.ragllm.settings.SettingsService;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class DocumentService {
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;
    private static final ZoneId DOCUMENT_DATE_ZONE = ZoneId.of("Asia/Shanghai");

    private final DocumentRepository repository;
    private final FileDocumentStorage storage;
    private final RagServiceClient ragServiceClient;
    private final Clock clock;
    private final SettingsService settingsService;
    private final DocumentActivityRepository activityRepository;
    private final DocumentProcessingStepRepository processingStepRepository;
    private final Executor documentProcessingExecutor;

    public DocumentService(
            DocumentRepository repository,
            FileDocumentStorage storage,
            RagServiceClient ragServiceClient,
            Clock clock,
            SettingsService settingsService,
            DocumentActivityRepository activityRepository,
            DocumentProcessingStepRepository processingStepRepository,
            Executor documentProcessingExecutor
    ) {
        this.repository = repository;
        this.storage = storage;
        this.ragServiceClient = ragServiceClient;
        this.clock = clock;
        this.settingsService = settingsService;
        this.activityRepository = activityRepository;
        this.processingStepRepository = processingStepRepository;
        this.documentProcessingExecutor = documentProcessingExecutor;
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
            activityRepository.save(DocumentActivityRecord.uploaded(record.originalFilename(), record.uploadedAt()));
            processingStepRepository.initializeForUpload(record, clock.instant());
        } catch (IOException exception) {
            repository.deleteById(record.id());
            throw ApiException.internal("Failed to store uploaded file");
        }

        return startProcessing(record.id(), false);
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
                .filter(record -> record.status() == DocumentProcessingStatus.READY)
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

    public List<DocumentChunkDto> chunks(Long id) {
        DocumentRecord record = findRecord(id);
        String ragDocumentId = StringUtils.hasText(record.ragDocumentId())
                ? record.ragDocumentId()
                : record.id() == null ? null : String.valueOf(record.id());
        if (!StringUtils.hasText(ragDocumentId)) {
            return List.of();
        }

        try {
            return ragServiceClient.listChunks(ragDocumentId, settingsService.currentRuntimeConfig());
        } catch (RagServiceException exception) {
            throw ApiException.badGateway("RAG service chunks failed: " + exception.getMessage());
        }
    }

    public DownloadedDocument download(Long id) {
        DocumentRecord record = findRecord(id);
        try {
            return new DownloadedDocument(record.originalFilename(), record.format(), storage.load(record.storagePath()));
        } catch (IOException exception) {
            throw ApiException.notFound("Stored document file not found: " + id);
        }
    }

    public DocumentDto ingest(Long id) {
        return startProcessing(id, true);
    }

    public List<DocumentProcessingStepDto> processingSteps(Long id) {
        findRecord(id);
        return processingStepRepository.findByDocumentId(id).stream()
                .map(DocumentProcessingStepDto::from)
                .toList();
    }

    private DocumentDto startProcessing(Long id, boolean resetSteps) {
        DocumentRecord record = repository.save(findRecord(id).parsing(clock.instant()));
        if (resetSteps) {
            processingStepRepository.resetForProcessing(record, clock.instant());
        }
        documentProcessingExecutor.execute(() -> processDocument(id));
        return DocumentDto.from(record);
    }

    private void processDocument(Long id) {
        DocumentRecord record = repository.save(findRecord(id).parsing(clock.instant()));
        try {
            RagIngestResponse response = ragServiceClient.ingestWithProgress(
                    RagIngestRequest.from(record),
                    settingsService.currentRuntimeConfig(),
                    event -> handleIngestEvent(id, event)
            );
            repository.save(findRecord(id).ready(response, clock.instant()));
        } catch (RagServiceException exception) {
            processingStepRepository.markFailed(id, failedStep(findRecord(id)), exception.getMessage(), clock.instant());
            repository.save(findRecord(id).failed(exception.getMessage(), clock.instant()));
        }
    }

    private void handleIngestEvent(Long id, RagIngestEvent event) {
        String stage = event.stage() == null ? "" : event.stage().toLowerCase(Locale.ROOT);
        Instant now = clock.instant();
        switch (stage) {
            case "extract" -> {
                processingStepRepository.markComplete(id, DocumentProcessingStepDefinition.EXTRACT, detailOr(event, "文本提取完成"), now);
                processingStepRepository.markActive(id, DocumentProcessingStepDefinition.SPLIT, now);
            }
            case "split" -> {
                processingStepRepository.markComplete(id, DocumentProcessingStepDefinition.SPLIT, detailOr(event, "文本分块完成"), now);
                processingStepRepository.markActive(id, DocumentProcessingStepDefinition.VECTOR, now);
                repository.save(findRecord(id).embedding(now));
            }
            case "vector" -> {
                processingStepRepository.markComplete(id, DocumentProcessingStepDefinition.VECTOR, detailOr(event, "向量化处理完成"), now);
                processingStepRepository.markActive(id, DocumentProcessingStepDefinition.INDEX, now);
            }
            case "index" -> {
                processingStepRepository.markComplete(id, DocumentProcessingStepDefinition.INDEX, detailOr(event, "索引构建完成"), now);
                processingStepRepository.markActive(id, DocumentProcessingStepDefinition.STORED, now);
            }
            case "done" -> {
                processingStepRepository.markComplete(id, DocumentProcessingStepDefinition.STORED, "向量已存储并可检索", now);
            }
            default -> {
                // Ignore unknown progress events for forward compatibility.
            }
        }
    }

    private String detailOr(RagIngestEvent event, String fallback) {
        return StringUtils.hasText(event.detail()) ? event.detail() : fallback;
    }

    private DocumentProcessingStepDefinition failedStep(DocumentRecord record) {
        if (record.status() == DocumentProcessingStatus.EMBEDDING) {
            return DocumentProcessingStepDefinition.VECTOR;
        }
        return DocumentProcessingStepDefinition.EXTRACT;
    }

    public void delete(Long id) {
        DocumentRecord record = findRecord(id);
        deleteRagDocument(record);
        deleteStoredFile(record);
        ensureUploadActivity(record);
        repository.deleteById(id);
        activityRepository.save(DocumentActivityRecord.deleted(record.originalFilename(), clock.instant()));
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

        var runtimeConfig = settingsService.currentRuntimeConfig();
        Integer topK = request.topK() == null || request.topK() <= 0 ? runtimeConfig.topK() : request.topK();
        List<Long> documentIds = runtimeConfig.currentDocumentOnly()
                ? request.documentIds() == null ? List.of() : request.documentIds()
                : null;
        QaAskRequest normalizedRequest = new QaAskRequest(
                request.question().strip(),
                documentIds,
                topK
        );

        try {
            QaAnswer answer = ragServiceClient.ask(normalizedRequest, runtimeConfig);
            return runtimeConfig.showCitations() ? answer : new QaAnswer(answer.answer(), List.of());
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
                : startDate.atStartOfDay(DOCUMENT_DATE_ZONE).toInstant();
        Instant endExclusive = endDate == null
                ? Instant.MAX
                : endDate.plusDays(1).atStartOfDay(DOCUMENT_DATE_ZONE).toInstant();
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
                : hasIndexedContent(record) && record.id() != null ? String.valueOf(record.id()) : null;
        if (!StringUtils.hasText(documentId)) {
            return;
        }

        try {
            ragServiceClient.deleteDocument(documentId, settingsService.currentRuntimeConfig());
        } catch (RagServiceException exception) {
            throw ApiException.badGateway("RAG service delete failed: " + exception.getMessage());
        }
    }

    private void ensureUploadActivity(DocumentRecord record) {
        DocumentActivityRecord uploadedActivity = DocumentActivityRecord.uploaded(record.originalFilename(), record.uploadedAt());
        if (!activityRepository.exists(uploadedActivity)) {
            activityRepository.save(uploadedActivity);
        }
    }

    private boolean hasIndexedContent(DocumentRecord record) {
        return (record.chunkCount() != null && record.chunkCount() > 0)
                || (record.vectorCount() != null && record.vectorCount() > 0);
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

    public record DownloadedDocument(String filename, DocumentFormat format, Resource resource) {
    }
}
