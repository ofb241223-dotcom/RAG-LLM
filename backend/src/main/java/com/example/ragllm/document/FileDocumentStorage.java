package com.example.ragllm.document;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

public class FileDocumentStorage {
    private final Path uploadDir;

    public FileDocumentStorage(Path uploadDir) {
        this.uploadDir = uploadDir.toAbsolutePath().normalize();
    }

    public Path store(MultipartFile file, Long documentId, String originalFilename) throws IOException {
        Files.createDirectories(uploadDir);

        String cleanName = StringUtils.cleanPath(originalFilename == null ? "document" : originalFilename);
        String safeName = cleanName.replaceAll("[^A-Za-z0-9._-]", "_");
        Path target = uploadDir.resolve(documentId + "-" + safeName).normalize();
        if (!target.startsWith(uploadDir)) {
            throw new IOException("Invalid upload path");
        }
        file.transferTo(target);
        return target;
    }
}
