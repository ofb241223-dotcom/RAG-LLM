package com.example.ragllm.settings;

import java.util.Optional;

interface SettingsRepository {
    Optional<SystemSettings> find();

    SystemSettings save(SystemSettings settings);
}
