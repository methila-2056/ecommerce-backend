package com.ecommerce.backend.modules.audit;

import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

/** Records security- and money-relevant actions (mirrors {@code shared/utils/audit.ts}). */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final MongoTemplate mongo;

    public AuditService(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    public void log(String action, String actorUserId, String ip, Map<String, Object> metadata) {
        try {
            AuditLog entry = new AuditLog();
            entry.action = action;
            entry.actorUserId = actorUserId;
            entry.ip = ip;
            entry.metadata = metadata;
            entry.timestamp = Instant.now();
            mongo.insert(entry);
        } catch (RuntimeException e) {
            // Auditing must never break the request it is observing.
            log.warn("Failed to persist audit log for action {}", action, e);
        }
    }
}
