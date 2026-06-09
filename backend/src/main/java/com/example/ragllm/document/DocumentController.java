package com.example.ragllm.document;

import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {
    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentDto upload(@RequestParam("file") MultipartFile file) {
        return documentService.upload(file);
    }

    @GetMapping
    public DocumentPageDto list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) DocumentProcessingStatus status,
            @RequestParam(required = false) DocumentFormat format,
            @RequestParam(required = false) DocumentSource source,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate
    ) {
        return documentService.list(page, size, new DocumentSearchCriteria(
                format,
                status,
                source,
                keyword,
                startDate,
                endDate
        ));
    }

    @GetMapping("/stats")
    public DocumentStatsDto stats() {
        return documentService.stats();
    }

    @GetMapping("/{id}")
    public DocumentDto get(@PathVariable Long id) {
        return documentService.get(id);
    }

    @PostMapping("/{id}/ingest")
    public DocumentDto ingest(@PathVariable Long id) {
        return documentService.ingest(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        documentService.delete(id);
    }

    @PostMapping("/batch-delete")
    public BatchDeleteResultDto batchDelete(@RequestBody BatchDeleteRequest request) {
        return documentService.batchDelete(request);
    }
}
