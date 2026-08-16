package com.ecommerce.backend.modules.auth;

import java.time.Instant;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Refresh-token session (mirrors {@code refresh-session.model.ts}). Raw refresh
 * tokens are opaque 256-bit values, never stored: only their SHA-256 hash is
 * kept, so a leaked database cannot be replayed.
 */
@Document(collection = "refreshsessions")
public class RefreshSession {

    @Id
    public String id;

    @Indexed
    public String userId;

    /**
     * Tokens in the same rotation family share this id. If an old, already
     * rotated token is presented again, the whole family is revoked (the token
     * was almost certainly stolen) — this is the reuse-detection guard.
     */
    @Indexed
    public String familyId;

    /** SHA-256 of the raw refresh token. */
    @Indexed
    public String tokenHash;

    public String ip;

    public String userAgent;

    /** TTL index purges expired sessions automatically. */
    @Indexed(expireAfterSeconds = 0)
    public Instant expiresAt;

    public Instant revokedAt;

    public String revokedReason;

    public Instant lastUsedAt;

    @CreatedDate
    public Instant createdAt;

    @LastModifiedDate
    public Instant updatedAt;
}
