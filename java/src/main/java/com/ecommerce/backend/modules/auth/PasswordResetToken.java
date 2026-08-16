package com.ecommerce.backend.modules.auth;

import java.time.Instant;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Password reset token (mirrors {@code password-reset-token.model.ts}). */
@Document(collection = "passwordresettokens")
public class PasswordResetToken {

    @Id
    public String id;

    /** SHA-256 of the raw token — the raw value is never stored. */
    public String tokenHash;

    @Indexed
    public String userId;

    @Indexed(expireAfterSeconds = 0)
    public Instant expiresAt;

    public Instant usedAt;

    @CreatedDate
    public Instant createdAt;
}
