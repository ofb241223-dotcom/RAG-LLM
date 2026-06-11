package com.example.ragllm.document;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
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

    public void delete(String storagePath) throws IOException {
        if (!StringUtils.hasText(storagePath)) {
            return;
        }

        Path target = Path.of(storagePath).toAbsolutePath().normalize();
        if (!target.startsWith(uploadDir)) {
            throw new IOException("Invalid upload path");
        }
        Files.deleteIfExists(target);
    }

    public Resource load(String storagePath) throws IOException {
        if (!StringUtils.hasText(storagePath)) {
            throw new IOException("Document storage path is missing");
        }

        Path target = Path.of(storagePath).toAbsolutePath().normalize();
        if (!target.startsWith(uploadDir) || !Files.exists(target) || !Files.isRegularFile(target)) {
            throw new IOException("Stored document not found");
        }
        return new FileSystemResource(target);
    }
}
