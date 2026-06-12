package com.example.ragllm.observability;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/observability")
@Tag(name = "请求监控", description = "展示最近的后端接口、RAG 调用和模型服务调用摘要")
public class ObservabilityController {
    private final RequestLogStore requestLogStore;

    public ObservabilityController(RequestLogStore requestLogStore) {
        this.requestLogStore = requestLogStore;
    }

    @GetMapping("/requests")
    @Operation(summary = "查看最近请求", description = "返回最近的后端请求日志，敏感字段会脱敏。")
    public List<RequestLogEntry> requests(@RequestParam(defaultValue = "100") int limit) {
        return requestLogStore.recent(limit);
    }

    @DeleteMapping("/requests")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "清空请求日志", description = "用于课堂演示前清空历史请求。")
    public void clearRequests() {
        requestLogStore.clear();
    }
}
