package com.example.ragllm.document;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/qa")
public class QaController {
    private final DocumentService documentService;

    public QaController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @PostMapping("/ask")
    public QaAnswer ask(@RequestBody(required = false) QaAskRequest request) {
        return documentService.ask(request);
    }
}
