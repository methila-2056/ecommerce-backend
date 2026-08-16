package com.ecommerce.backend.common;

/** Roles mirroring {@code src/types/roles.ts}. */
public enum Role {
    CUSTOMER,
    SELLER,
    SUPPORT,
    ADMIN;

    public static boolean isValid(String value) {
        if (value == null) {
            return false;
        }
        for (Role role : values()) {
            if (role.name().equals(value)) {
                return true;
            }
        }
        return false;
    }
}
