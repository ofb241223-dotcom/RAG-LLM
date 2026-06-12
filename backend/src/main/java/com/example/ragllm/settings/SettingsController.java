package com.example.ragllm.settings;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {
    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    public SettingsResponse get() {
        return settingsService.get();
    }

    @PutMapping
    public SettingsResponse save(@RequestBody(required = false) SettingsUpdateRequest request) {
        return settingsService.save(request);
    }

    @PostMapping("/test")
    public SettingsTestResponse test(@RequestBody(required = false) SettingsTestRequest request) {
        return settingsService.test(request);
    }

    @GetMapping("/models")
    public SettingsModelsResponse models() {
        return settingsService.models();
    }
}
