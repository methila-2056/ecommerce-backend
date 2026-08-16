package com.ecommerce.backend.security;

import com.ecommerce.backend.common.Role;
import java.util.List;

/** Authenticated principal extracted from a verified access token. */
public record CurrentUser(String userId, String sessionId, List<Role> roles) {

    public boolean hasRole(Role role) {
        return roles != null && roles.contains(role);
    }

    public boolean isAdmin() {
        return hasRole(Role.ADMIN);
    }

    public boolean isStaff() {
        return hasRole(Role.ADMIN) || hasRole(Role.SUPPORT);
    }
}
