package com.ecommerce.backend.modules.user;

import com.ecommerce.backend.common.Role;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** User document (mirrors {@code src/modules/user/user.model.ts}). */
@Document(collection = "users")
public class User {

    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_SUSPENDED = "suspended";
    public static final String STATUS_DEACTIVATED = "deactivated";

    @Id
    public String id;

    public String name;

    /** Unique index backs fast login lookups and enforces one account per email. */
    @Indexed(unique = true)
    public String email;

    public String phone;

    public String passwordHash;

    public List<Role> roles = new ArrayList<>(List.of(Role.CUSTOMER));

    public String status = STATUS_ACTIVE;

    public Instant emailVerifiedAt;

    public String emailVerificationTokenHash;

    public Instant emailVerificationExpiresAt;

    public int failedLoginAttempts;

    public Instant lockUntil;

    public Instant lastLoginAt;

    public Instant passwordChangedAt;

    public List<Address> addresses = new ArrayList<>();

    public UserPreferences preferences = new UserPreferences();

    public Instant deactivatedAt;

    @CreatedDate
    public Instant createdAt;

    @LastModifiedDate
    public Instant updatedAt;

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
    }
}
