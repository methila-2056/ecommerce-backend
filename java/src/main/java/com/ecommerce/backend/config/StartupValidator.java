package com.ecommerce.backend.config;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

/** Runs the startup validation (mirrors the fail-fast behaviour of env.ts). */
@Component
public class StartupValidator {

    private final AppConfig config;

    public StartupValidator(AppConfig config) {
        this.config = config;
    }

    @PostConstruct
    void validate() {
        config.validate();
    }
}
