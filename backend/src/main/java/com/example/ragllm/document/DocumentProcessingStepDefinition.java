package com.example.ragllm.document;

enum DocumentProcessingStepDefinition {
    UPLOAD("upload", "文件上传", "文件上传成功", "等待文件上传", 1),
    EXTRACT("extract", "文本提取", "等待提取文本内容", "等待提取文本内容", 2),
    SPLIT("split", "文本分块", "等待文本分块", "等待文本分块", 3),
    VECTOR("vector", "向量化处理", "等待生成向量", "等待生成向量", 4),
    INDEX("index", "索引构建", "等待索引构建", "等待索引构建", 5),
    STORED("stored", "存储完成", "等待存储完成", "等待存储完成", 6);

    private final String key;
    private final String label;
    private final String completeDetail;
    private final String pendingDetail;
    private final int position;

    DocumentProcessingStepDefinition(String key, String label, String completeDetail, String pendingDetail, int position) {
        this.key = key;
        this.label = label;
        this.completeDetail = completeDetail;
        this.pendingDetail = pendingDetail;
        this.position = position;
    }

    String key() {
        return key;
    }

    String label() {
        return label;
    }

    String completeDetail() {
        return completeDetail;
    }

    String pendingDetail() {
        return pendingDetail;
    }

    int position() {
        return position;
    }
}
