package com.example.ragllm.document;

import java.util.Arrays;
import java.util.Locale;

public enum DocumentFormat {
    PDF,
    TXT,
    DOCX,
    DOC;

    public static DocumentFormat fromFilename(String filename) {
        if (filename == null || filename.isBlank() || !filename.contains(".")) {
            throw ApiException.badRequest("Unsupported document format");
        }

        String extension = filename.substring(filename.lastIndexOf('.') + 1).toUpperCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(format -> format.name().equals(extension))
                .findFirst()
                .orElseThrow(() -> ApiException.badRequest("Unsupported document format: " + extension.toLowerCase(Locale.ROOT)));
    }
}
