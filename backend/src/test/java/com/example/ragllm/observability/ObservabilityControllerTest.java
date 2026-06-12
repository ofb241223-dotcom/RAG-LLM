package com.example.ragllm.observability;

import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.ragllm.config.WebCorsConfiguration;
import com.example.ragllm.status.StatusController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest({StatusController.class, ObservabilityController.class})
@Import({WebCorsConfiguration.class, RequestLogStore.class, ApiRequestLoggingFilter.class})
class ObservabilityControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RequestLogStore requestLogStore;

    @BeforeEach
    void clearLogs() {
        requestLogStore.clear();
    }

    @Test
    void recordsRecentBackendApiRequests() throws Exception {
        mockMvc.perform(get("/api/status"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/observability/requests")
                        .param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].direction").value("INBOUND"))
                .andExpect(jsonPath("$[0].service").value("Spring Boot"))
                .andExpect(jsonPath("$[0].method").value("GET"))
                .andExpect(jsonPath("$[0].path").value("/api/status"))
                .andExpect(jsonPath("$[0].status").value(200))
                .andExpect(jsonPath("$[0].durationMs").value(greaterThanOrEqualTo(0)));
    }

    @Test
    void clearsRequestLogsForDemonstrations() throws Exception {
        mockMvc.perform(get("/api/status"))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/observability/requests"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/observability/requests"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", empty()));
    }
}
