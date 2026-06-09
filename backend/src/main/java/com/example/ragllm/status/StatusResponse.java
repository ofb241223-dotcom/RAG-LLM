package com.example.ragllm.status;

import com.example.ragllm.document.DocumentFormat;
import com.example.ragllm.document.DocumentProcessingStatus;
import java.util.List;

public record StatusResponse(
        String service,
        String status,
        List<DocumentFormat> documentFormats,
        List<DocumentProcessingStatus> processingStatuses
) {
}
