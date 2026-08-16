package com.ecommerce.backend.modules.user;

import com.ecommerce.backend.common.Role;
import java.util.List;

/** Shape of a user as it leaves the service layer (never the raw document, so
 * the password hash cannot leak). Mirrors {@code UserPublic}. */
public record UserPublic(
        String id,
        String name,
        String email,
        String phone,
        List<Role> roles,
        String status,
        boolean emailVerified,
        String createdAt) {

    public static UserPublic from(User user) {
        return new UserPublic(
                user.id,
                user.name,
                user.email,
                user.phone,
                user.roles,
                user.status,
                user.isEmailVerified(),
                user.createdAt == null ? null : user.createdAt.toString());
    }
}
