package com.ecommerce.backend.modules.health;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Liveness/readiness probes matching the TS app contract:
 * {@code GET /health} -> 200 always; {@code GET /ready} -> 200 once Mongo answers.
 */
@RestController
public class HealthController {

    private final MongoTemplate mongo;
    private final Instant startedAt = Instant.now();

    public HealthController(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @GetMapping("/")
    public Map<String, Object> root() {
        return Map.of(
                "success", true,
                "message", "Service is running",
                "data", Map.of(
                        "service", "E-Commerce Backend System",
                        "version", "1.0.0",
                        "endpoints", Map.of(
                                "docs", "/api/v1/docs",
                                "health", "/health",
                                "ready", "/ready")));
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        long uptime = Duration.between(startedAt, Instant.now()).getSeconds();
        return Map.of(
                "success", true,
                "message", "Service is healthy",
                "data", Map.of(
                        "status", "ok",
                        "uptime", uptime,
                        "timestamp", Instant.now().toString()));
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, Object>> ready() {
        boolean dbOk = pingDatabase();
        HttpStatus status = dbOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
        Map<String, Object> data = Map.of(
                "status", dbOk ? "ok" : "error",
                "database", dbOk ? "up" : "down",
                "timestamp", Instant.now().toString());
        return ResponseEntity.status(status)
                .body(Map.of(
                        "success", dbOk,
                        "message", dbOk ? "Service is ready" : "Service is not ready",
                        "data", data));
    }

    private boolean pingDatabase() {
        try {
            Document result = mongo.executeCommand(new Document("ping", 1));
            return Double.valueOf(1).equals(result.get("ok"));
        } catch (RuntimeException e) {
            return false;
        }
    }
}
