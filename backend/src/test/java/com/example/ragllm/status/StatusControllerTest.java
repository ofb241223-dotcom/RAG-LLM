package com.example.ragllm.status;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(StatusController.class)
class StatusControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void statusEndpointExposesBackendMetadata() throws Exception {
        mockMvc.perform(get("/api/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.service").value("rag-llm-backend"))
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.documentFormats", containsInAnyOrder("PDF", "TXT", "DOCX", "DOC")))
                .andExpect(jsonPath("$.processingStatuses",
                        containsInAnyOrder("UPLOADED", "PARSING", "EMBEDDING", "READY", "FAILED")));
    }

    @Test
    void healthEndpointReturnsUp() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
