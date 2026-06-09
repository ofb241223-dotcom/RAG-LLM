package com.example.ragllm.status;

import com.example.ragllm.document.DocumentFormat;
import com.example.ragllm.document.DocumentProcessingStatus;
import java.util.Arrays;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class StatusController {

    @GetMapping("/status")
    public StatusResponse status() {
        return new StatusResponse(
                "rag-llm-backend",
                "UP",
                List.copyOf(Arrays.asList(DocumentFormat.values())),
                List.copyOf(Arrays.asList(DocumentProcessingStatus.values()))
        );
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse("UP");
    }
}
