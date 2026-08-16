package com.ecommerce.backend.modules.audit;

import java.time.Instant;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** Audit-log entry (mirrors {@code audit-log.model.ts}). */
@Document(collection = "auditlogs")
public class AuditLog {

    @Id
    public String id;

    public String action;

    public String actorUserId;

    public String ip;

    public Map<String, Object> metadata;

    public Instant timestamp;
}
