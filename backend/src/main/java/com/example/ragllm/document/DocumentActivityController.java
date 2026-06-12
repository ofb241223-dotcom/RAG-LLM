package com.example.ragllm.document;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/documents/activity")
public class DocumentActivityController {
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;

    private final DocumentActivityRepository activityRepository;

    public DocumentActivityController(DocumentActivityRepository activityRepository) {
        this.activityRepository = activityRepository;
    }

    @GetMapping
    public List<DocumentActivityDto> recent(@RequestParam(defaultValue = "50") int limit) {
        int safeLimit = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
        return activityRepository.findRecent(safeLimit).stream()
                .map(DocumentActivityDto::from)
                .toList();
    }
}
